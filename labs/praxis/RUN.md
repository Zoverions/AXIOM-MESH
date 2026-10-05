# Praxis `run` — synthetic run tooling (P0)

`node labs/praxis/cli.mjs run <file.prax> [more files...] [--arg k=v ...]`
executes Praxis programs against the **synthetic host** through the embedding
`run()` API (`labs/praxis/index.mjs`).

P0 bar is the **inert laboratory**: everything below is production-unreachable
by design. This command exists so language work can be exercised end to end
without touching a real host.

## What the synthetic run host provides

- **Authority tokens**, minted per `authorize` and bound to the exact
  operation digest of the plan they authorize. Permits, leases (1h TTL), and
  quorums (all members approve) are minted with `synthetic:<name>` ids. A
  permit name authorizing two different plans is refused at runtime
  (`PRAXIS_HOST_AUTHORITY_PLAN_MISMATCH`) — one token binds one exact plan.
- **Opaque secret references** for every `requires secret` binding
  (`synthetic:<name>`; values never cross into the program).
- **Synthetic effect handlers**: the preparer returns durable synthetic
  evidence, the executor completes synthetically (`executor:
  synthetic-praxis-cli-run`), and the completer/canceler record synthetic
  durable receipts. No network, disk, subprocess, or credential I/O happens
  at any point.

Programs that need anything else — prepared-effect imports, signed
observations, verifiers, assessors, or a charter — are refused by the runtime
(exit 3), because the synthetic host cannot supply them.

## Commands and I/O conventions

```
node labs/praxis/cli.mjs run <file.prax> [more files...] [--arg k=v ...]
```

- Multiple files run **in sequence**, one result line per file on **stdout**:
  `ok <file>: completed (N bindings: a, b, c)`.
- Program output goes to **stdout**; diagnostics go to **stderr** as JSON
  (`{ok:false, file, stage, code, message}`), matching the style of the other
  CLI commands.
- Use `-` as a file to read one program from stdin.
- `--arg k=v` binds a named host argument (string). Host args are delivered
  to the synthetic effect handlers and echoed into synthetic receipts/evidence
  as `host_args`; they are never visible to the program as bindings. Parsing
  is deliberately trivial: split on the first `=`, `--arg=k=v` also works,
  `--` ends flag parsing.

## Exit codes

| Code | Meaning |
| ---- | ------- |
| 0 | every file completed |
| 2 | check failure: syntax/type error, unreadable file, bad usage |
| 3 | runtime denial / effect refusal: the runtime (or the synthetic host's inability to bind something) refused the effect |

When files disagree, the worst code wins (a runtime denial dominates a check
failure).

## Implementation notes

- All implementation lives in `labs/praxis/run-command.mjs`
  (`runPraxisCli`, `runPraxisSources`, `parseRunArgs`). `cli.mjs` contains
  only a delimited dispatch block (`BEGIN/END praxis-run-commands`); file
  reading stays in `cli.mjs`, the designated file-reading entry point, so
  `run-command.mjs` keeps the interpreter's no-transport-surface invariant.
- Static digest pre-pass: to mint exact-plan-bound authority tokens, the
  runner statically resolves `PLAN` arguments (literals, plus references to
  already-resolved plain bindings such as observed strings) and computes the
  operation digest the runtime will compute. Programs whose plans depend on
  runtime-only values cannot be bound by the synthetic host and are refused
  (exit 3).
