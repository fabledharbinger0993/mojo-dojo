import { promises as fs } from "node:fs";
import path from "node:path";
import { generateTaskId } from "../ids";
import { orchestrate, runSecondOpinionAudit } from "../orchestrate";
import {
  EngagementStance,
  OrchestrationRuntimeConfig,
  SecondOpinionAuditInput,
  UserMessage,
} from "../types";
import { toAuditViewModel } from "../vscode/adapters/auditViewModel";

const MOCK_RUNTIME_CONFIG: OrchestrationRuntimeConfig = { useMockAgents: true };

interface AuditFixtureExpected {
  method?: string;
  winnerLabel?: string;
  mustMention?: string[];
  considerationsMustInclude?: string[];
}

interface AuditFixture {
  kind?: "audit";
  name: string;
  description?: string;
  input: SecondOpinionAuditInput;
  expected: AuditFixtureExpected;
}

interface OrchestrationFixtureExpected {
  expectedStatus?: "ok" | "partial_failure" | "failure";
  expectedTaskCount?: number;
  expectedStance?: EngagementStance;
  requireDeterministicIds?: boolean;
  requireTaskResultReferentialIntegrity?: boolean;
  requireEvaluationReferences?: boolean;
  expectedErroredCodingResults?: number;
  requireEvaluationExcludesErroredResults?: boolean;
}

interface OrchestrationFixture {
  kind: "orchestration";
  name: string;
  description?: string;
  input: UserMessage;
  expected: OrchestrationFixtureExpected;
}

interface StancePolicyFixtureExpected {
  collaborativeConsiderationsNonEmpty: boolean;
  transactionalConsiderationsEmpty: boolean;
  transactionalConsiderationsSuppressed: boolean;
  collaborativeConsiderationsSuppressed: boolean;
  transactionalTraceCollapsed: boolean;
  collaborativeModeLabel?: string;
  transactionalModeLabel?: string;
  collaborativeModeHintAbsent?: boolean;
  transactionalModeHintNonEmpty?: boolean;
  collaborativeDiffAvailable?: boolean;
  transactionalDiffAvailable?: boolean;
}

interface StancePolicyFixture {
  kind: "stance-policy";
  name: string;
  description?: string;
  input: {
    userPrompt: string;
    baselineOutput?: string;
    baselineLabel?: string;
  };
  expected: StancePolicyFixtureExpected;
}

type Fixture = AuditFixture | OrchestrationFixture | StancePolicyFixture;

function assertIncludesAll(
  source: string,
  required: string[] | undefined,
  label: string,
  fixtureName: string,
): string[] {
  const failures: string[] = [];
  for (const phrase of required ?? []) {
    if (!source.includes(phrase.toLowerCase())) {
      failures.push(`${fixtureName}: missing ${label} phrase "${phrase}"`);
    }
  }
  return failures;
}

async function loadFixtures(fixturesDir: string): Promise<Fixture[]> {
  const entries = await fs.readdir(fixturesDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(fixturesDir, entry.name));

  const fixtures: Fixture[] = [];
  for (const filePath of jsonFiles) {
    const raw = await fs.readFile(filePath, "utf8");
    fixtures.push(JSON.parse(raw) as Fixture);
  }
  return fixtures;
}

function validateAuditFixture(
  fixture: AuditFixture,
  failures: string[],
  comparison: Awaited<ReturnType<typeof runSecondOpinionAudit>>["comparison"],
): void {
  if (fixture.expected.method && comparison.method !== fixture.expected.method) {
    failures.push(
      `${fixture.name}: expected method ${fixture.expected.method}, got ${comparison.method}`,
    );
  }

  if (fixture.expected.winnerLabel && comparison.winnerLabel !== fixture.expected.winnerLabel) {
    failures.push(
      `${fixture.name}: expected winner ${fixture.expected.winnerLabel}, got ${comparison.winnerLabel}`,
    );
  }

  failures.push(
    ...assertIncludesAll(
      comparison.winnerReason.toLowerCase(),
      fixture.expected.mustMention,
      "winnerReason",
      fixture.name,
    ),
  );

  failures.push(
    ...assertIncludesAll(
      comparison.considerations.join("\n").toLowerCase(),
      fixture.expected.considerationsMustInclude,
      "considerations",
      fixture.name,
    ),
  );
}

