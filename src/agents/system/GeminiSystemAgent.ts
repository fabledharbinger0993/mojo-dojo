import { RoutedAgent } from "../interfaces";
import { LegacyAgentResult, LegacyAgentTask } from "../../types";

/**
 * Gemini + Docker system/tool wrapper.
 *
 * In the dojo model, system actions should be explicit and auditable, so this
 * adapter is where tool invocation traces can later be captured for memory and
 * safety review.
 */
export class GeminiSystemAgent implements RoutedAgent {
  readonly id = "system.gemini";
  readonly role = "system_action" as const;
  readonly modelName = "Gemini";

  async handle(task: LegacyAgentTask): Promise<LegacyAgentResult> {
    // TODO: Wire Gemini model endpoint and tool-calling permissions.
    // TODO: Integrate Docker command executor with sandbox and policy checks.
    return {
      agentId: this.id,
      tag: this.role,
      content: `[stub] Gemini+Docker would execute system action for: ${task.userMessage}`,
      metadata: { provider: this.modelName, tools: ["docker"] },
    };
  }
}
