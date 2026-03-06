import { RoutedAgent } from "../interfaces";
import { LegacyAgentResult, LegacyAgentTask } from "../../types";

/**
 * Haiku code-generation wrapper.
 *
 * This model can serve as a lightweight candidate or evaluator in later stages;
 * keeping it as a first-class agent keeps ensemble logic easy to test.
 */
export class HaikuCodeAgent implements RoutedAgent {
  readonly id = "code.haiku";
  readonly role = "code" as const;
  readonly modelName = "Haiku";

  async handle(task: LegacyAgentTask): Promise<LegacyAgentResult> {
    // TODO: Wire Haiku provider and secret management.
    return {
      agentId: this.id,
      tag: this.role,
      content: `[stub] Haiku would generate code for: ${task.userMessage}`,
      metadata: { provider: this.modelName },
    };
  }
}
