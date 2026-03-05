import { SecondOpinionAuditResult } from "../../types";

export interface AuditViewModel {
  title: string;
  subtitle: string;
  styleSourceLabel: string;
  styleHints?: string;
  considerations: string[];
  winnerReason: string;
  baseline: {
    label: string;
    score: number;
    strengths: string[];
  };
  secondOpinion: {
    label: string;
    score: number;
    strengths: string[];
  };
  criteriaSummary: Array<{
    criterion: string;
    preferredLabel: string;
    rationale: string;
  }>;
}

function toStyleSourceLabel(source: SecondOpinionAuditResult["styleHintSource"]): string {
  if (source === "context") {
    return "Style fit from your explicit preferences";
  }
  if (source === "inferred") {
    return "Style fit inferred from workspace code";
  }
  return "Style fit unavailable (no context and no inference sample)";
}

export function toAuditViewModel(result: SecondOpinionAuditResult): AuditViewModel {
  return {
    title: "Second Opinion Audit",
    subtitle: "Two bids, no ego: compare and choose what fits your codebase.",
    styleSourceLabel: toStyleSourceLabel(result.styleHintSource),
    styleHints: result.styleHintsUsed,
    considerations: result.comparison.considerations,
    winnerReason: result.comparison.winnerReason,
    baseline: {
      label: result.comparison.baseline.label,
      score: result.comparison.baseline.score.total,
      strengths: result.comparison.baselineStrengths,
    },
    secondOpinion: {
      label: result.comparison.secondOpinion.label,
      score: result.comparison.secondOpinion.score.total,
      strengths: result.comparison.secondOpinionStrengths,
    },
    criteriaSummary: result.comparison.criteria.map((criterion) => ({
      criterion: criterion.criterion,
      preferredLabel: criterion.preferredLabel,
      rationale: criterion.rationale,
    })),
  };
}
