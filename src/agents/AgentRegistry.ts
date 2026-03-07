import { AgentRole } from "../types";

export interface AgentRegistryEntry {
  id: string;
  provider: string;
  roles: readonly AgentRole[];
  adapterClass: string;
  apiKeyEnv: string;
  priority: number;
  timeoutMs: number;
  maxConcurrency?: number;
  enabled: boolean;
}

export class AgentRegistry {
  constructor(private readonly entries: AgentRegistryEntry[]) {}

  getEntries(): AgentRegistryEntry[] {
    return [...this.entries];
  }

  findEnabledByRole(role: AgentRole): AgentRegistryEntry[] {
    return this.entries
      .filter((entry) => entry.enabled && entry.roles.includes(role))
      .sort((a, b) => b.priority - a.priority);
  }
}

export function createDefaultAgentRegistry(): AgentRegistry {
  return new AgentRegistry([
    {
      id: "reasoning.chatgpt",
      provider: "openai",
      roles: ["REASONING"],
      adapterClass: "ChatGPTReasoningAgent",
      apiKeyEnv: "OPENAI_API_KEY",
      priority: 100,
      timeoutMs: 12000,
      maxConcurrency: 2,
      enabled: true,
    },
    {
      id: "reasoning.claude",
      provider: "anthropic",
      roles: ["REASONING"],
      adapterClass: "ClaudeReasoningAgent",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      priority: 95,
      timeoutMs: 12000,
      maxConcurrency: 2,
      enabled: true,
    },
    {
      id: "research.perplexity",
      provider: "perplexity",
      roles: ["RESEARCH"],
      adapterClass: "PerplexityResearchAgent",
      apiKeyEnv: "PERPLEXITY_API_KEY",
      priority: 90,
      timeoutMs: 12000,
      maxConcurrency: 1,
      enabled: false,
    },
    {
      id: "code.qwen",
      provider: "qwen",
      roles: ["CODE"],
      adapterClass: "QwenCodeAgent",
      apiKeyEnv: "QWEN_API_KEY",
      priority: 80,
      timeoutMs: 8000,
      maxConcurrency: 2,
      enabled: true,
    },
    {
      id: "code.grok",
      provider: "grok",
      roles: ["CODE"],
      adapterClass: "GrokCodeAgent",
      apiKeyEnv: "GROK_API_KEY",
      priority: 78,
      timeoutMs: 8000,
      maxConcurrency: 2,
      enabled: true,
    },
    {
      id: "code.haiku",
      provider: "haiku",
      roles: ["CODE"],
      adapterClass: "HaikuCodeAgent",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      priority: 76,
      timeoutMs: 8000,
      maxConcurrency: 2,
      enabled: true,
    },
    {
      id: "system.gemini",
      provider: "google",
      roles: ["TOOL"],
      adapterClass: "GeminiSystemAgent",
      apiKeyEnv: "GEMINI_API_KEY",
      priority: 70,
      timeoutMs: 10000,
      maxConcurrency: 1,
      enabled: true,
    },
  ]);
}
