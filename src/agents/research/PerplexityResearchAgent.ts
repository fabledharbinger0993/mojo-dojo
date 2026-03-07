import { ReasoningAgent } from "../interfaces";
import { AgentResult, AgentTask, OrchestrationContext } from "../../types";

/**
 * Perplexity wrapper for retrieval-heavy requests.
 *
 * In the dojo, RESEARCH outputs should be source-oriented so downstream
 * reasoning remains transparent and reviewable by users and evaluators.
 */
export class PerplexityResearchAgent implements ReasoningAgent {
  readonly id = "research.perplexity";
  readonly roles = ["RESEARCH"] as const;

  async run(task: AgentTask, _context: OrchestrationContext): Promise<AgentResult> {
    // TODO: Wire Perplexity API client and token from secure configuration.
    // TODO: Return citation-rich response payload from provider.
    return {
      id: task.id,
      agent: task.agent,
      taskType: task.taskType,
      content: `[stub] Perplexity would research: ${task.prompt}`,
      metadata: { agent: "perplexity", provider: "perplexity", citations: [] },
    };
  }
}
