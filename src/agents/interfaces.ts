import { LegacyAgentResult, LegacyAgentTask, TaskTag } from "../types";

/**
 * Common pluggable agent contract.
 *
 * Keeping this interface narrow makes it easy to swap model providers while
 * preserving dojo goals: visible multi-agent contributions, comparable outputs
 * for evaluation, and structured artifacts for memory updates.
 */
export interface RoutedAgent {
  id: string;
  role: TaskTag;
  modelName: string;
  handle(task: LegacyAgentTask): Promise<LegacyAgentResult>;
}
