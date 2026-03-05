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

export interface PromptReframe {
  originalPrompt: string;
  collaborativePrompt: string;
  notes: string[];
  userFacingIntro: string;
}

export interface InferredStyleProfile {
  sampleFileCount: number;
  indentation: "tabs" | "2-spaces" | "4-spaces" | "mixed";
  quoteStyle: "single" | "double" | "mixed";
  semicolonStyle: "required" | "optional" | "mixed";
  namingStyle: "camelCase" | "snake_case" | "mixed";
}

export interface AuditBidScore {
  correctnessSignals: number;
  maintainabilitySignals: number;
  riskAwarenessSignals: number;
  testSignals: number;
  styleFitSignals: number;
  reliabilityPenalty: number;
  total: number;
}

export interface AuditCriterionScore {
  criterion:
    | "correctness"
    | "maintainability"
    | "risk-awareness"
    | "testing"
    | "style-fit"
    | "reliability";
  baseline: number;
  secondOpinion: number;
  preferredLabel: string;
  rationale: string;
}

export interface AuditBidComparison {
  method: "rubric-plus-narrative";
  winnerLabel: string;
  winnerReason: string;
  criteria: AuditCriterionScore[];
  baselineStrengths: string[];
  secondOpinionStrengths: string[];
  considerations: string[];
  baseline: {
    label: string;
    score: AuditBidScore;
    content?: string;
  };
  secondOpinion: {
    label: string;
    score: AuditBidScore;
    content: string;
  };
}

export interface SecondOpinionAuditInput {
  userPrompt: string;
  baselineOutput?: string;
  baselineLabel?: string;
  context?: Record<string, unknown>;
}

export interface SecondOpinionAuditResult {
  baselineLabel: string;
  baselineOutput?: string;
  reframe: PromptReframe;
  secondOpinion: RouterResult;
  comparison: AuditBidComparison;
  styleHintsUsed?: string;
  styleHintSource: "context" | "inferred" | "none";
  inferredStyleProfile?: InferredStyleProfile;
  mergeHints: string[];
  mergeFrame: string;
}
