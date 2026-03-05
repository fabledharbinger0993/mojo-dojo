import { RoutedAgent } from "../interfaces";
import { AgentResult, AgentTask } from "../../types";

/**
 * ChatGPT reasoning wrapper.
 *
 * Paired with Claude, this supports parallel reasoning perspectives that the
 * orchestrator can compare before evaluation and memory persistence.
 */
export class ChatGPTReasoningAgent implements RoutedAgent {
  readonly id = "reasoning.chatgpt";
  readonly role = "reasoning" as const;
  readonly modelName = "ChatGPT";

  async handle(task: AgentTask): Promise<AgentResult> {
    // TODO: Wire OpenAI/GitHub Models endpoint and credentials.
    return {
      agentId: this.id,
      tag: this.role,
      content: `[stub] ChatGPT would reason about: ${task.userMessage}`,
      metadata: { provider: this.modelName },
    };
  }
}
