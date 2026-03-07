import { ReasoningAgent } from "../interfaces";
import { AgentResult, AgentTask, OrchestrationContext } from "../../types";

/**
 * Gemini + Docker system/tool wrapper.
 *
 * In the dojo model, system actions should be explicit and auditable, so this
 * adapter is where tool invocation traces can later be captured for memory and
 * safety review.
 */
export class GeminiSystemAgent implements ReasoningAgent {
  readonly id = "system.gemini";
  readonly roles = ["TOOL"] as const;

  async run(task: AgentTask, _context: OrchestrationContext): Promise<AgentResult> {
    // TODO: Wire Gemini model endpoint and tool-calling permissions.
    // TODO: Integrate Docker command executor with sandbox and policy checks.
    return {
      id: task.id,
      agent: task.agent,
      taskType: task.taskType,
      content: `[stub] Gemini+Docker would execute system action for: ${task.prompt}`,
      metadata: { agent: "gemini", provider: "google", tools: ["docker"] },
    };
  }
}
