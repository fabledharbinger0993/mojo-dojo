import {
  AgentResult,
  AgentRole,
  AgentTask,
  OrchestrationContext,
} from "../types";

/**
 * Common pluggable agent contract.
 *
 * Keeping this interface narrow makes it easy to swap model providers while
 * preserving dojo goals: visible multi-agent contributions, comparable outputs
 * for evaluation, and structured artifacts for memory updates.
 */
export interface ReasoningAgent {
  id: string;
  roles: readonly AgentRole[];
  run(task: AgentTask, context: OrchestrationContext): Promise<AgentResult>;
}
