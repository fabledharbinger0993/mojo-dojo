import * as vscode from "vscode";
import { registerAuditCommands } from "./vscode/commands/registerAuditCommands";

export function activate(context: vscode.ExtensionContext): void {
  registerAuditCommands(context);
}

export function deactivate(): void {
  // No background resources to dispose yet.
}
