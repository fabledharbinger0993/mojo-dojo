import { RoutedAgent } from "../interfaces";
import { AgentResult, AgentTask } from "../../types";

/**
 * Grok code-generation wrapper.
 *
 * Routing code tasks here ensures we can run side-by-side candidate generation
 * and make evaluation decisions transparent to users in the dojo workflow.
 */
export class GrokCodeAgent implements RoutedAgent {
  readonly id = "code.grok";
  readonly role = "code" as const;
  readonly modelName = "Grok";

  async handle(task: AgentTask): Promise<AgentResult> {
    // TODO: Wire Grok endpoint, credentials, and model variant.
    return {
      agentId: this.id,
      tag: this.role,
      content: `[stub] Grok would generate code for: ${task.userMessage}`,
      metadata: { provider: this.modelName },
    };
  }
}
