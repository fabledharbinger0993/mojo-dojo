import { TaskClassifier } from "./classifier/TaskClassifier";
import { createDefaultRouter } from "./router/createDefaultRouter";
import { RouterResult, SecondOpinionAuditInput, SecondOpinionAuditResult } from "./types";
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
