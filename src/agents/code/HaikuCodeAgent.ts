import { ReasoningAgent } from "../interfaces";
import { AgentResult, AgentTask, OrchestrationContext } from "../../types";

/**
 * Haiku code-generation wrapper.
 *
 * This model can serve as a lightweight candidate or evaluator in later stages;
 * keeping it as a first-class agent keeps ensemble logic easy to test.
 */
export class HaikuCodeAgent implements ReasoningAgent {
  readonly id = "code.haiku";
  readonly roles = ["CODE"] as const;

  async run(task: AgentTask, _context: OrchestrationContext): Promise<AgentResult> {
    // TODO: Wire Haiku provider and secret management.
    return {
      id: task.id,
      agent: task.agent,
      taskType: task.taskType,
      content: `[stub] Haiku would generate code for: ${task.prompt}`,
      metadata: { agent: "haiku", provider: "haiku" },
    };
  }
}
