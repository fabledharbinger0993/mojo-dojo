import { AgentRegistry, createDefaultAgentRegistry } from "../agents/AgentRegistry";
import { ReasoningAgent } from "../agents/interfaces";
import { GrokCodeAgent } from "../agents/code/GrokCodeAgent";
import { HaikuCodeAgent } from "../agents/code/HaikuCodeAgent";
import { QwenCodeAgent } from "../agents/code/QwenCodeAgent";
import { PerplexityResearchAgent } from "../agents/research/PerplexityResearchAgent";
import { ChatGPTReasoningAgent } from "../agents/reasoning/ChatGPTReasoningAgent";
import { ClaudeReasoningAgent } from "../agents/reasoning/ClaudeReasoningAgent";
import { GeminiSystemAgent } from "../agents/system/GeminiSystemAgent";
import { OrchestrationRuntimeConfig } from "../types";
import { AgentRouter } from "./AgentRouter";

function mergeRegistryOverride(
  defaults: ReturnType<AgentRegistry["getEntries"]>[number],
  override?: Partial<ReturnType<AgentRegistry["getEntries"]>[number]>,
): ReturnType<AgentRegistry["getEntries"]>[number] {
  if (!override) {
    return defaults;
  }

  return {
    ...defaults,
    timeoutMs: override.timeoutMs ?? defaults.timeoutMs,
    maxConcurrency: override.maxConcurrency ?? defaults.maxConcurrency,
    priority: override.priority ?? defaults.priority,
    // Deployment-time invariants stay fixed from defaults.
    enabled: defaults.enabled,
    apiKeyEnv: defaults.apiKeyEnv,
    adapterClass: defaults.adapterClass,
  };
}

function buildRegistry(runtimeConfig?: OrchestrationRuntimeConfig): AgentRegistry {
  const defaultRegistry = createDefaultAgentRegistry();
  const overrides = runtimeConfig?.registryEntries ?? [];
  if (overrides.length === 0) {
    return defaultRegistry;
  }

  const overrideById = new Map(overrides.map((entry) => [entry.id, entry]));
  const mergedEntries = defaultRegistry
    .getEntries()
    .map((entry) => mergeRegistryOverride(entry, overrideById.get(entry.id)));

  return new AgentRegistry(mergedEntries);
}

export function createDefaultRouter(
  runtimeConfig?: OrchestrationRuntimeConfig,
  registry: AgentRegistry = buildRegistry(runtimeConfig),
): AgentRouter {
  const agentsById: Record<string, ReasoningAgent> = {
    "reasoning.chatgpt": new ChatGPTReasoningAgent(runtimeConfig?.providers?.chatgpt),
    "reasoning.claude": new ClaudeReasoningAgent(runtimeConfig?.providers?.claude),
    "research.perplexity": new PerplexityResearchAgent(),
    "code.qwen": new QwenCodeAgent(),
    "code.grok": new GrokCodeAgent(),
    "code.haiku": new HaikuCodeAgent(),
    "system.gemini": new GeminiSystemAgent(),
  };

  return new AgentRouter({
    runtimeConfig,
    registry,
    agentsById,
  });
}
