import { ReasoningAgent } from "../interfaces";
import { AgentResult, AgentTask, OrchestrationContext } from "../../types";

/**
 * Grok code-generation wrapper.
 *
 * Routing code tasks here ensures we can run side-by-side candidate generation
 * and make evaluation decisions transparent to users in the dojo workflow.
 */
export class GrokCodeAgent implements ReasoningAgent {
  readonly id = "code.grok";
  readonly roles = ["CODE"] as const;

  async run(task: AgentTask, _context: OrchestrationContext): Promise<AgentResult> {
    // TODO: Wire Grok endpoint, credentials, and model variant.
    return {
      id: task.id,
      agent: task.agent,
      taskType: task.taskType,
      content: `[stub] Grok would generate code for: ${task.prompt}`,
      metadata: { agent: "grok", provider: "grok" },
    };
  }
}
