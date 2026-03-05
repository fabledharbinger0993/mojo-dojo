import { ClassificationResult, TASK_TAGS, TaskTag } from "../types";

/**
 * TaskClassifier identifies which specialist agents should participate.
 *
 * In the AI collaboration dojo, this classifier is intentionally explicit:
 * it records rationale so we can expose transparent delegation, feed future
 * evaluation decisions, and persist useful memory traces across sessions.
 */
export class TaskClassifier {
  private readonly keywordMatchers: Record<TaskTag, RegExp[]> = {
    research: [
      /research/i,
      /find sources?/i,
      /cite|citation/i,
      /latest|news|current/i,
      /web|search|look up/i,
    ],
    reasoning: [
      /reason|analy[sz]e|trade[- ]?off/i,
      /why|explain|deliberat/i,
      /pros? and cons?/i,
      /decision|framework/i,
    ],
    code: [
      /code|implement|refactor/i,
      /bug|fix|test|lint/i,
      /function|class|api/i,
      /build|compile|run/i,
    ],
    system_action: [
      /docker|container|compose/i,
      /terminal|shell|command/i,
      /filesystem|file|folder|directory/i,
      /deploy|environment|infra/i,
    ],
  };

  classify(userMessage: string): ClassificationResult {
    const message = userMessage.trim();
    const matched = new Set<TaskTag>();
    const rationale: string[] = [];

    for (const tag of TASK_TAGS) {
      const hits = this.keywordMatchers[tag].filter((re) => re.test(message));
      if (hits.length > 0) {
        matched.add(tag);
        rationale.push(`${tag}: matched ${hits.length} keyword pattern(s)`);
      }
    }

    // Fallback: if nothing is explicit, default to reasoning-first behavior.
    if (matched.size === 0) {
      matched.add("reasoning");
      rationale.push("fallback: no direct keyword match, defaulted to reasoning");
    }

    return {
      tags: Array.from(matched),
      isMixed: matched.size > 1,
      rationale,
    };
  }
}
