import { RoutedAgent } from "../interfaces";
import { AgentResult, AgentTask } from "../../types";

/**
 * ChatGPT reasoning wrapper.
 *
 * Paired with Claude, this supports parallel reasoning perspectives that the
 * orchestrator can compare before evaluation and memory persistence.
 */
export class ChatGPTReasoningAgent implements RoutedAgent {
  readonly id = "reasoning.chatgpt";
  readonly role = "reasoning" as const;
  readonly modelName = "ChatGPT";

  async handle(task: AgentTask): Promise<AgentResult> {
    const env =
      (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
        ?.env ?? {};
    const startedAt = Date.now();
    const timeoutMs = Number(env.MOJO_REASONING_TIMEOUT_MS ?? "12000");
    const endpoint =
      env.MOJO_OPENAI_ENDPOINT ??
      env.OPENAI_BASE_URL ??
      "https://api.openai.com/v1/chat/completions";
    const model = env.MOJO_REASONING_MODEL ?? env.OPENAI_MODEL ?? "gpt-4.1-mini";
    const token = env.OPENAI_API_KEY ?? env.GITHUB_TOKEN;

    if (!token) {
      return {
        agentId: this.id,
        tag: this.role,
        content: "[stub] ChatGPT credentials are not configured. Set OPENAI_API_KEY (or GITHUB_TOKEN) to enable live reasoning.",
        metadata: {
          provider: this.modelName,
          live: false,
          durationMs: Date.now() - startedAt,
        },
      };
    }

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
              content: task.userMessage,
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          agentId: this.id,
          tag: this.role,
          content: `[fallback] ChatGPT request failed (${response.status}). Returning local reasoning fallback.`,
          metadata: {
            provider: this.modelName,
            live: false,
            status: response.status,
            errorBody,
            durationMs: Date.now() - startedAt,
          },
        };
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();

      return {
        agentId: this.id,
        tag: this.role,
        content: content && content.length > 0 ? content : "[fallback] Empty model response.",
        metadata: {
          provider: this.modelName,
          live: true,
          model,
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (error) {
      return {
        agentId: this.id,
        tag: this.role,
        content: "[fallback] ChatGPT request error. Returning resilient placeholder instead of failing the workflow.",
        metadata: {
          provider: this.modelName,
          live: false,
          error: error instanceof Error ? error.message : "unknown error",
          durationMs: Date.now() - startedAt,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
