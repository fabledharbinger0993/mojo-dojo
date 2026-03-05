/**
 * Shared types for the Mojo-Dojo orchestration scaffold.
 *
 * These contracts keep multi-agent behavior explicit so users can see how work
 * was delegated, which supports the AI collaboration dojo goal of transparent
 * reasoning, inspectable evaluation inputs, and memory-friendly traces.
 */

export const TASK_TAGS = ["research", "reasoning", "code", "system_action"] as const;

export type TaskTag = (typeof TASK_TAGS)[number];

export interface ClassificationResult {
  tags: TaskTag[];
  isMixed: boolean;
  rationale: string[];
}

export interface AgentTask {
  tag: TaskTag;
  userMessage: string;
  sessionId?: string;
  context?: Record<string, unknown>;
}

export interface AgentResult {
  agentId: string;
  tag: TaskTag;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RouterResult {
  classification: ClassificationResult;
  byTag: Partial<Record<TaskTag, AgentResult[]>>;
}
