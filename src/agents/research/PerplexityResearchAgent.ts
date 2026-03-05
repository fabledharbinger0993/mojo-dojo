import { RoutedAgent } from "../interfaces";
import { AgentResult, AgentTask } from "../../types";

/**
 * Perplexity wrapper for retrieval-heavy requests.
 *
 * In the dojo, RESEARCH outputs should be source-oriented so downstream
 * reasoning remains transparent and reviewable by users and evaluators.
 */
export class PerplexityResearchAgent implements RoutedAgent {
  readonly id = "research.perplexity";
  readonly role = "research" as const;
  readonly modelName = "Perplexity";

  async handle(task: AgentTask): Promise<AgentResult> {
    // TODO: Wire Perplexity API client and token from secure configuration.
    // TODO: Return citation-rich response payload from provider.
    return {
      agentId: this.id,
      tag: this.role,
      content: `[stub] Perplexity would research: ${task.userMessage}`,
      metadata: { provider: this.modelName, citations: [] },
    };
  }
}
