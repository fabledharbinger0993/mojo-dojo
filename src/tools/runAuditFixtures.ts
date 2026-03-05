import { promises as fs } from "node:fs";
import path from "node:path";
import { runSecondOpinionAudit } from "../orchestrate";
import { SecondOpinionAuditInput } from "../types";

interface FixtureExpected {
  method?: string;
  winnerLabel?: string;
  mustMention?: string[];
  considerationsMustInclude?: string[];
}

interface AuditFixture {
  name: string;
  description?: string;
  input: SecondOpinionAuditInput;
  expected: FixtureExpected;
}

function assertIncludesAll(
  source: string,
  required: string[] | undefined,
  label: string,
  fixtureName: string,
): string[] {
  const failures: string[] = [];
  for (const phrase of required ?? []) {
    if (!source.includes(phrase.toLowerCase())) {
      failures.push(`${fixtureName}: missing ${label} phrase \"${phrase}\"`);
    }
  }
  return failures;
}

async function loadFixtures(fixturesDir: string): Promise<AuditFixture[]> {
  const entries = await fs.readdir(fixturesDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(fixturesDir, entry.name));

  const fixtures: AuditFixture[] = [];
  for (const filePath of jsonFiles) {
    const raw = await fs.readFile(filePath, "utf8");
    fixtures.push(JSON.parse(raw) as AuditFixture);
  }
  return fixtures;
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
    const result = await runSecondOpinionAudit(fixture.input);
    const beforeCount = failures.length;

    if (
      fixture.expected.method &&
      result.comparison.method !== fixture.expected.method
    ) {
      failures.push(
        `${fixture.name}: expected method ${fixture.expected.method}, got ${result.comparison.method}`,
      );
    }

    if (
      fixture.expected.winnerLabel &&
      result.comparison.winnerLabel !== fixture.expected.winnerLabel
    ) {
      failures.push(
        `${fixture.name}: expected winner ${fixture.expected.winnerLabel}, got ${result.comparison.winnerLabel}`,
      );
    }

    failures.push(
      ...assertIncludesAll(
        result.comparison.winnerReason.toLowerCase(),
        fixture.expected.mustMention,
        "winnerReason",
        fixture.name,
      ),
    );

    failures.push(
      ...assertIncludesAll(
        result.comparison.considerations.join("\n").toLowerCase(),
        fixture.expected.considerationsMustInclude,
        "considerations",
        fixture.name,
      ),
    );

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
