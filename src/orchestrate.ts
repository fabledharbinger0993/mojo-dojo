import { TaskClassifier } from "./classifier/TaskClassifier";
import { createDefaultRouter } from "./router/createDefaultRouter";
import { RouterResult } from "./types";

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
