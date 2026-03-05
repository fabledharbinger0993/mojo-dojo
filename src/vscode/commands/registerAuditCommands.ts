import * as vscode from "vscode";
import { runSecondOpinionAudit } from "../../orchestrate";
import { toAuditViewModel } from "../adapters/auditViewModel";
import { renderAuditPanel } from "../panels/renderAuditPanel";

async function runAuditFlow(): Promise<void> {
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

  const auditResult = await runSecondOpinionAudit({
    userPrompt,
    baselineOutput: baselineOutput?.trim() || undefined,
    context: {
      workspaceRoot,
    },
  });

  const viewModel = toAuditViewModel(auditResult);

  const panel = vscode.window.createWebviewPanel(
    "mojoDojo.secondOpinionAudit",
    "Mojo-Dojo: Second Opinion Audit",
    vscode.ViewColumn.Beside,
    {
      enableScripts: false,
      retainContextWhenHidden: true,
    },
  );

  renderAuditPanel(panel, viewModel);
}

export function registerAuditCommands(context: vscode.ExtensionContext): void {
  const commandIds = [
    "mojoDojo.runSecondOpinionAudit",
    "mojoDojo.secondOpinion",
    "mojoDojo.auditThis",
  ];

  for (const commandId of commandIds) {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, runAuditFlow));
  }
}
