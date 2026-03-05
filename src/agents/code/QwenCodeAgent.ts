import { RoutedAgent } from "../interfaces";
import { AgentResult, AgentTask } from "../../types";

/**
 * Qwen code-generation wrapper for ensemble coding.
 *
 * The dojo architecture compares multiple code candidates before selecting a
 * winner through evaluation; this wrapper exists to keep that path pluggable.
 */
export class QwenCodeAgent implements RoutedAgent {
  readonly id = "code.qwen";
  readonly role = "code" as const;
  readonly modelName = "Qwen";

  async handle(task: AgentTask): Promise<AgentResult> {
    // TODO: Wire Qwen provider endpoint and auth secret.
    return {
      agentId: this.id,
      tag: this.role,
      content: `[stub] Qwen would generate code for: ${task.userMessage}`,
      metadata: { provider: this.modelName },
    };
  }
}
