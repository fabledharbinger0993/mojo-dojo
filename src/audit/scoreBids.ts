import {
  AuditBidComparison,
  AuditBidScore,
  AuditCriterionScore,
  RouterResult,
} from "../types";

function scoreText(content: string | undefined, styleHints?: string): AuditBidScore {
  const text = (content ?? "").trim();

  const correctnessSignals =
    Number(/\b(correct|edge case|validate|input|bug|fix)\b/i.test(text)) * 20 +
    Number(/```[\s\S]*```/.test(text)) * 15;

  const maintainabilitySignals =
    Number(/\b(readable|maintainable|refactor|clean|modular)\b/i.test(text)) * 20 +
    Number(/\b(trade[- ]?off|assumption)\b/i.test(text)) * 10;

  const riskAwarenessSignals = Number(/\b(risk|security|unsafe|failure|fallback)\b/i.test(text)) * 15;
  const testSignals = Number(/\b(test|unit test|integration|coverage)\b/i.test(text)) * 15;
  const styleFitSignals = scoreStyleFitSignals(text, styleHints);

  const reliabilityPenalty =
    Number(/\[(stub|error|fallback)\]/i.test(text)) * 25 + Number(text.length < 60) * 10;

  const total = Math.max(
    0,
    correctnessSignals +
      maintainabilitySignals +
      riskAwarenessSignals +
      testSignals -
      reliabilityPenalty +
      styleFitSignals,
  );

  return {
    correctnessSignals,
    maintainabilitySignals,
    riskAwarenessSignals,
    testSignals,
    styleFitSignals,
    reliabilityPenalty,
    total,
  };
}

function scoreStyleFitSignals(text: string, styleHints?: string): number {
  if (!styleHints || styleHints.trim().length === 0) {
    return 0;
  }

  const hintTokens = styleHints
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .filter((token) => token.length >= 3)
    .slice(0, 12);

  if (hintTokens.length === 0) {
    return 0;
  }

  const normalized = text.toLowerCase();
  const matches = hintTokens.filter((token) => normalized.includes(token)).length;
  return Math.min(20, matches * 4);
}

function flattenSecondOpinionContent(secondOpinion: RouterResult): string {
  const chunks: string[] = [];

  for (const [tag, results] of Object.entries(secondOpinion.byTag)) {
    for (const result of results ?? []) {
      chunks.push(`[${tag}:${result.agentId}] ${result.content}`);
    }
  }

  return chunks.join("\n\n");
}

export function compareBids(
  baselineLabel: string,
  baselineOutput: string | undefined,
  secondOpinion: RouterResult,
  options?: { styleHints?: string },
): AuditBidComparison {
  const secondOpinionLabel = "mojo.audit.second-opinion";
  const secondOpinionContent = flattenSecondOpinionContent(secondOpinion);

  const baselineScore = scoreText(baselineOutput, options?.styleHints);
  const secondOpinionScore = scoreText(secondOpinionContent, options?.styleHints);

  const criteria: AuditCriterionScore[] = [
    {
      criterion: "correctness",
      baseline: baselineScore.correctnessSignals,
      secondOpinion: secondOpinionScore.correctnessSignals,
      preferredLabel:
        secondOpinionScore.correctnessSignals >= baselineScore.correctnessSignals
          ? secondOpinionLabel
          : baselineLabel,
      rationale: "Rewards explicit correctness, validation, and concrete code evidence.",
    },
    {
      criterion: "maintainability",
      baseline: baselineScore.maintainabilitySignals,
      secondOpinion: secondOpinionScore.maintainabilitySignals,
      preferredLabel:
        secondOpinionScore.maintainabilitySignals >= baselineScore.maintainabilitySignals
          ? secondOpinionLabel
          : baselineLabel,
      rationale: "Rewards readable structure, assumptions, and trade-off clarity.",
    },
    {
      criterion: "risk-awareness",
      baseline: baselineScore.riskAwarenessSignals,
      secondOpinion: secondOpinionScore.riskAwarenessSignals,
      preferredLabel:
        secondOpinionScore.riskAwarenessSignals >= baselineScore.riskAwarenessSignals
          ? secondOpinionLabel
          : baselineLabel,
      rationale: "Rewards explicit security, failure-mode, and risk callouts.",
    },
    {
      criterion: "testing",
      baseline: baselineScore.testSignals,
      secondOpinion: secondOpinionScore.testSignals,
      preferredLabel:
        secondOpinionScore.testSignals >= baselineScore.testSignals
          ? secondOpinionLabel
          : baselineLabel,
      rationale: "Rewards test strategy visibility and verification intent.",
    },
    {
      criterion: "style-fit",
      baseline: baselineScore.styleFitSignals,
      secondOpinion: secondOpinionScore.styleFitSignals,
      preferredLabel:
        secondOpinionScore.styleFitSignals >= baselineScore.styleFitSignals
          ? secondOpinionLabel
          : baselineLabel,
      rationale:
        "Rewards overlap with provided codebase style hints (naming/structure cues).",
    },
    {
      criterion: "reliability",
      baseline: baselineScore.reliabilityPenalty,
      secondOpinion: secondOpinionScore.reliabilityPenalty,
      preferredLabel:
        secondOpinionScore.reliabilityPenalty <= baselineScore.reliabilityPenalty
          ? secondOpinionLabel
          : baselineLabel,
      rationale:
        "Penalizes placeholders, fallback-only responses, and very low-information output.",
    },
  ];

  const winnerLabel =
    secondOpinionScore.total >= baselineScore.total ? secondOpinionLabel : baselineLabel;

  const baselineStrengths = buildStrengths(baselineScore, options?.styleHints);
  const secondOpinionStrengths = buildStrengths(secondOpinionScore, options?.styleHints);
  const considerations = buildConsiderations(
    baselineLabel,
    baselineScore,
    secondOpinionScore,
    options?.styleHints,
  );

  const winnerReason = buildWinnerReason(
    winnerLabel,
    baselineLabel,
    baselineScore,
    secondOpinionScore,
    options?.styleHints,
  );

  return {
    method: "rubric-plus-narrative",
    winnerLabel,
    winnerReason,
    criteria,
    baselineStrengths,
    secondOpinionStrengths,
    considerations,
    baseline: {
      label: baselineLabel,
      score: baselineScore,
      content: baselineOutput,
    },
    secondOpinion: {
      label: secondOpinionLabel,
      score: secondOpinionScore,
      content: secondOpinionContent,
    },
  };
}

