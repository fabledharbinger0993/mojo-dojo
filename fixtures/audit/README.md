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
- `expected.expectedStatus`: expected orchestration status (`ok`, `partial_failure`, `failure`).
- `expected.expectedTaskCount`: expected routed task count in trace.
- `expected.expectedStance`: expected engagement stance classification.
- `expected.requireDeterministicIds`: assert task IDs are stable and generated in order.
- `expected.requireTaskResultReferentialIntegrity`: assert every result ID maps to a task ID.
- `expected.requireEvaluationReferences`: assert evaluation winner/score IDs map to trace results.
- `expected.expectedErroredCodingResults`: expected count of failed coding results in trace.
- `expected.requireEvaluationExcludesErroredResults`: assert winner and scored task IDs never reference errored results.

### Stance Policy Fixture Shape
- `kind`: `stance-policy`.
- `input.userPrompt`: shared prompt run in both transactional and collaborative modes.
- `expected.collaborativeConsiderationsNonEmpty`: assert `considerations.length > 0` in collaborative mode.
- `expected.transactionalConsiderationsEmpty`: assert `considerations.length === 0` in transactional mode.
- `expected.transactionalConsiderationsSuppressed`: assert `considerationsSuppressed === true` in transactional mode.
- `expected.collaborativeConsiderationsSuppressed`: assert `considerationsSuppressed === false` in collaborative mode.
- `expected.transactionalTraceCollapsed`: assert `traceCollapsed === true` in transactional mode.
- `expected.collaborativeModeLabel`: expected UI mode label in collaborative output (`Collaborative`).
- `expected.transactionalModeLabel`: expected UI mode label in transactional output (`Transactional`).
- `expected.collaborativeModeHintAbsent`: assert `mode.hint` is absent in collaborative mode.
- `expected.transactionalModeHintNonEmpty`: assert `mode.hint` is a non-empty string in transactional mode.
- `expected.collaborativeDiffAvailable`: assert `diffAvailable` for collaborative mode view payload.
- `expected.transactionalDiffAvailable`: assert `diffAvailable` for transactional mode view payload.

Suggested coverage: include both a positive diff fixture (baseline present) and a negative fixture where baseline is missing so `diffAvailable` is explicitly false.

## Next Step
Add a small script that replays fixtures and validates expected fields in CI.
