import * as vscode from "vscode";
import {
  orchestrate,
  recordMergePreviewDecision,
  runSecondOpinionAudit,
} from "../../orchestrate";
import { toAuditViewModel } from "../adapters/auditViewModel";
import { renderAuditPanel } from "../panels/renderAuditPanel";

interface MergeStats {
  apply: number;
  reject: number;
  lastDecision?: "apply" | "reject";
  lastDecisionAt?: string;
}

function readMergeStats(context: vscode.ExtensionContext): MergeStats {
  return (
    context.workspaceState.get<MergeStats>("mojoDojo.mergePreviewStats") ?? {
      apply: 0,
      reject: 0,
    }
  );
}

async function writeMergeStats(
  context: vscode.ExtensionContext,
  decision: "apply" | "reject",
): Promise<void> {
  const mergeStats = readMergeStats(context);
  mergeStats.apply += decision === "apply" ? 1 : 0;
  mergeStats.reject += decision === "reject" ? 1 : 0;
  mergeStats.lastDecision = decision;
  mergeStats.lastDecisionAt = new Date().toISOString();
  await context.workspaceState.update("mojoDojo.mergePreviewStats", mergeStats);
}

async function showMergeStats(context: vscode.ExtensionContext): Promise<void> {
  const stats = readMergeStats(context);
  const total = stats.apply + stats.reject;
  const applyRate = total > 0 ? ((stats.apply / total) * 100).toFixed(1) : "0.0";
  const lastDecision = stats.lastDecision
    ? `${stats.lastDecision} at ${stats.lastDecisionAt ?? "unknown time"}`
    : "none";

  void vscode.window.showInformationMessage(
    `Mojo-Dojo merge stats: Apply=${stats.apply}, Reject=${stats.reject}, Apply rate=${applyRate}%, Last decision=${lastDecision}`,
  );
}

async function runAuditFlow(context: vscode.ExtensionContext): Promise<void> {
  const userPrompt = await vscode.window.showInputBox({
    title: "Mojo-Dojo Second Opinion",
    prompt: "What do you want audited?",
    placeHolder: "e.g. Build a resilient API handler with retries and tests",
    ignoreFocusOut: true,
  });

  if (!userPrompt || userPrompt.trim().length === 0) {
    return;
  }

  const baselineOutput = await vscode.window.showInputBox({
    title: "Optional baseline output",
    prompt: "Paste your primary agent's output (optional)",
    placeHolder: "Leave empty to compare prompt and second opinion without baseline text",
    ignoreFocusOut: true,
  });

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const activeEditor = vscode.window.activeTextEditor;
  const activeSelection = activeEditor?.document.getText(activeEditor.selection).trim() ?? "";
  const activeFileText = activeEditor?.document.getText().trim() ?? "";

  const auditResult = await runSecondOpinionAudit({
    userPrompt,
    baselineOutput: baselineOutput?.trim() || undefined,
    context: {
      workspaceRoot,
    },
  });

  const orchestrationResult = await orchestrate({
    sessionId: `audit-${Date.now()}`,
    text: userPrompt,
    timestamp: new Date().toISOString(),
    context: {
      filePath: activeEditor?.document.uri.fsPath,
      selection: activeEditor?.document.getText(activeEditor.selection),
      languageId: activeEditor?.document.languageId,
    },
  });

  const trace = orchestrationResult.trace;
  const taskById = new Map((trace?.tasks ?? []).map((task) => [task.id, task]));
  const failedAgents = (trace?.results ?? [])
    .filter((result) => Boolean(result.error))
    .map((result) => {
      const task = taskById.get(result.id);
      const routedAgentId = task?.metadata?.routedAgentId;
      return typeof routedAgentId === "string" ? routedAgentId.toUpperCase() : result.agent;
    });

  const baselineCode =
    (typeof auditResult.baselineOutput === "string" && auditResult.baselineOutput.trim().length > 0
      ? auditResult.baselineOutput
      : activeSelection.length > 0
        ? activeSelection
        : activeFileText) ?? "";
  const auditCode = auditResult.comparison.secondOpinion.content;

  const viewModel = toAuditViewModel(auditResult, {
    status: orchestrationResult.status,
    engagementStance: orchestrationResult.trace?.engagementStance,
    outputMode: orchestrationResult.outputPolicy.mode,
    failedAgents,
    baselineCode,
    auditCode,
    taskIds: orchestrationResult.trace?.tasks.map((task) => task.id),
    winnerTaskId: orchestrationResult.evaluation?.winnerTaskId,
    rubricVersion: orchestrationResult.evaluation?.rubricVersion,
    includeConsiderations: orchestrationResult.outputPolicy.includeConsiderations,
    traceExpandedByDefault: orchestrationResult.outputPolicy.traceExpandedByDefault,
  });

  const panel = vscode.window.createWebviewPanel(
    "mojoDojo.secondOpinionAudit",
    "Mojo-Dojo: Second Opinion Audit",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );
  const activeDocument = activeEditor?.document;

  panel.webview.onDidReceiveMessage(
    async (message: unknown) => {
      if (!message || typeof message !== "object") {
        return;
      }

      const msg = message as { type?: string; code?: unknown };
      if (msg.type === "reject") {
        recordMergePreviewDecision(orchestrationResult, "reject");
        await writeMergeStats(context, "reject");
        panel.dispose();
        return;
      }

      if (msg.type === "apply") {
        if (
          !viewModel.diffAvailable ||
          typeof baselineCode !== "string" ||
          baselineCode.trim().length === 0 ||
          typeof msg.code !== "string" ||
          msg.code.trim().length === 0
        ) {
          vscode.window.showInformationMessage(
            "No diff preview is available because baseline or audit code is missing.",
          );
          return;
        }

        recordMergePreviewDecision(orchestrationResult, "apply");
        await writeMergeStats(context, "apply");

        const proposedCode = msg.code;
        const language = activeDocument?.languageId;
        const proposedDoc = await vscode.workspace.openTextDocument({
          language,
          content: proposedCode,
        });

        const leftUri = activeDocument?.uri;
        if (leftUri && leftUri.scheme !== "untitled") {
          await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            proposedDoc.uri,
            "Mojo-Dojo Proposed Change (Preview Only)",
          );
          return;
        }

        const baselineDoc = await vscode.workspace.openTextDocument({
          language,
          content: baselineCode,
        });
        await vscode.commands.executeCommand(
          "vscode.diff",
          baselineDoc.uri,
          proposedDoc.uri,
          "Mojo-Dojo Proposed Change (Preview Only)",
        );
      }
    },
    undefined,
  );

  renderAuditPanel(panel, viewModel);
}

export function registerAuditCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("mojoDojo.runSecondOpinionAudit", () => runAuditFlow(context)),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("mojoDojo.secondOpinion", () => runAuditFlow(context)),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("mojoDojo.auditThis", () => runAuditFlow(context)),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("mojoDojo.showMergeStats", () => showMergeStats(context)),
  );
}
