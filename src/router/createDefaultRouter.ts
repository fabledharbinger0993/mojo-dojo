import { GrokCodeAgent } from "../agents/code/GrokCodeAgent";
import { HaikuCodeAgent } from "../agents/code/HaikuCodeAgent";
import { QwenCodeAgent } from "../agents/code/QwenCodeAgent";
import { PerplexityResearchAgent } from "../agents/research/PerplexityResearchAgent";
import { ChatGPTReasoningAgent } from "../agents/reasoning/ChatGPTReasoningAgent";
import { ClaudeReasoningAgent } from "../agents/reasoning/ClaudeReasoningAgent";
import { GeminiSystemAgent } from "../agents/system/GeminiSystemAgent";
import { AgentRouter } from "./AgentRouter";

/**
 * Creates the default Mojo-Dojo router aligned to README role mapping.
 *
 * This defaults to plural agents for REASONING and CODE so the orchestrator can
 * compare outputs, run evaluation, and update memory with richer traces.
 */
export function createDefaultRouter(): AgentRouter {
  return new AgentRouter({
    research: [new PerplexityResearchAgent()],
    reasoning: [new ClaudeReasoningAgent(), new ChatGPTReasoningAgent()],
    code: [new QwenCodeAgent(), new GrokCodeAgent(), new HaikuCodeAgent()],
    system_action: [new GeminiSystemAgent()],
  });
}
