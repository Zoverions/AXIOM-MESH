# Agent Documentation Update Policy

This policy removes ambiguity about documentation updates during delivery.

## Mandatory updates per implementation PR

For every non-trivial code change, agents must update:
1. Relevant technical/spec doc(s) under `docs/`.
2. Relevant HOWTO(s) under `docs/HOWTO/`.
3. Root `README.md` when user-facing behavior, setup, or workflow changes.
4. `docs/TASK-BOARD.md` task status/checklists if scope maps to an active task.

## Merge-blocking conditions

A PR should be considered incomplete if:
- code changes behavior but no HOWTO/update path is documented,
- task checklist status is stale,
- README remains inconsistent with current flow,
- release evidence expectations are not updated where applicable.

## Execution order for agents

1. Read `docs/TASK-BOARD.md`.
2. Implement scoped code change.
3. Update docs/HOWTO + README + task checkboxes.
4. Run tests/validation and capture evidence.
5. Commit all aligned changes together.
