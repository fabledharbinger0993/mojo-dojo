import { ReasoningAgent } from "../agents/interfaces";
import { AgentResult, AgentRole, AgentTask, OrchestrationContext, TaskTag } from "../types";
import { AgentRouter } from "./AgentRouter";

class DeterministicMockAgent implements ReasoningAgent {
  constructor(
    readonly id: string,
    readonly roles: AgentRole[],
    private readonly responder: (task: AgentTask, context: OrchestrationContext) => string,
  ) {}

  async run(task: AgentTask, context: OrchestrationContext): Promise<AgentResult> {
    return {
      id: task.id,
      agent: task.agent,
      taskType: task.taskType,
      content: this.responder(task, context),
      metadata: {
        provider: "mock",
        live: false,
      },
    };
  }
}

function mapTagToRole(tag: TaskTag): AgentRole {
  if (tag === "research") {
    return "RESEARCH";
  }
  if (tag === "reasoning") {
    return "REASONING";
  }
  if (tag === "code") {
    return "CODE";
  }
  return "TOOL";
}

export function createMockRouter(): AgentRouter {
  const staticAgentsByTag: Partial<Record<TaskTag, ReasoningAgent[]>> = {
    research: [
      new DeterministicMockAgent("research.perplexity", ["RESEARCH"], (task) =>
        [
          "[mock] Research summary with source placeholders.",
          "- Source A: https://example.com/a",
          "- Source B: https://example.com/b",
          `Query: ${task.prompt}`,
        ].join("\n"),
      ),
    ],
    reasoning: [
      new DeterministicMockAgent("reasoning.claude", ["REASONING"], (task) =>
        [
          "[mock] Trade-off analysis:",
          "- Correctness over speed for production paths.",
          "- Name assumptions explicitly before implementation.",
          `Prompt: ${task.prompt}`,
        ].join("\n"),
      ),
      new DeterministicMockAgent("reasoning.chatgpt", ["REASONING"], (task) =>
        [
          "[mock] Reasoning pass:",
          "- Highlight risk and failure modes.",
          "- Suggest unit and integration tests.",
          `Prompt: ${task.prompt}`,
        ].join("\n"),
      ),
    ],
    code: [
      new DeterministicMockAgent("code.qwen", ["CODE"], () =>
        [
          "```ts",
          "export async function handler(req: Request): Promise<Response> {",
          "  if (!req) {",
          "    return new Response('invalid request', { status: 400 });",
          "  }",
          "  try {",
          "    // fallback path is explicit to reduce production risk.",
          "    return new Response('ok', { status: 200 });",
          "  } catch {",
          "    return new Response('temporary failure', { status: 503 });",
          "  }",
          "}",
          "```",
          "Validation, error handling, and fallback behavior are explicit.",
          "Recommended tests: unit tests for 400/200/503 branches.",
          "Risk: protect downstream services with retry budget and timeout.",
        ].join("\n"),
      ),
      new DeterministicMockAgent("code.grok", ["CODE"], () =>
        [
          "```ts",
          "export function normalize(input: string): string {",
          "  return input.trim();",
          "}",
          "```",
          "Refactor keeps code readable and maintainable with small surface area.",
        ].join("\n"),
      ),
      new DeterministicMockAgent("code.haiku", ["CODE"], () =>
        [
          "```ts",
          "export async function safeHandler(): Promise<number> {",
          "  return 200;",
          "}",
          "```",
          "Testing note: add integration coverage for error fallback and retries.",
        ].join("\n"),
      ),
    ],
    system_action: [
      new DeterministicMockAgent(
        "system.gemini",
        ["TOOL"],
        (task) => `[mock] System action plan for: ${task.prompt}`,
      ),
    ],
  };

  return new AgentRouter({
    runtimeConfig: { useMockAgents: true },
    staticAgentsByTag,
  });
}