function buildStrengths(score: AuditBidScore, styleHints?: string): string[] {
  const strengths: string[] = [];

  if (score.correctnessSignals > 0) {
    strengths.push("Explicit correctness and validation signals");
  }
  if (score.maintainabilitySignals > 0) {
    strengths.push("Maintainability/trade-off reasoning is visible");
  }
  if (score.riskAwarenessSignals > 0) {
    strengths.push("Risk and failure-mode handling is acknowledged");
  }
  if (score.testSignals > 0) {
    strengths.push("Testing intent is included");
  }
  if ((styleHints ?? "").trim().length > 0 && score.styleFitSignals > 0) {
    strengths.push("Aligns with provided naming/style hints");
  }

  if (strengths.length === 0) {
    strengths.push("No strong quality signal detected yet");
  }

  return strengths;
}

function buildConsiderations(
  baselineLabel: string,
  baseline: AuditBidScore,
  secondOpinion: AuditBidScore,
  styleHints?: string,
): string[] {
  const notes: string[] = [];

  if (baseline.styleFitSignals > secondOpinion.styleFitSignals) {
    notes.push(
      `${baselineLabel} better matches current style hints; consider blending style choices with audit safeguards.`,
    );
  }

  if (secondOpinion.reliabilityPenalty > baseline.reliabilityPenalty) {
    notes.push("Audit result has more fallback/error signals; validate reliability before full replacement.");
  }

  if ((styleHints ?? "").trim().length === 0) {
    notes.push("No style hints were provided; style-fit criterion is currently low-confidence.");
  }

  if (notes.length === 0) {
    notes.push("Criteria are directionally aligned; smallest-safe merge is likely the fastest path.");
  }

  return notes;
}

function buildWinnerReason(
  winnerLabel: string,
  baselineLabel: string,
  baseline: AuditBidScore,
  secondOpinion: AuditBidScore,
  styleHints?: string,
): string {
  const auditWins = [
    secondOpinion.correctnessSignals > baseline.correctnessSignals
      ? "more explicit error handling or validation"
      : "",
    secondOpinion.maintainabilitySignals > baseline.maintainabilitySignals
      ? "clearer separation of concerns and trade-off notes"
      : "",
    secondOpinion.riskAwarenessSignals > baseline.riskAwarenessSignals
      ? "stronger risk-awareness cues"
      : "",
    secondOpinion.testSignals > baseline.testSignals
      ? "better test coverage cues"
      : "",
  ].filter(Boolean);

  const baselineWins = [
    baseline.styleFitSignals > secondOpinion.styleFitSignals && (styleHints ?? "").trim().length > 0
      ? "closer alignment with existing naming/style hints"
      : "",
    baseline.reliabilityPenalty < secondOpinion.reliabilityPenalty
      ? "lower fallback/error penalties"
      : "",
  ].filter(Boolean);

  if (winnerLabel !== baselineLabel) {
    return `Audit result ranked higher: ${auditWins.join(", ") || "stronger rubric score"}. Baseline ranked higher on: ${baselineWins.join(", ") || "few style/reliability signals"}.`;
  }

  return `Original ranked higher: ${baselineWins.join(", ") || "stronger rubric score"}. Audit ranked higher on: ${auditWins.join(", ") || "selected quality dimensions"}.`;
}
