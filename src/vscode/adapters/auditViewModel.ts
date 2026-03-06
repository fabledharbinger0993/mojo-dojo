import { SecondOpinionAuditResult } from "../../types";

interface ModeViewModel {
  label: "Collaborative" | "Transactional" | "Boundary" | "Unavailable";
  description: string;
  hint?: string;
}

export interface AuditViewModel {
  title: string;
  subtitle: string;
  styleSourceLabel: string;
  styleHints?: string;
  considerations: string[];
  considerationsSuppressed: boolean;
  considerationsSuppressedReason?: string;
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
  diffAvailable: boolean;
  diff: {
    baseline: string;
    audit: string;
    unified: string | null;
  };
  mode: ModeViewModel;
  trace: {
    status: "ok" | "partial_failure" | "failure";
    statusBanner?: string;
    statusDetailsLabel?: string;
    failedAgents: string[];
    engagementStance: string;
    inspectLabel: string;
    taskIds: string[];
    winnerTaskId?: string;
    rubricVersion?: string;
    traceExpandedByDefault: boolean;
    traceCollapsed: boolean;
  };
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

interface TraceContext {
  status?: "ok" | "partial_failure" | "failure";
  engagementStance?: string;
  outputMode?: "boundary" | "concise" | "full";
  failedAgents?: string[];
  taskIds?: string[];
  winnerTaskId?: string;
  rubricVersion?: string;
  includeConsiderations?: boolean;
  traceExpandedByDefault?: boolean;
  baselineCode?: string;
  auditCode?: string;
}

function toEngagementStanceLabel(stance?: string): string {
  if (stance === "collaborative") {
    return "Collaborative (best for deep reasoning and explicit trade-offs)";
  }
  if (stance === "transactional") {
    return "Transactional (concise and task-focused)";
  }
  if (stance === "boundary") {
    return "Boundary mode (respect and safety guardrails active)";
  }
  return "Unavailable";
}

function toModeViewModel(
  stance: TraceContext["engagementStance"],
  outputMode: NonNullable<TraceContext["outputMode"]>,
): ModeViewModel {
  if (stance === "collaborative") {
    return {
      label: "Collaborative",
      description: "Full reasoning, uncertainty, and critique are enabled.",
    };
  }

  if (stance === "transactional") {
    return {
      label: "Transactional",
      description: "Concise output mode is active with reduced explainability.",
      hint: "Current mode: concise. Switch to collaborative for full reasoning signals.",
    };
  }

  if (stance === "boundary" || outputMode === "boundary") {
    return {
      label: "Boundary",
      description: "Safety boundaries are active and some content is intentionally constrained.",
      hint:
        "Current mode: boundary. Keep prompts respectful and specific to restore collaborative depth.",
    };
  }

  return {
    label: "Unavailable",
    description: "Mode information is currently unavailable.",
  };
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function buildLcsTable(a: string[], b: string[]): number[][] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }

  return table;
}

function buildUnifiedDiff(baseline: string, audit: string): string | null {
  if (baseline.trim().length === 0 || audit.trim().length === 0) {
    return null;
  }

  const a = splitLines(baseline);
  const b = splitLines(audit);
  const table = buildLcsTable(a, b);

  const diffLines: string[] = ["--- baseline", "+++ audit", "@@"]; 
  let i = a.length;
  let j = b.length;
  const reversed: string[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      reversed.push(` ${a[i - 1]}`);
      i -= 1;
      j -= 1;
      continue;
    }

    if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      reversed.push(`+${b[j - 1]}`);
      j -= 1;
      continue;
    }

    if (i > 0) {
      reversed.push(`-${a[i - 1]}`);
      i -= 1;
    }
  }

  diffLines.push(...reversed.reverse());
  return diffLines.join("\n");
}

export function toAuditViewModel(
  result: SecondOpinionAuditResult,
  traceContext?: TraceContext,
): AuditViewModel {
  const includeConsiderations = traceContext?.includeConsiderations ?? true;
  const traceExpandedByDefault = traceContext?.traceExpandedByDefault ?? true;
  const outputMode = traceContext?.outputMode ?? "full";
  const mode = toModeViewModel(traceContext?.engagementStance, outputMode);
  const considerationsSuppressed = !includeConsiderations;
  const considerationsSuppressedReason =
    !considerationsSuppressed
      ? undefined
      : outputMode === "concise"
        ? "Enable collaborative mode for full reasoning signals."
        : "Boundary mode is active. Switch to collaborative mode for full reasoning signals.";
  const inspectLabel =
    outputMode === "full"
      ? "Inspect trace"
      : "Limited trace - collaborative mode surfaces full reasoning";
  const status = traceContext?.status ?? "ok";
  const failedAgents = traceContext?.failedAgents ?? [];
  const statusBanner =
    status === "partial_failure"
      ? "One of the coding agents failed; remaining agents responded and the result was evaluated without the failed output."
      : status === "failure"
        ? "All routed agents failed in this run. Please retry or adjust the prompt."
        : undefined;
  const statusDetailsLabel =
    status === "partial_failure" || status === "failure"
      ? "Details"
      : undefined;
  const baselineCode = traceContext?.baselineCode?.trim() ?? "";
  const auditCode = traceContext?.auditCode?.trim() ?? "";
  const diffAvailable = baselineCode.length > 0 && auditCode.length > 0;
  const unified = diffAvailable ? buildUnifiedDiff(baselineCode, auditCode) : null;

  return {
    title: "Second Opinion Audit",
    subtitle: "Two bids, no ego: compare and choose what fits your codebase.",
    styleSourceLabel: toStyleSourceLabel(result.styleHintSource),
    styleHints: result.styleHintsUsed,
    considerations: includeConsiderations ? result.comparison.considerations : [],
    considerationsSuppressed,
    considerationsSuppressedReason,
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
    diffAvailable,
    diff: {
      baseline: baselineCode,
      audit: auditCode,
      unified,
    },
    mode,
    trace: {
      status,
      statusBanner,
      statusDetailsLabel,
      failedAgents,
      engagementStance: toEngagementStanceLabel(traceContext?.engagementStance),
      inspectLabel,
      taskIds: traceContext?.taskIds ?? result.secondOpinion.trace?.tasks.map((task) => task.id) ?? [],
      winnerTaskId: traceContext?.winnerTaskId,
      rubricVersion: traceContext?.rubricVersion,
      traceExpandedByDefault,
      traceCollapsed: !traceExpandedByDefault,
    },
  };
}
