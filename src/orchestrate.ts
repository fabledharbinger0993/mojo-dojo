import { TaskClassifier } from "./classifier/TaskClassifier";
import { createDefaultRouter } from "./router/createDefaultRouter";
import { generateTaskId } from "./ids";
import {
  AgentRole,
  EngagementStance,
  EvaluationResult,
  MemoryUpdate,
  OutputPolicy,
  OrchestrationResult,
  OrchestrationStatus,
  RouterResult,
  MergePreviewDecision,
  MergePreviewTelemetryEvent,
  SecondOpinionAuditInput,
  SecondOpinionAuditResult,
  TaskTag,
  UserMessage,
} from "./types";
import { reframePrompt } from "./audit/reframePrompt";
import { compareBids } from "./audit/scoreBids";
import { inferStyleHintsFromWorkspace } from "./audit/inferStyleHints";

function extractStyleHints(context?: Record<string, unknown>): string | undefined {
  const styleGuide = typeof context?.styleGuide === "string" ? context.styleGuide : "";
  const naming = typeof context?.namingConventions === "string" ? context.namingConventions : "";
  const existing =
    typeof context?.existingStyleHints === "string" ? context.existingStyleHints : "";

  const joined = [styleGuide, naming, existing].filter((entry) => entry.length > 0).join("; ");
  return joined.length > 0 ? joined : undefined;
}

function mapTagToRole(tag: TaskTag): AgentRole {
  if (tag === "research") {
    return "RESEARCH";
  }
  if (tag === "reasoning") {
    return "REASONING";
  }
  if (tag === "code") {
    return "CODE";
  }
  return "TOOL";
}

function maybeBuildEvaluation(routerResult: RouterResult): EvaluationResult | undefined {
  const codeResults = (routerResult.trace?.results ?? []).filter(
    (result) => result.taskType === "coding" && !result.error,
  );
  if (codeResults.length === 0) {
    return undefined;
  }

  const scores = codeResults.map((result) => {
    const hasCodeBlock = /```[\s\S]*```/.test(result.content);
    const mentionsTests = /\b(test|unit test|integration)\b/i.test(result.content);
    const mentionsRisk = /\b(risk|error|fallback|security)\b/i.test(result.content);

    let score = 0.4;
    if (hasCodeBlock) {
      score += 0.25;
    }
    if (mentionsTests) {
      score += 0.2;
    }
    if (mentionsRisk) {
      score += 0.15;
    }

    return {
      taskId: result.id,
      score: Math.min(1, score),
      rationale: `code-block=${hasCodeBlock}, tests=${mentionsTests}, risk-aware=${mentionsRisk}`,
    };
  });

  const winner = scores.reduce((best, current) => (current.score > best.score ? current : best));

  return {
    winnerTaskId: winner.taskId,
    scores,
    rubricVersion: "dojo-eval-v0.1",
  };
}

function evaluateEngagementStance(text: string): EngagementStance {
  const boundaryPattern = /\b(stupid|idiot|moron|dumb|useless|worthless|hate you)\b/i;
  const transactionalPattern = /\b(just do it|only output|no explanation|quickly|asap)\b/i;

  if (boundaryPattern.test(text)) {
    return "boundary";
  }
  if (transactionalPattern.test(text)) {
    return "transactional";
  }
  return "collaborative";
}

function resolveEngagementStance(message: UserMessage): EngagementStance {
  const override = message.context?.engagementStanceOverride;
  if (override === "boundary" || override === "transactional" || override === "collaborative") {
    return override;
  }
  return evaluateEngagementStance(message.text);
}

function toOutputPolicy(stance: EngagementStance): OutputPolicy {
  if (stance === "boundary") {
    return {
      mode: "boundary",
      includeConsiderations: false,
      traceExpandedByDefault: false,
    };
  }

  if (stance === "transactional") {
    return {
      mode: "concise",
      includeConsiderations: false,
      traceExpandedByDefault: false,
    };
  }

  return {
    mode: "full",
    includeConsiderations: true,
    traceExpandedByDefault: true,
  };
}

