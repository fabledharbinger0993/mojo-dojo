import { ClaudeReasoningAgent } from "../agents/reasoning/ClaudeReasoningAgent";
import { AgentTask, OrchestrationContext } from "../types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makeTask(id: string): AgentTask {
  return {
    id,
    sessionId: "claude-mock-test-session",
    agent: "REASONING",
    taskType: "reasoning",
    prompt: "Compare two implementation bids and highlight risk trade-offs.",
  };
}

function makeContext(): OrchestrationContext {
  return {
    prompt: "Compare two implementation bids and highlight risk trade-offs.",
    timeoutMs: 1200,
  };
}

async function testSuccessPath(): Promise<void> {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "Claude says bid B reduces retry risk." }],
      }),
      text: async () => "",
    } as Response;
  }) as typeof fetch;

  try {
    const agent = new ClaudeReasoningAgent({
      apiKey: "fake-key",
      endpoint: "https://mock.anthropic.local/v1/messages",
      model: "claude-test-model",
      timeoutMs: 800,
      maxRetries: 0,
    });

    const result = await agent.run(makeTask("success-case"), makeContext());

    assert(!result.error, "success path should not set result.error");
    assert(
      result.content.includes("reduces retry risk"),
      "success path should include normalized model text",
    );
    assert(result.metadata?.provider === "anthropic", "provider metadata should be anthropic");
    assert(result.metadata?.live === true, "success path should set live=true");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testErrorPath(): Promise<void> {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return {
      ok: false,
      status: 503,
      text: async () => "service unavailable",
      json: async () => ({}),
    } as Response;
  }) as typeof fetch;

  try {
    const agent = new ClaudeReasoningAgent({
      apiKey: "fake-key",
      endpoint: "https://mock.anthropic.local/v1/messages",
      model: "claude-test-model",
      timeoutMs: 800,
      maxRetries: 0,
    });

    const result = await agent.run(makeTask("error-case"), makeContext());

    assert(Boolean(result.error), "error path should set result.error");
    assert(
      /fallback/i.test(result.content),
      "error path should return fallback content",
    );
    assert(result.metadata?.provider === "anthropic", "error path provider metadata mismatch");
    assert(result.metadata?.live === false, "error path should set live=false");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function run(): Promise<void> {
  await testSuccessPath();
  await testErrorPath();
  console.log("Claude adapter mock integration checks passed.");
}

run().catch((error) => {
  console.error("Claude adapter mock integration checks failed:", error);
  process.exitCode = 1;
});
