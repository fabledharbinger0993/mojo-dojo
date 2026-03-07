import { orchestrate } from "../orchestrate";
import { UserMessage } from "../types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function run(): Promise<void> {
  const message: UserMessage = {
    sessionId: "determinism-session-001",
    userId: "determinism-user",
    text: "Please explain trade-offs and implement unit tests for this API handler.",
    timestamp: "2026-01-01T00:00:00.000Z",
    runtimeConfig: {
      useMockAgents: true,
    },
    context: {
      languageId: "typescript",
      filePath: "src/example.ts",
    },
  };

  const first = await orchestrate(message);
  const second = await orchestrate(message);

  assert(Boolean(first.trace), "first run missing trace");
  assert(Boolean(second.trace), "second run missing trace");

  const firstTaskIds = first.trace?.tasks.map((task) => task.id) ?? [];
  const secondTaskIds = second.trace?.tasks.map((task) => task.id) ?? [];
  const firstResultIds = first.trace?.results.map((result) => result.id) ?? [];
  const secondResultIds = second.trace?.results.map((result) => result.id) ?? [];

  assert(
    JSON.stringify(firstTaskIds) === JSON.stringify(secondTaskIds),
    "task ID sequence is not deterministic across identical runs",
  );

  assert(
    JSON.stringify(firstResultIds) === JSON.stringify(secondResultIds),
    "result ID sequence is not deterministic across identical runs",
  );

  assert(
    (first.evaluation?.winnerTaskId ?? "") === (second.evaluation?.winnerTaskId ?? ""),
    "evaluation winnerTaskId is not deterministic across identical runs",
  );

  console.log("Orchestration determinism check passed.");
  console.log(`Task IDs: ${firstTaskIds.join(", ")}`);
  if (first.evaluation?.winnerTaskId) {
    console.log(`Winner task ID: ${first.evaluation.winnerTaskId}`);
  }
}

run().catch((error) => {
  console.error("Orchestration determinism check failed:", error);
  process.exitCode = 1;
});
