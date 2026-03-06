import { AgentRole, TaskType } from "./types";

/**
 * Deterministic task ID generator.
 * Pure function based on session + agent + task type + monotonic counter.
 */
export function generateTaskId(
  sessionId: string,
  agent: AgentRole,
  taskType: TaskType,
  counter: number,
): string {
  return `${sessionId}:${taskType}:${agent}:${counter}`;
}
