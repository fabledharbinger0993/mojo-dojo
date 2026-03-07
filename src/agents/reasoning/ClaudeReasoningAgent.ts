import { ReasoningAgent } from "../interfaces";
import { AgentResult, AgentTask, OrchestrationContext, ProviderRuntimeConfig } from "../../types";

/**
 * Claude reasoning wrapper.
 *
 * The dojo relies on explicit reasoning traces; this agent should return
 * trade-offs and uncertainty notes so users can inspect deliberation quality.
 */
export class ClaudeReasoningAgent implements ReasoningAgent {
  readonly id = "reasoning.claude";
  readonly roles = ["REASONING"] as const;

  constructor(private readonly providerConfig?: ProviderRuntimeConfig) {}

  async run(task: AgentTask, context: OrchestrationContext): Promise<AgentResult> {
    const startedAt = Date.now();
    const timeoutMs = this.providerConfig?.timeoutMs ?? context.timeoutMs;
    const endpoint = this.providerConfig?.endpoint ?? "https://api.anthropic.com/v1/messages";
    const model = this.providerConfig?.model ?? "claude-3-5-haiku-latest";
    const token = this.providerConfig?.apiKey;
    const configRetries = this.providerConfig?.maxRetries;
    const maxRetries = Math.max(0, Math.min(configRetries ?? 1, 2));

    if (!token) {
      return {
        id: task.id,
        agent: task.agent,
        taskType: task.taskType,
        content: "[stub] Claude credentials are not configured. Inject provider config with apiKey to enable live reasoning.",
        error: "missing-api-key",
        metadata: {
          agent: "claude",
          provider: "anthropic",
          live: false,
          latencyMs: Date.now() - startedAt,
        },
      };
    }

    const requestBody = {
      model,
      max_tokens: 800,
      temperature: 0.2,
      system:
        "You are a reasoning specialist in a multi-agent software dojo. Be concise, explicit about trade-offs, and flag uncertainty.",
      messages: [
        {
          role: "user",
          content: task.prompt,
        },
      ],
    };

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": token,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          if (attempt < maxRetries && response.status >= 500) {
            continue;
          }

          return {
            id: task.id,
            agent: task.agent,
            taskType: task.taskType,
            content: `[fallback] Claude request failed (${response.status}). Returning resilient placeholder so orchestration can continue.`,
            error: `http-${response.status}`,
            metadata: {
              agent: "claude",
              provider: "anthropic",
              live: false,
              status: response.status,
              errorBody,
              latencyMs: Date.now() - startedAt,
            },
          };
        }

        const payload = (await response.json()) as {
          content?: Array<{ type?: string; text?: string }>;
        };
        const content = payload.content
          ?.filter((item) => item.type === "text" && typeof item.text === "string")
          .map((item) => item.text)
          .join("\n")
          .trim();

        return {
          id: task.id,
          agent: task.agent,
          taskType: task.taskType,
          content: content && content.length > 0 ? content : "[fallback] Empty Claude response.",
          metadata: {
            agent: "claude",
            provider: "anthropic",
            live: true,
            model,
            latencyMs: Date.now() - startedAt,
          },
        };
      } catch (error) {
        if (attempt < maxRetries) {
          continue;
        }

        return {
          id: task.id,
          agent: task.agent,
          taskType: task.taskType,
          content: "[fallback] Claude request error. Returning resilient placeholder instead of failing the workflow.",
          error: error instanceof Error ? error.message : "unknown error",
          metadata: {
            agent: "claude",
            provider: "anthropic",
            live: false,
            latencyMs: Date.now() - startedAt,
          },
        };
      } finally {
        clearTimeout(timeout);
      }
    }

    return {
      id: task.id,
      agent: task.agent,
      taskType: task.taskType,
      content: "[fallback] Claude retry budget exhausted.",
      error: "retry-budget-exhausted",
      metadata: {
        agent: "claude",
        provider: "anthropic",
        live: false,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}
