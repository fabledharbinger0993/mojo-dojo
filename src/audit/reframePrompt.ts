import { PromptReframe } from "../types";

/**
 * Reframes transactional prompts into collaboration-oriented instructions.
 *
 * This keeps the original user intent intact while adding context, constraints,
 * and explicit quality asks that usually improve downstream code quality.
 */
export function reframePrompt(userPrompt: string): PromptReframe {
  const cleaned = userPrompt.trim();

  const collaborativePrompt = [
    "Please act as my coding partner and advocate for implementation quality.",
    "Keep the intent exactly as requested, and produce a practical solution I can ship.",
    "Briefly call out trade-offs, risks, and recommended tests.",
    "Prioritize correctness, readability, and maintainability.",
    "If assumptions are unclear, state them before final code so I can confirm quickly.",
    "",
    `Task:\n${cleaned}`,
  ].join("\n");

  return {
    originalPrompt: cleaned,
    collaborativePrompt,
    userFacingIntro:
      "Here is what I asked on your behalf to get a stronger second bid while keeping your intent unchanged.",
    notes: [
      "Keeps your original task intact and adds quality guardrails.",
      "Requests explicit assumptions, trade-offs, and risk callouts.",
      "Aims for production-ready code, not just fast output.",
    ],
  };
}
