# Audit Calibration Fixtures

These fixtures are golden examples for ranking behavior stability.

## Purpose
- Catch ranking drift as heuristics evolve.
- Keep winner reasoning and considerations explainable.
- Preserve style-fit caveats so users can trust overrides.

## Fixture Shape
- `kind`: optional. Defaults to `audit`; use `orchestration` for trace integrity checks.
- `input`: payload for `runSecondOpinionAudit`.
- `expected.method`: should remain `rubric-plus-narrative`.
- `expected.winnerLabel`: optional expected winner.
- `expected.mustMention`: optional phrases expected in winner reason.
- `expected.considerationsMustInclude`: optional phrases expected in considerations.

### Orchestration Fixture Shape
- `input`: payload for `orchestrate`.
- `expected.expectedTaskCount`: expected routed task count in trace.
- `expected.expectedStance`: expected engagement stance classification.
- `expected.requireDeterministicIds`: assert task IDs are stable and generated in order.
- `expected.requireTaskResultReferentialIntegrity`: assert every result ID maps to a task ID.
- `expected.requireEvaluationReferences`: assert evaluation winner/score IDs map to trace results.

## Next Step
Add a small script that replays fixtures and validates expected fields in CI.
