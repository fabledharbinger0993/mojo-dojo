import { ReasoningAgent } from "../interfaces";
import { AgentResult, AgentTask, OrchestrationContext, ProviderRuntimeConfig } from "../../types";

/**
 * ChatGPT reasoning wrapper.
 *
 * Paired with Claude, this supports parallel reasoning perspectives that the
 * orchestrator can compare before evaluation and memory persistence.
 */
export class ChatGPTReasoningAgent implements ReasoningAgent {
  readonly id = "reasoning.chatgpt";
  readonly roles = ["REASONING"] as const;

  constructor(private readonly providerConfig?: ProviderRuntimeConfig) {}

  async run(task: AgentTask, context: OrchestrationContext): Promise<AgentResult> {
    const startedAt = Date.now();
    const timeoutMs = this.providerConfig?.timeoutMs ?? context.timeoutMs;
    const endpoint =
      this.providerConfig?.endpoint ?? "https://api.openai.com/v1/chat/completions";
    const model = this.providerConfig?.model ?? "gpt-4.1-mini";
    const token = this.providerConfig?.apiKey;
    const configRetries = this.providerConfig?.maxRetries;
    const maxRetries = Math.max(0, Math.min(configRetries ?? 1, 2));

    if (!token) {
      return {
        id: task.id,
        agent: task.agent,
        taskType: task.taskType,
        content: "[stub] ChatGPT credentials are not configured. Inject provider config with apiKey to enable live reasoning.",
        error: "missing-api-key",
        metadata: {
          agent: "chatgpt",
          provider: "openai",
          live: false,
          latencyMs: Date.now() - startedAt,
        },
      };
    }

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
              {
                role: "system",
                content:
                  "You are a reasoning specialist in a multi-agent software dojo. Be concise, explicit about trade-offs, and flag uncertainty.",
              },
              {
                role: "user",
                content: task.prompt,
              },
            ],
          }),
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
            content: `[fallback] ChatGPT request failed (${response.status}). Returning local reasoning fallback.`,
            error: `http-${response.status}`,
            metadata: {
              agent: "chatgpt",
              provider: "openai",
              live: false,
              status: response.status,
              errorBody,
              latencyMs: Date.now() - startedAt,
            },
          };
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = payload.choices?.[0]?.message?.content?.trim();

        return {
          id: task.id,
          agent: task.agent,
          taskType: task.taskType,
          content: content && content.length > 0 ? content : "[fallback] Empty model response.",
          metadata: {
            agent: "chatgpt",
            provider: "openai",
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
          content: "[fallback] ChatGPT request error. Returning resilient placeholder instead of failing the workflow.",
          error: error instanceof Error ? error.message : "unknown error",
          metadata: {
            agent: "chatgpt",
            provider: "openai",
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
      content: "[fallback] ChatGPT retry budget exhausted.",
      error: "retry-budget-exhausted",
      metadata: {
        agent: "chatgpt",
        provider: "openai",
        live: false,
        latencyMs: Date.now() - startedAt,
      },
    };
  }
}
