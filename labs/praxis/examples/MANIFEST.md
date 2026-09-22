# Praxis example gallery manifest

Every `.prax` file in this directory is kept in **canonical form** (what
`node cli.mjs format` prints): one statement per line, single spaces, no
comments. Comments are stripped by the formatter, so per-file header
comments cannot coexist with the `format --check` gate — the documentation
for each example lives here and in `mesh/test/praxis-examples-v0.test.mjs`.

`release.prax` is the original lab example (retained as-is).

| File | Demonstrates | Expected outcome |
|---|---|---|
| `01-requires-permit.prax` | `requires permit` + full commit flow (Deploy @ Staging) | checks clean, receipt with finality `commit` |
| `02-requires-lease.prax` | `requires lease` + full commit flow (Snapshot @ Backups) | checks clean, receipt with finality `commit` |
| `03-requires-quorum.prax` | `requires quorum` (threshold 2 of alice, bob, carol) + knowledge + commit flow | checks clean |
| `04-requires-secret.prax` | `requires secret` + `op ... using secrets` (secrets as declared channels, never args) | checks clean |
| `05-requires-prepared.prax` | `requires prepared` (imported prepared op) committed directly | checks clean |
| `06-observe.prax` | `observe` with string, number, boolean literals and a knowledge-copy reference | checks clean |
| `07-verify.prax` | `verify` chains: Observed → Verified → Verified | checks clean |
| `08-assess.prax` | `assess`: the full knowledge ladder Observed → Verified → Assessment | checks clean |
| `09-op-effects.prax` | `op` with all declared metadata: `effect`, `irreversible`, `egress`, `using secrets`, terminated by `finalize` | checks clean, receipt with finality `finalize` |
| `10-authorize.prax` | `authorize`: binding an op to its permit (minimal, no prepare/commit) | checks clean |
| `11-prepare.prax` | `prepare`: moving an authorized op into the prepared state | checks clean |
| `12-commit.prax` | `commit`: terminal transition for a reversible operation | checks clean |
| `13-finalize.prax` | `finalize`: terminal transition for an irreversible operation | checks clean |
| `14-cancel.prax` | `cancel`: terminal transition that abandons a prepared operation | checks clean, CancellationReceipt |
| `15-policy-premise-flow.prax` | Composed: observe premise → verify with evidence policy → assess with granting policy → op → authorize → prepare → commit | checks clean |
| `16-decision-ledger-flow.prax` | Composed: quorum-authorized decision-ledger append, irreversible, finalized | checks clean |
| `17-denied-linear-permit-reuse.prax` | DENIAL: the same permit authorized twice | `PRAXIS_LINEAR_AUTHORITY_REUSE` |
| `18-denied-irreversible-commit.prax` | DENIAL: `commit` on a statically irreversible prepared op | `PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE` |
| `19-denied-authority-mismatch.prax` | DENIAL: permit scope does not match the operation scope | `PRAXIS_AUTHORITY_MISMATCH` |
| `20-denied-secret-arg.prax` | DENIAL: a secret reference embedded as an ordinary op argument | `PRAXIS_SECRET_EXFILTRATION` |

## Conventions

- A denial file still parses and still formats (denials are type errors, not
  syntax errors): `format --check` passes for every file in this directory.
- Error codes come from the analyzer (`analyzer.mjs`); they are the machine
  reading of the semantic rules, not prose.
- All names, actions, scopes, and policies in these files are synthetic
  lab fixtures. No Mesh, Grid, or production scope appears anywhere.
