# Attestation gate — honest scope

**Status: P0 synthetic-host-only design + implementation. Not production.
Not authority.**

## What this is

The first real Praxis program: a merge-gate whose evidence is
loop-emitted attestations (`mesh-attestation.v0`).

- Loops (build/verify/review/CI) stay operational — schedulers,
  coordinators, relay, human gates. They are protocols, not syntax.
- Each loop round emits a signed attestation: checkable claim payloads,
  explicit non-claims, a nullifier, a freshness window, pointers to raw
  evidence (which never enters the attestation).
- Praxis verifies the attestation chain:
  - `labs/praxis/attestation.mjs` — schema, Ed25519 signatures, freshness,
    non-claim enforcement, nullifier registry, host-injectable verifier for
    `verify ... with AttestationV0`, and the adapter that wraps verified
    attestations as chartered host observations.
  - `labs/praxis/examples/21-attestation-gate.prax` — the gate program:
    observe → verify → authorize → prepare → finalize.
  - The chartered `MergeGate` policy (pinned in the synthetic charter)
    evaluates deterministic premises over the verified claim sets.
    `decideCharteredAuthority` returns a signed allow/deny receipt;
    denials carry closed-vocabulary codes (deny **with reasons**).
- The gate opens only on verification: the permit is bound to the exact
  attestation-set digest (exact-plan binding). New evidence → new digest →
  new permit.

## Layering decisions

- **Nullifier spend lives at the authority boundary.** The coordinator that
  converts verified attestations into chartered evidence spends nullifiers
  from its (persisted) registry. The in-language `verify` re-check is
  intentionally stateless: it re-verifies authenticity, freshness, and
  non-claims without spending, so the program expresses what was checked
  while replay state stays with the host that owns it.
- **No language syntax was added.** Everything the gate needs existed in
  P0: host-injected verifiers, deterministic policy premises, chartered
  issuance, measured effects with irreversible finalize, the signed
  decision ledger.
- **`assess` was not stretched.** Multi-evidence gate judgment lives in the
  chartered policy premises (designed for exactly this), not in the
  single-input `assess`.

## What this is not (non-claims)

- Not a production gate. The charter, keys, ledger, nullifier store, and
  host are all synthetic and injected by the test. Nothing here can open a
  real merge, deploy, or spend.
- Not unforgeable capabilities. The P0 capability gap stands: the kernel
  remains the only enforcement. This program uses permits and policies,
  not new capability syntax.
- Not a claim about loop correctness. The attestations in the test are
  synthetic. Real loop emitters (test runner, reviewer, CI) do not exist
  yet; the `mesh-attestation.v0` schema is the contract they will implement.
- Not Grid-integrated. P0 remains synthetic-host-only and
  production-unreachable by design.

## Evidence

- `mesh/test/praxis-attestation-gate-v0.test.mjs` — 16/16 (unit,
  adversarial, end-to-end allow/deny/replay/exact-plan-binding).
- Full Praxis suite: 270/270 with this branch.
- Transport-boundary conformance: `attestation.mjs` classified inert, no
  network/fs/subprocess surface.

## Next steps (not in this branch)

1. Real loop emitters producing `mesh-attestation.v0` (test runner,
   reviewer, CI) — operational layer.
2. Persistent nullifier store owned by the coordinator.
3. Adversarial review of this branch by a fresh context before any PR.
4. Draft PR → protected CI → authorized review → separate merge decision
   (Zov).