function buildMemoryUpdate(
  message: UserMessage,
  routerResult: RouterResult,
  engagementStance?: EngagementStance,
): MemoryUpdate {
  const agentMessages = Object.values(routerResult.byTag)
    .flatMap((results) => results ?? [])
    .map((result) => ({ from: "agent" as const, content: result.content }));

  return {
    sessionId: message.sessionId,
    shortTerm: {
      messages: [{ from: "user", content: message.text }, ...agentMessages],
    },
    longTerm: {
      notes: routerResult.classification.rationale.join(" | "),
      preferences: {
        languageId: message.context?.languageId,
        filePath: message.context?.filePath,
        engagementStance,
      },
    },
  };
}

function deriveOrchestrationStatus(routerResult: RouterResult): OrchestrationStatus {
  const results = routerResult.trace?.results ?? [];
  if (results.length === 0) {
    return "failure";
  }

  const erroredResults = results.filter((result) => Boolean(result.error));
  if (erroredResults.length === 0) {
    return "ok";
  }
  if (erroredResults.length < results.length) {
    return "partial_failure";
  }
  return "failure";
}

/**
 * Minimal orchestration entrypoint for scaffolding.
 *
 * This demonstrates dojo flow: classify -> route to multiple agents -> return
 * structured outputs that later stages can evaluate and commit to memory.
 */
export async function orchestrateUserMessage(
  userMessage: string,
  context?: Record<string, unknown>,
): Promise<RouterResult> {
  const classifier = new TaskClassifier();
  const router = createDefaultRouter();

  const classification = classifier.classify(userMessage);
  return router.routeAndExecute(classification, userMessage, context);
}

/**
 * README-aligned orchestration contract entrypoint:
 * User -> Classifier -> Router -> Specialist Models -> Evaluation -> Memory -> Response
 */
export async function orchestrate(message: UserMessage): Promise<OrchestrationResult> {
  const classifier = new TaskClassifier();
  const router = createDefaultRouter();
  const classification = classifier.classify(message.text);
  const engagementStance = resolveEngagementStance(message);
  const outputPolicy = toOutputPolicy(engagementStance);
  const routedClassification =
    engagementStance === "boundary"
      ? {
          ...classification,
          tags: classification.tags.slice(0, 1),
          isMixed: false,
          rationale: [...classification.rationale, "policy: boundary stance reduced fan-out"],
        }
      : classification;

  let taskCounter = 0;
  const routerResult = await router.routeAndExecute(
    routedClassification,
    message.text,
    {
      ...(message.context ?? {}),
      sessionId: message.sessionId,
      userId: message.userId,
      timestamp: message.timestamp,
    },
    {
      sessionId: message.sessionId,
      engagementStance,
      maxAgentTasks: engagementStance === "boundary" ? 1 : undefined,
      taskIdFactory: (agent, taskType) =>
        generateTaskId(message.sessionId, agent, taskType, ++taskCounter),
    },
  );

  const visibleMessages: OrchestrationResult["visibleMessages"] = [
    {
      from: "USER",
      content: message.text,
    },
  ];

  if (engagementStance === "boundary") {
    visibleMessages.push({
      from: "TOOL",
      content:
        "I can help with this. Let's keep it respectful and focused on the task so I can give you the best result.",
    });
  }

  for (const [tag, results] of Object.entries(routerResult.byTag)) {
    const role = mapTagToRole(tag as TaskTag);
    for (const result of results ?? []) {
      visibleMessages.push({
        from: role,
        content: result.content,
      });
    }
  }

  const evaluation =
    engagementStance === "boundary" ? undefined : maybeBuildEvaluation(routerResult);
  if (evaluation && outputPolicy.mode === "full") {
    visibleMessages.push({
      from: "EVAL",
      content: `Winner: ${evaluation.winnerTaskId} (rubric ${evaluation.rubricVersion})`,
    });
  }

  const memoryUpdate = buildMemoryUpdate(message, routerResult, engagementStance);
  const status = deriveOrchestrationStatus(routerResult);

  return {
    sessionId: message.sessionId,
    status,
    visibleMessages,
    evaluation,
    memoryUpdate,
    outputPolicy,
    trace: {
      sessionId: message.sessionId,
      engagementStance,
      tasks: routerResult.trace?.tasks ?? [],
      results: routerResult.trace?.results ?? [],
      evaluation,
      mergePreviewActions: [],
    },
  };
}

