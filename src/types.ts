/**
 * Shared types for the Mojo-Dojo orchestration scaffold.
 *
 * These contracts keep multi-agent behavior explicit so users can see how work
 * was delegated, which supports the AI collaboration dojo goal of transparent
 * reasoning, inspectable evaluation inputs, and memory-friendly traces.
 */

export const TASK_TAGS = ["research", "reasoning", "code", "system_action"] as const;

export type TaskTag = (typeof TASK_TAGS)[number];

// What the VS Code extension sends into the orchestrator.
export interface UserMessage {
  sessionId: string;
  userId?: string;
  text: string;
  timestamp: string;
  runtimeConfig?: OrchestrationRuntimeConfig;
  context?: {
    filePath?: string;
    selection?: string;
    languageId?: string;
    engagementStanceOverride?: EngagementStance;
    simulateFailureAgentIds?: string[];
  };
}

// High-level task intent decided by the classifier.
export type TaskType = "research" | "reasoning" | "coding" | "system";

// Which logical agent is being asked to act.
export type AgentRole = "RESEARCH" | "REASONING" | "CODE" | "TOOL" | "EVAL";

export type EngagementStance = "collaborative" | "transactional" | "boundary";

// A single agent request emitted by the router.
export interface AgentTask {
  id: string;
  sessionId: string;
  agent: AgentRole;
  taskType: TaskType;
  prompt: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderRuntimeConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface OrchestrationRuntimeConfig {
  useMockAgents?: boolean;
  registryEntries?: Array<{
    id: string;
    provider: string;
    roles: readonly AgentRole[];
    adapterClass: string;
    apiKeyEnv: string;
    priority: number;
    timeoutMs: number;
    maxConcurrency?: number;
    enabled: boolean;
  }>;
  providers?: {
    chatgpt?: ProviderRuntimeConfig;
    claude?: ProviderRuntimeConfig;
    perplexity?: ProviderRuntimeConfig;
  };
}

export interface OrchestrationContext {
  prompt: string;
  timeoutMs: number;
  sharedMemory?: Record<string, unknown>;
  previousAgentOutputs?: AgentResult[];
  requestContext?: Record<string, unknown>;
  config?: OrchestrationRuntimeConfig;
}

// Raw response from a specialist model.
export interface AgentResult {
  id: string;
  agent: AgentRole;
  taskType: TaskType;
  content: string;
  tokensUsed?: number;
  latencyMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

// Structured evaluation output for ensemble code tasks.
export interface EvaluationResult {
  winnerTaskId: string;
  scores: Array<{
    taskId: string;
    score: number;
    rationale: string;
  }>;
  rubricVersion: string;
}

// Memory updates emitted after each turn.
export interface MemoryUpdate {
  sessionId: string;
  shortTerm?: {
    messages: Array<{ from: "user" | "agent"; content: string }>;
  };
  longTerm?: {
    notes?: string;
    preferences?: Record<string, unknown>;
  };
  vectorEmbeddings?: Array<{
    id: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }>;
}

export type MergePreviewDecision = "apply" | "reject";

export interface MergePreviewTelemetryEvent {
  decision: MergePreviewDecision;
  timestamp: string;
  sessionId: string;
  status: OrchestrationStatus;
  mode: OutputPolicy["mode"];
}

// Final response shape for VS Code UI.
export interface OrchestrationResult {
  sessionId: string;
  status: OrchestrationStatus;
  visibleMessages: Array<{
    from: AgentRole | "USER";
    content: string;
  }>;
  evaluation?: EvaluationResult;
  memoryUpdate?: MemoryUpdate;
  outputPolicy: OutputPolicy;
  trace?: OrchestrationTrace;
}

export interface OutputPolicy {
  mode: "boundary" | "concise" | "full";
  includeConsiderations: boolean;
  traceExpandedByDefault: boolean;
}

export type OrchestrationStatus = "ok" | "partial_failure" | "failure";

export interface OrchestrationTrace {
  sessionId: string;
  engagementStance: EngagementStance;
  tasks: AgentTask[];
  results: AgentResult[];
  evaluation?: EvaluationResult;
  mergePreviewActions?: MergePreviewTelemetryEvent[];
}

export interface RouterTrace {
  sessionId?: string;
  tasks: AgentTask[];
  results: AgentResult[];
}

export interface ClassificationResult {
  tags: TaskTag[];
  isMixed: boolean;
  rationale: string[];
}

export interface LegacyAgentTask {
  tag: TaskTag;
  userMessage: string;
  sessionId?: string;
  context?: Record<string, unknown>;
}

export interface LegacyAgentResult {
  agentId: string;
  tag: TaskTag;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RouterResult {
  classification: ClassificationResult;
  byTag: Partial<Record<TaskTag, LegacyAgentResult[]>>;
  trace?: RouterTrace;
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
  runtimeConfig?: OrchestrationRuntimeConfig;
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