function validateOrchestrationFixture(
  fixture: OrchestrationFixture,
  failures: string[],
  status: Awaited<ReturnType<typeof orchestrate>>["status"],
  trace: NonNullable<Awaited<ReturnType<typeof orchestrate>>["trace"]>,
  evaluation: Awaited<ReturnType<typeof orchestrate>>["evaluation"],
): void {
  if (fixture.expected.expectedStatus && status !== fixture.expected.expectedStatus) {
    failures.push(
      `${fixture.name}: expected status ${fixture.expected.expectedStatus}, got ${status}`,
    );
  }

  if (
    typeof fixture.expected.expectedTaskCount === "number" &&
    trace.tasks.length !== fixture.expected.expectedTaskCount
  ) {
    failures.push(
      `${fixture.name}: expected ${fixture.expected.expectedTaskCount} tasks, got ${trace.tasks.length}`,
    );
  }

  if (fixture.expected.expectedStance && trace.engagementStance !== fixture.expected.expectedStance) {
    failures.push(
      `${fixture.name}: expected stance ${fixture.expected.expectedStance}, got ${trace.engagementStance}`,
    );
  }

  const taskIds = trace.tasks.map((task) => task.id);
  const resultIds = trace.results.map((result) => result.id);
  const erroredResultIds = new Set(trace.results.filter((result) => result.error).map((result) => result.id));
  const erroredCodingResults = trace.results.filter(
    (result) => result.taskType === "coding" && result.error,
  );

  if (
    typeof fixture.expected.expectedErroredCodingResults === "number" &&
    erroredCodingResults.length !== fixture.expected.expectedErroredCodingResults
  ) {
    failures.push(
      `${fixture.name}: expected ${fixture.expected.expectedErroredCodingResults} errored coding result(s), got ${erroredCodingResults.length}`,
    );
  }

  if (fixture.expected.requireDeterministicIds) {
    for (let i = 0; i < trace.tasks.length; i += 1) {
      const task = trace.tasks[i];
      const expectedId = generateTaskId(fixture.input.sessionId, task.agent, task.taskType, i + 1);
      if (taskIds[i] !== expectedId) {
        failures.push(
          `${fixture.name}: non-deterministic task id at index ${i}; expected ${expectedId}, got ${taskIds[i]}`,
        );
      }
    }
  }

  if (fixture.expected.requireTaskResultReferentialIntegrity) {
    const taskIdSet = new Set(taskIds);
    for (const resultId of resultIds) {
      if (!taskIdSet.has(resultId)) {
        failures.push(
          `${fixture.name}: result id ${resultId} is not present in routed task ids`,
        );
      }
    }
  }

  if (fixture.expected.requireEvaluationReferences && evaluation) {
    const resultIdSet = new Set(resultIds);
    if (!resultIdSet.has(evaluation.winnerTaskId)) {
      failures.push(
        `${fixture.name}: evaluation winnerTaskId ${evaluation.winnerTaskId} not found in trace results`,
      );
    }

    for (const score of evaluation.scores) {
      if (!resultIdSet.has(score.taskId)) {
        failures.push(
          `${fixture.name}: evaluation score taskId ${score.taskId} not found in trace results`,
        );
      }
    }
  }

  if (fixture.expected.requireEvaluationExcludesErroredResults && evaluation) {
    if (erroredResultIds.has(evaluation.winnerTaskId)) {
      failures.push(
        `${fixture.name}: evaluation winnerTaskId ${evaluation.winnerTaskId} points to an errored result`,
      );
    }

    for (const score of evaluation.scores) {
      if (erroredResultIds.has(score.taskId)) {
        failures.push(
          `${fixture.name}: evaluation score taskId ${score.taskId} points to an errored result`,
        );
      }
    }
  }
}

