# Attestation gate — honest scope

**Status: P0 synthetic-host-only design + implementation. Not production.
Not authority.**

## What this is

The first real Praxis program: a merge-gate whose evidence is
loop-emitted attestations (`mesh-attestation.v0`).

- Loops (build/verify/review/CI) stay operational — schedulers,
  coordinators, relay, human gates. They are protocols, not syntax.
- Each loop round emits a signed attestation: checkable claim payloads,
  explicit non-claims, a shared PR and pinned head merge target, a nullifier,
  a freshness window, pointers to raw evidence (which never enters the attestation).
- Praxis verifies the attestation chain:
  - `labs/praxis/attestation.mjs` — schema, Ed25519 signatures, freshness,
    non-claim enforcement, nullifier registry, host-injectable verifier for
    `verify ... with AttestationV0`, and the adapter that wraps provenance-sealed
    results as chartered host observations after a second signature/role check.
  - `labs/praxis/examples/21-attestation-gate.prax` — the gate program:
    observe → verify → authorize → prepare → finalize.
  - The chartered `MergeGate` policy (pinned in the synthetic charter)
    evaluates deterministic premises over the verified claim sets and checks
    each signed merge target against the OpenGate argument. Signer IDs are
    pinned to their own tests, review, or CI attestation kind.
    `decideCharteredAuthority` returns a signed allow/deny receipt;
    denials carry closed-vocabulary codes (deny **with reasons**).
- The gate opens only on verification: the permit is bound to the PR/head
  merge target and exact attestation-set digest (exact-plan binding). New
  evidence or a new head → new permit.
- The synthetic host checks the attestations verified during program execution
  against both permit arguments before it prepares an irreversible effect;
  replacing an input after permit issuance cannot finalize the gate.

## Layering decisions

- **Nullifier spend lives at the authority boundary.** The coordinator that
  converts verified attestations into chartered evidence spends nullifiers
  from its registry. P0's default registry is in-memory; callers may inject a
  durable store and are responsible for persisting spent digests. The
  in-language `verify` re-check is intentionally stateless: it re-verifies
  authenticity, freshness, and non-claims without spending, so the program
  expresses what was checked while replay state stays with the host that owns it.
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
- The synthetic host and its signing key remain trusted. A compromised or
  dishonest host could emit false observations; this implementation only
  prevents accidental laundering of an unverified result through the host
  adapter. The P0.5 signed decision ledger is already landed; real-emitter
  provenance, host-compromise handling, persistent replay state, and real-Grid
  integration remain separately gated follow-up work.

## Evidence

- `mesh/test/praxis-attestation-gate-v0.test.mjs` — 23/23 (unit,
  adversarial, end-to-end allow/deny/replay/exact-plan-binding).
- Full Praxis suite: 278/278 with signer/target, execution binding, and
  host-adapter corrections; the original two-patch draft passed 271/271.
- Transport-boundary conformance: `attestation.mjs` classified inert, no
  network/fs/subprocess surface.

## Next steps

1. Real loop emitters producing `mesh-attestation.v0` (test runner,
   reviewer, CI) — operational layer.
2. Persistent nullifier store owned by the coordinator.
3. Host-compromise and emitter-provenance threat handling before any real
   authority-bearing integration.
4. Any real-Grid, merge, deploy, or other consequential integration requires a
   separately reviewed authority/production gate and fresh exact-head protected
   verification.
