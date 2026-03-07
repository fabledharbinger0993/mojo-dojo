import * as vscode from "vscode";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  orchestrate,
  recordMergePreviewDecision,
  runSecondOpinionAudit,
} from "../../orchestrate";
import { OrchestrationRuntimeConfig, SecondOpinionAuditResult } from "../../types";
import { createDefaultAgentRegistry } from "../../agents/AgentRegistry";
import { toAuditViewModel } from "../adapters/auditViewModel";
import { renderAuditPanel } from "../panels/renderAuditPanel";

interface MergeStats {
  apply: number;
  reject: number;
  lastDecision?: "apply" | "reject";
  lastDecisionAt?: string;
}

const FIRST_LIVE_AUDIT_CAPTURED_KEY = "mojoDojo.firstLiveAuditCaptured";

function buildOrchestrationConfig(): OrchestrationRuntimeConfig {
  const cfg = vscode.workspace.getConfiguration("mojoDojo");

  const useMockAgents = cfg.get<boolean>("useMockAgents") ?? false;
  const reasoningTimeoutMs = cfg.get<number>("reasoningTimeoutMs") ?? 12000;
  const reasoningModel = cfg.get<string>("reasoningModel") ?? "gpt-4.1-mini";
  const claudeModel = cfg.get<string>("claudeModel") ?? "claude-3-5-haiku-latest";
  const openAiEndpoint = cfg.get<string>("openAiEndpoint");
  const claudeEndpoint = cfg.get<string>("claudeEndpoint");

  return {
    useMockAgents,
    registryEntries: createDefaultAgentRegistry().getEntries(),
    providers: {
      chatgpt: {
        apiKey: process.env.OPENAI_API_KEY ?? process.env.GITHUB_TOKEN,
        endpoint: openAiEndpoint,
        model: reasoningModel,
        timeoutMs: reasoningTimeoutMs,
        maxRetries: 1,
      },
      claude: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        endpoint: claudeEndpoint,
        model: claudeModel,
        timeoutMs: reasoningTimeoutMs,
        maxRetries: 1,
      },
      perplexity: {
        apiKey: process.env.PERPLEXITY_API_KEY,
      },
    },
  };
}

function hasLiveClaudeResult(auditResult: SecondOpinionAuditResult): boolean {
  const reasoningResults = auditResult.secondOpinion.byTag.reasoning ?? [];
  return reasoningResults.some((result) => {
    const metadata = result.metadata;
    if (!metadata || typeof metadata !== "object") {
      return false;
    }

    const provider = (metadata as Record<string, unknown>).provider;
    const agent = (metadata as Record<string, unknown>).agent;
    const live = (metadata as Record<string, unknown>).live;
    return provider === "anthropic" && agent === "claude" && live === true;
  });
}

async function persistFirstRealAudit(
  extensionContext: vscode.ExtensionContext,
  auditResult: SecondOpinionAuditResult,
  runtimeConfig: OrchestrationRuntimeConfig,
  workspaceRoot?: string,
): Promise<void> {
  const alreadyCaptured =
    extensionContext.workspaceState.get<boolean>(FIRST_LIVE_AUDIT_CAPTURED_KEY) ?? false;

  if (
    alreadyCaptured ||
    runtimeConfig.useMockAgents ||
    !workspaceRoot ||
    !hasLiveClaudeResult(auditResult)
  ) {
    return;
  }

  const outputDir = path.join(workspaceRoot, ".mojo-dojo");
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const outputFile = path.join(outputDir, `first-real-audit-${timestamp}.json`);

  const payload = {
    capturedAt: new Date().toISOString(),
    baselineLabel: auditResult.baselineLabel,
    baselineOutput: auditResult.baselineOutput,
    prompt: auditResult.reframe.originalPrompt,
    collaborativePrompt: auditResult.reframe.collaborativePrompt,
    winnerLabel: auditResult.comparison.winnerLabel,
    winnerReason: auditResult.comparison.winnerReason,
    criteria: auditResult.comparison.criteria,
    considerations: auditResult.comparison.considerations,
    secondOpinionContent: auditResult.comparison.secondOpinion.content,
    secondOpinionScore: auditResult.comparison.secondOpinion.score,
    baselineScore: auditResult.comparison.baseline.score,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(payload, null, 2), "utf8");
  await extensionContext.workspaceState.update(FIRST_LIVE_AUDIT_CAPTURED_KEY, true);
  void vscode.window.showInformationMessage(
    `Saved first live Claude audit: ${path.relative(workspaceRoot, outputFile)}`,
  );
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
  const runtimeConfig = buildOrchestrationConfig();

  const auditResult = await runSecondOpinionAudit({
    userPrompt,
    baselineOutput: baselineOutput?.trim() || undefined,
    runtimeConfig,
    context: {
      workspaceRoot,
    },
  });

  await persistFirstRealAudit(context, auditResult, runtimeConfig, workspaceRoot);

  const orchestrationResult = await orchestrate({
    sessionId: `audit-${Date.now()}`,
    text: userPrompt,
    timestamp: new Date().toISOString(),
    runtimeConfig,
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