async function run(): Promise<void> {
  const startedAt = Date.now();
  const repoRoot = path.resolve(__dirname, "..", "..");
  const fixturesDir = path.join(repoRoot, "fixtures", "audit");
  const fixtures = await loadFixtures(fixturesDir);

  if (fixtures.length === 0) {
    console.log("No audit fixtures found.");
    return;
  }

  const failures: string[] = [];
  let passed = 0;

  for (const fixture of fixtures) {
    const beforeCount = failures.length;

    if (fixture.kind === "orchestration") {
      const result = await orchestrate({
        ...fixture.input,
        runtimeConfig: MOCK_RUNTIME_CONFIG,
      });
      if (!result.trace) {
        failures.push(`${fixture.name}: expected trace to be present`);
      } else {
        validateOrchestrationFixture(
          fixture,
          failures,
          result.status,
          result.trace,
          result.evaluation,
        );
      }
    } else if (fixture.kind === "stance-policy") {
      const collaborativeMessage: UserMessage = {
        sessionId: `${fixture.name}-collaborative`,
        text: fixture.input.userPrompt,
        timestamp: new Date().toISOString(),
        context: {
          engagementStanceOverride: "collaborative",
        },
        runtimeConfig: MOCK_RUNTIME_CONFIG,
      };

      const transactionalMessage: UserMessage = {
        sessionId: `${fixture.name}-transactional`,
        text: fixture.input.userPrompt,
        timestamp: new Date().toISOString(),
        context: {
          engagementStanceOverride: "transactional",
        },
        runtimeConfig: MOCK_RUNTIME_CONFIG,
      };

      const [collaborativeResult, transactionalResult, auditResult] = await Promise.all([
        orchestrate(collaborativeMessage),
        orchestrate(transactionalMessage),
        runSecondOpinionAudit({
          userPrompt: fixture.input.userPrompt,
          baselineOutput: fixture.input.baselineOutput,
          baselineLabel: fixture.input.baselineLabel,
          runtimeConfig: MOCK_RUNTIME_CONFIG,
        }),
      ]);

      const collaborativeView = toAuditViewModel(auditResult, {
        engagementStance: collaborativeResult.trace?.engagementStance,
        outputMode: collaborativeResult.outputPolicy.mode,
        baselineCode: fixture.input.baselineOutput,
        auditCode: auditResult.comparison.secondOpinion.content,
        includeConsiderations: collaborativeResult.outputPolicy.includeConsiderations,
        traceExpandedByDefault: collaborativeResult.outputPolicy.traceExpandedByDefault,
      });

      const transactionalView = toAuditViewModel(auditResult, {
        engagementStance: transactionalResult.trace?.engagementStance,
        outputMode: transactionalResult.outputPolicy.mode,
        baselineCode: fixture.input.baselineOutput,
        auditCode: auditResult.comparison.secondOpinion.content,
        includeConsiderations: transactionalResult.outputPolicy.includeConsiderations,
        traceExpandedByDefault: transactionalResult.outputPolicy.traceExpandedByDefault,
      });

      if (
        fixture.expected.collaborativeConsiderationsNonEmpty &&
        !(collaborativeView.considerations.length > 0)
      ) {
        failures.push(
          `${fixture.name}: expected collaborative considerations.length > 0`,
        );
      }

      if (
        fixture.expected.transactionalConsiderationsEmpty &&
        !(transactionalView.considerations.length === 0)
      ) {
        failures.push(
          `${fixture.name}: expected transactional considerations.length === 0`,
        );
      }

      if (
        fixture.expected.transactionalConsiderationsSuppressed &&
        !(transactionalView.considerationsSuppressed === true)
      ) {
        failures.push(
          `${fixture.name}: expected transactional considerationsSuppressed === true`,
        );
      }

      if (
        fixture.expected.collaborativeConsiderationsSuppressed === false &&
        !(collaborativeView.considerationsSuppressed === false)
      ) {
        failures.push(
          `${fixture.name}: expected collaborative considerationsSuppressed === false`,
        );
      }

      if (
        fixture.expected.transactionalTraceCollapsed &&
        !(transactionalView.trace.traceCollapsed === true)
      ) {
        failures.push(`${fixture.name}: expected transactional traceCollapsed === true`);
      }

      if (
        fixture.expected.collaborativeModeLabel &&
        collaborativeView.mode.label !== fixture.expected.collaborativeModeLabel
      ) {
        failures.push(
          `${fixture.name}: expected collaborative mode label ${fixture.expected.collaborativeModeLabel}, got ${collaborativeView.mode.label}`,
        );
      }

      if (
        fixture.expected.transactionalModeLabel &&
        transactionalView.mode.label !== fixture.expected.transactionalModeLabel
      ) {
        failures.push(
          `${fixture.name}: expected transactional mode label ${fixture.expected.transactionalModeLabel}, got ${transactionalView.mode.label}`,
        );
      }

      if (
        fixture.expected.collaborativeModeHintAbsent &&
        typeof collaborativeView.mode.hint === "string" &&
        collaborativeView.mode.hint.trim().length > 0
      ) {
        failures.push(
          `${fixture.name}: expected collaborative mode.hint to be absent`,
        );
      }

      if (
        fixture.expected.transactionalModeHintNonEmpty &&
        !(
          typeof transactionalView.mode.hint === "string" &&
          transactionalView.mode.hint.trim().length > 0
        )
      ) {
        failures.push(
          `${fixture.name}: expected transactional mode.hint to be a non-empty string`,
        );
      }

      if (
        typeof fixture.expected.collaborativeDiffAvailable === "boolean" &&
        collaborativeView.diffAvailable !== fixture.expected.collaborativeDiffAvailable
      ) {
        failures.push(
          `${fixture.name}: expected collaborative diffAvailable ${fixture.expected.collaborativeDiffAvailable}, got ${collaborativeView.diffAvailable}`,
        );
      }

      if (
        typeof fixture.expected.transactionalDiffAvailable === "boolean" &&
        transactionalView.diffAvailable !== fixture.expected.transactionalDiffAvailable
      ) {
        failures.push(
          `${fixture.name}: expected transactional diffAvailable ${fixture.expected.transactionalDiffAvailable}, got ${transactionalView.diffAvailable}`,
        );
      }
    } else {
      const result = await runSecondOpinionAudit({
        ...fixture.input,
        runtimeConfig: MOCK_RUNTIME_CONFIG,
      });
      validateAuditFixture(fixture, failures, result.comparison);
    }

    if (failures.length === beforeCount) {
      passed += 1;
      console.log(`PASS ${fixture.name}`);
    } else {
      console.error(`FAIL ${fixture.name}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nAudit fixture validation failed:\n");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error(
      `\nSummary: ${passed} passed, ${failures.length} assertion failure(s), ${fixtures.length} fixture(s).`,
    );
    process.exit(1);
    return;
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `\nAudit fixture validation passed (${passed}/${fixtures.length}) in ${durationMs}ms.`,
  );
}

run().catch((error) => {
  console.error("Audit fixture runner failed:", error);
  process.exitCode = 1;
});
