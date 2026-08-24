# Grid Startup Remediation — S-01 and S-02

**Date:** 2026-08-24
**Kernel:** 0.12.0-dev.3
**Addresses:** [SCALABILITY-AUDIT-2026-07-30](SCALABILITY-AUDIT-2026-07-30.md) S-01, S-02
**Status:** implemented; measured on one host; not independently reproduced

This records what changed in Grid startup, what was measured, and — more
importantly — which of the audit's acceptance criteria are met and which are
deliberately not claimed.

## What startup did before

`GridStore` initialization performed three major passes. Signed chain verification
was already checkpoint-bounded; the protected-column inspection and materialized-state
reconstruction passes still grew with accumulated history:

1. `migrateProtectedColumns()` loaded every protected column of every mapped
   table with `.all()` and decrypted each already-protected value, on every
   startup, whether or not any migration was pending.
2. `verifyChain()` verified the signed chain. This pass was already bounded to
   the uncheckpointed suffix by the signed-checkpoint work and is unchanged.
3. `rebuildMaterializedState()` deleted every materialized table, loaded all
   events with `.all()`, and replayed the complete history inside one
   `BEGIN IMMEDIATE` transaction.

Passes 1 and 3 were the unbounded ones, and both held their whole working set in
memory at once.

## What changed

### Streaming replaces whole-table loads

Both passes now iterate with `.iterate()` instead of materializing every row
with `.all()`. This is a pure memory change with no semantic effect, and it is
the change responsible for most of the measured peak-RSS reduction.

### Protected-column migration is journalled (S-02)

The protected-storage format is recorded in `meta.protected_column_format_v1` as
`{schema, format_version, mapping_digest}`. When the stored record matches the
running build, startup opens a bounded sample of the most recent rows per mapped
table instead of decrypting every stored value. A wrong data key or corrupt
ciphertext still fails closed through the sample; a legacy unprotected value
found in the sample forces the full migration. Any change to the column mapping
or format version invalidates the record and re-runs the full pass once.

### Materialization anchor (S-01) — opt-in, off by default

`meta.materialization_anchor_v1` records `{schema, materialized_through_seq,
head_hash, materialized_digest, schema_version, build_digest}`. `build_digest`
is a digest of the materialization module's own bytes, so any edit to the fold
invalidates every stored anchor. The anchor is written on clean close, and
cleared by the first append of a session, so an interrupted session can never
leave behind a seal describing an earlier state.

When the anchor is enabled and valid, startup re-checks the recorded state
digest against what is actually stored and, only if it matches, skips
re-derivation. Anything else — no anchor, an interrupted session, a schema or
build change, an edited table, a sequence that is not the chain head — takes the
authoritative path and re-derives from genesis.

**This is off by default.** Set `materializationAnchor: 'sealed'` on the store,
or `AXIOM_GRID_MATERIALIZATION_ANCHOR=sealed`, to enable it. An unknown value
fails closed.

## What the anchor does not detect, and why it is not the default

Materialized tables are a cache of the signed event chain. They carry no
signature of their own, and no digest stored beside them can distinguish state
that was derived from state that was edited and then re-sealed by the same
process. Concretely: the anchor detects edits made while the Grid is closed, and
does not detect edits made by a process that then closes the store cleanly.

The default behaviour — re-derive on every startup — is the only setting under
which "materialized state is always a function of the signed chain" holds
without qualification. That guarantee is worth more than the restart time for
most deployments, so it stays the default and the faster path is something an
operator turns on knowingly. `mesh/test/kernel.test.mjs` continues to assert the
unqualified guarantee under the default.

## Measured

The timing figures below are the supplied **v1** benchmark run: a synthetic
fixture of 100,000 `intent.accepted` events, batch size 32, checkpoint interval
10,000, on one Node 24.18.0 linux/x64 host. The reviewed **v2** benchmark now
alternates `intent.accepted` and `intent.completed` so protected result
materialization is exercised when logical-state equivalence is checked. The v2
fixture has not yet been used to regenerate the wall-time/RSS table below, so
those numbers must not be attributed to v2. Wall time varies by host; replayed-
event counts remain the deterministic scaling evidence.

| Build | Startup wall time | Peak RSS | Materialization |
| --- | --- | --- | --- |
| Before | 17.8–21.8 s | 583–594 MiB | full replay, whole-table load |
| After, default (`off`) | 12.0 s | 85 MiB | full rebuild, streaming |
| After, `sealed` | 3.5–3.7 s | 86 MiB | anchored, 0 events replayed |

Startup phase profile at 40,000 events, before and after:

| Phase | Before | After (`sealed`) |
| --- | --- | --- |
| `migrateProtectedColumns` | 1,843 ms | 3 ms |
| `verifyChain` (checkpoint-bounded) | 2,383 ms | ~2,400 ms |
| `rebuildMaterializedState` | 4,424 ms | 0 ms |

Generate current v2 evidence with:

```
npm run startup:benchmark -- --events 100000 --checkpoint-interval 10000
```

The benchmark emits Ed25519-signed evidence and refuses to report `passed`
unless the clean anchored startup replayed zero events, the forced rebuild replayed
the full history, and both reproduce the same **logical** materialized state. The
anchor itself continues to use a physical storage digest for out-of-band tamper
detection; benchmark equivalence decrypts protected materializations before hashing.

## Acceptance criteria

Against S-01:

- **Met** — peak RSS no longer grows with history; it is flat at ~85 MiB across
  2k, 10k, 40k and 100k event fixtures, in both modes.
- **Met for the benchmark fixture** — forced full rebuild reproduces the same
  logical materialized-state digest as the anchored path. The benchmark includes
  protected intent results so this comparison is independent of randomized
  AES-GCM ciphertext. It is evidence for the exercised materialization surface,
  not a claim of byte-identical encrypted storage.
- **Met** — corrupt, missing, stale, schema-incompatible and foreign-build
  anchors all select the full rebuild rather than serving unverified state.
- **Met** — startup records phase outcomes: `store.materializationStartup` and
  `store.protectedColumnStartup` report the mode and the replayed/scanned counts.
- **Not yet met** — true suffix replay is not implemented. Current `sealed` mode
  is zero-or-full: a valid exact-head clean-close anchor replays 0 events; a
  missing, stale, interrupted, behind-head, or otherwise invalid anchor triggers
  full genesis re-derivation. Under the default, the full rebuild now streams,
  so memory is bounded while restart time still grows with history.
- **Not met** — the audit asks for shadow tables and an atomic swap rather than
  deleting the live materialization before replay. The rebuild still deletes and
  replays inside one transaction. A crash mid-rebuild rolls back, but a long
  rebuild still holds a long write transaction.
- **Not claimed** — no measurement at 1 million or 10 million events. The 100k
  fixture takes about 44 seconds to build; the larger fixtures were not run.

Against S-02:

- **Met** — a no-op restart performs no table-wide protected-column scan.
- **Met** — wrong-key and corrupt-ciphertext negative tests remain fail closed.
- **Partially met** — the format record is a journalled completion marker, but
  the migration itself is not resumable: an interruption rolls back and the next
  startup runs it again from the beginning.
- **Not met** — there is no separate offline deep protected-state verification
  command. Deleting `meta.protected_column_format_v1` forces the full pass.

## Still open from the same audit

S-03 (checkpoint history stored as a growing JSON array in one `meta` value) and
S-04 (a new TLS connection per internal hop) are unchanged by this work.
