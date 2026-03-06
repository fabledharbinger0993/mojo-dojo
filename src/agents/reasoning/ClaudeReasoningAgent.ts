import { RoutedAgent } from "../interfaces";
import { LegacyAgentResult, LegacyAgentTask } from "../../types";

/**
 * Claude reasoning wrapper.
 *
 * The dojo relies on explicit reasoning traces; this agent should return
 * trade-offs and uncertainty notes so users can inspect deliberation quality.
 */
export class ClaudeReasoningAgent implements RoutedAgent {
  readonly id = "reasoning.claude";
  readonly role = "reasoning" as const;
  readonly modelName = "Claude";

  async handle(task: LegacyAgentTask): Promise<LegacyAgentResult> {
    // TODO: Wire Anthropic/Claude client and model selection policy.
    return {
      agentId: this.id,
      tag: this.role,
      content: `[stub] Claude would reason about: ${task.userMessage}`,
      metadata: { provider: this.modelName },
    };
  }
}
