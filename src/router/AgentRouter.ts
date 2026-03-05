import { RoutedAgent } from "../agents/interfaces";
import { ClassificationResult, RouterResult, TaskTag } from "../types";

export type AgentRegistry = Partial<Record<TaskTag, RoutedAgent[]>>;

/**
 * AgentRouter dispatches classified tasks to specialist model adapters.
 *
 * This is the core of the dojo's multi-agent transparency: every routed tag
 * can fan out to one or more agents, making reasoning and code alternatives
 * visible for later evaluation and memory indexing.
 */
export class AgentRouter {
  constructor(private readonly registry: AgentRegistry) {}

  async routeAndExecute(
    classification: ClassificationResult,
    userMessage: string,
    context?: Record<string, unknown>,
  ): Promise<RouterResult> {
    const byTag: RouterResult["byTag"] = {};

    for (const tag of classification.tags) {
      const agents = this.registry[tag] ?? [];
      if (agents.length === 0) {
        byTag[tag] = [];
        continue;
      }

      const results = await Promise.all(
        agents.map((agent) =>
          agent.handle({
            tag,
            userMessage,
            context,
          }),
        ),
      );

      byTag[tag] = results;
    }

    return {
      classification,
      byTag,
    };
  }
}