export function recordMergePreviewDecision(
  result: OrchestrationResult,
  decision: MergePreviewDecision,
  timestamp: string = new Date().toISOString(),
): MergePreviewTelemetryEvent {
  const event: MergePreviewTelemetryEvent = {
    decision,
    timestamp,
    sessionId: result.sessionId,
    status: result.status,
    mode: result.outputPolicy.mode,
  };

  if (result.trace) {
    if (!Array.isArray(result.trace.mergePreviewActions)) {
      result.trace.mergePreviewActions = [];
    }
    result.trace.mergePreviewActions.push(event);
  }

  if (result.memoryUpdate) {
    if (!result.memoryUpdate.longTerm) {
      result.memoryUpdate.longTerm = { preferences: {} };
    }
    if (!result.memoryUpdate.longTerm.preferences) {
      result.memoryUpdate.longTerm.preferences = {};
    }

    const preferences = result.memoryUpdate.longTerm.preferences;
    const raw = preferences.mergePreviewTelemetry;
    const telemetry =
      typeof raw === "object" && raw !== null
        ? (raw as {
            applyCount?: number;
            rejectCount?: number;
            lastDecision?: MergePreviewDecision;
            lastDecisionAt?: string;
          })
        : {};

    telemetry.applyCount = (telemetry.applyCount ?? 0) + (decision === "apply" ? 1 : 0);
    telemetry.rejectCount = (telemetry.rejectCount ?? 0) + (decision === "reject" ? 1 : 0);
    telemetry.lastDecision = decision;
    telemetry.lastDecisionAt = timestamp;
    preferences.mergePreviewTelemetry = telemetry;
  }

  return event;
}

/**
 * Runs a "second opinion" pass using a collaboration-oriented prompt reframe.
 *
 * This enables the product angle: users can compare baseline output from any
 * coding assistant against dojo-generated alternatives and choose what to merge.
 */
export async function runSecondOpinionAudit(
  input: SecondOpinionAuditInput,
): Promise<SecondOpinionAuditResult> {
  const classifier = new TaskClassifier();
  const router = createDefaultRouter();

  const reframe = reframePrompt(input.userPrompt);
  const classification = classifier.classify(reframe.collaborativePrompt);
  const secondOpinion = await router.routeAndExecute(
    classification,
    reframe.collaborativePrompt,
    {
      ...(input.context ?? {}),
      auditMode: true,
      baselineLabel: input.baselineLabel ?? "user.primary.agent",
    },
  );

  const manualStyleHints = extractStyleHints(input.context);
  const workspaceRoot =
    typeof input.context?.workspaceRoot === "string" ? input.context.workspaceRoot : undefined;
  const inferredStyle = manualStyleHints
    ? undefined
    : await inferStyleHintsFromWorkspace(workspaceRoot);
  const styleHintsUsed = manualStyleHints ?? inferredStyle?.hints;
  const styleHintSource = manualStyleHints
    ? "context"
    : inferredStyle
      ? "inferred"
      : "none";

  const baselineLabel = input.baselineLabel ?? "user.primary.agent";
  const comparison = compareBids(baselineLabel, input.baselineOutput, secondOpinion, {
    styleHints: styleHintsUsed,
  });

  return {
    baselineLabel,
    baselineOutput: input.baselineOutput,
    reframe,
    secondOpinion,
    comparison,
    styleHintsUsed,
    styleHintSource,
    inferredStyleProfile: inferredStyle?.profile,
    mergeFrame:
      "You now have two implementation bids. Pick the one that fits best, or blend both. Using the audit result is an optimization choice, not a correction.",
    mergeHints: [
      "Compare correctness first, then readability and testability.",
      "Treat this as two bids for the same job; choose whichever creates less downstream risk.",
      "Prefer the smallest safe merge when possible, and blend strengths if both versions add value.",
    ],
  };
}
