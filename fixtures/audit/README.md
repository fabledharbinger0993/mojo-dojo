# Audit Calibration Fixtures

These fixtures are golden examples for ranking behavior stability.

## Purpose
- Catch ranking drift as heuristics evolve.
- Keep winner reasoning and considerations explainable.
- Preserve style-fit caveats so users can trust overrides.

## Fixture Shape
- `input`: payload for `runSecondOpinionAudit`.
- `expected.method`: should remain `rubric-plus-narrative`.
- `expected.winnerLabel`: optional expected winner.
- `expected.mustMention`: optional phrases expected in winner reason.
- `expected.considerationsMustInclude`: optional phrases expected in considerations.

## Next Step
Add a small script that replays fixtures and validates expected fields in CI.
