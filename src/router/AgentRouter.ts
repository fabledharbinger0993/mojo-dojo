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

    const tagJobs = classification.tags.map(async (tag) => {
      const agents = this.registry[tag] ?? [];
      if (agents.length === 0) {
        byTag[tag] = [];
        return;
      }

      // Isolate failures so one provider error does not collapse the whole tag.
      const settled = await Promise.allSettled(
        agents.map((agent) =>
          agent.handle({
            tag,
            userMessage,
            context,
          }),
        ),
      );

      byTag[tag] = settled.map((result, index) => {
        if (result.status === "fulfilled") {
          return result.value;
        }

        const failedAgent = agents[index];
        return {
          agentId: failedAgent?.id ?? `${tag}.unknown`,
          tag,
          content: `[error] agent failed: ${result.reason instanceof Error ? result.reason.message : "unknown error"}`,
          metadata: {
            error: true,
            provider: failedAgent?.modelName ?? "unknown",
          },
        };
      });
    });

    await Promise.all(tagJobs);

    return {
      classification,
      byTag,
    };
  }
}
