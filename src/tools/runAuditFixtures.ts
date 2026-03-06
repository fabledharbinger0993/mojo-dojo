import { promises as fs } from "node:fs";
import path from "node:path";
import { generateTaskId } from "../ids";
import { orchestrate, runSecondOpinionAudit } from "../orchestrate";
import { EngagementStance, SecondOpinionAuditInput, UserMessage } from "../types";

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
  expectedTaskCount?: number;
  expectedStance?: EngagementStance;
  requireDeterministicIds?: boolean;
  requireTaskResultReferentialIntegrity?: boolean;
  requireEvaluationReferences?: boolean;
}

interface OrchestrationFixture {
  kind: "orchestration";
  name: string;
  description?: string;
  input: UserMessage;
  expected: OrchestrationFixtureExpected;
}

type Fixture = AuditFixture | OrchestrationFixture;

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
  trace: NonNullable<Awaited<ReturnType<typeof orchestrate>>["trace"]>,
  evaluation: Awaited<ReturnType<typeof orchestrate>>["evaluation"],
): void {
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
      const result = await orchestrate(fixture.input);
      if (!result.trace) {
        failures.push(`${fixture.name}: expected trace to be present`);
      } else {
        validateOrchestrationFixture(fixture, failures, result.trace, result.evaluation);
      }
    } else {
      const result = await runSecondOpinionAudit(fixture.input);
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
