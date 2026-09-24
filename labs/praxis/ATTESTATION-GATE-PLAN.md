# Attestation-gate build plan (first real Praxis program)

**Intent checksum (Zov, 2026-09-24 ~02:31 EDT):** "Make it happen" —
attestation-verification core as first Praxis program; loops emit,
Praxis verifies, gates open on verification.

**Status: plan + P0 implementation. Synthetic-host-only. No authority.**

## 1. What the P0 stack already gives us (surveyed 2026-09-24)

The draft-PR stack from memory (#1708/#1711/#1715/#1718, issue #1720) has
**already landed on main** — the memory record of 2026-09-18 is stale:

| Piece | State on main |
|---|---|
| Language core (observe/verify/assess/op/authorize/prepare/cancel/commit/finalize) | landed, SPEC.md normative, code wins |
| Measured effects + irreversible finalize (P0.4) | landed (`effects.mjs`, `02be0084`) |
| Signed decision ledger + denial/effect provenance (P0.5) | landed (`ledger.mjs`, `3f511eb3`/`#1729`; closes #1720) |
| Deterministic policy premises over verified evidence (`policy.mjs`) | landed |
| Chartered authority issuance (`charter.mjs`) | landed |
| Host-injected verifiers/assessors, synthetic host only | landed |
| Capability model | **NOT present** — unforgeable capabilities unproven; kernel remains the only enforcement. No new capability syntax in v0. |

So: no P0 language change is needed for the attestation gate. Everything
required exists as host-injectable machinery. The honest gap is not syntax —
it is that capabilities are still conventional, not language-enforced.

## 2a. Attestation schema for loop evidence — `mesh-attestation.v0`

```json
{
  "schema": "mesh-attestation.v0",
  "attestor": "<key id, e.g. attest:review-coordinator>",
  "subject": "<what is attested, e.g. merge-review:PR-1813:round-1>",
  "kind": "<tests-reproduced | adversarial-review | protected-ci | scope-honesty>",
  "claims": { "<claim>": "<value>" },
  "non_claims": ["<explicit non-claim>", "..."],
  "nullifier": "sha256:<hex>",
  "issued_at_ms": 0, "expires_at_ms": 0,
  "evidence_refs": ["<pointer to evidence>"],
  "signature": "<base64 ed25519 over canonical body digest>"
}
```

Design rules (borrowed from tonight's session):

- **Event attestations with claim payloads** — `claims` carries the checkable
  facts (tests_passed, verdict, workflows green). Raw evidence stays out;
  `evidence_refs` points at it.
- **Nullifiers against replay** — one `nullifier` per attestation, spent on
  first verification; reuse fails closed (`PRAXIS_ATTESTATION_REPLAY`).
- **Explicit non-claims (B5 zero-claim pattern)** — `non_claims` is REQUIRED
  and non-empty. An attestation that does not say what it does *not* claim is
  malformed. The verifier additionally enforces caller-required non-claims
  (e.g. a review attestation must carry `provider_identity`,
  `live_output_truth`, `budget_enforcement`, `signer_custody` in non_claims —
  widening fails closed before signature verification, mirroring B5).
- **Fulfillment-gated actions** — the gate opens only when the policy's
  premises over the verified claim sets all hold; there is no partial credit.

## 2b. Gate-verifier program shape (current Praxis, no language change)

`labs/praxis/examples/21-attestation-gate.prax`:

```prax
requires permit open_merge_gate: OpenGate @ MergeQueue;
observe tests_att = "<attestation json>" from "loop:tests";
observe review_att = "<attestation json>" from "loop:review";
observe ci_att = "<attestation json>" from "loop:ci";
verify v_tests = tests_att with AttestationV0;
verify v_review = review_att with AttestationV0;
verify v_ci = ci_att with AttestationV0;
op open_gate = OpenGate("sha256:<attestation-set-digest>") @ MergeQueue effect gate_open irreversible;
authorize open_gate using open_merge_gate as armed_gate;
prepare armed_gate as prepared_gate;
finalize prepared_gate as gate_receipt;
```

Host wiring (synthetic host, `labs/praxis/attestation.mjs`):

1. `createAttestationVerifier({trustedKeys, nullifiers, now, ...})` injected
   as `verifiers.AttestationV0` — checks schema, attestor, Ed25519 signature,
   freshness window, non-claims, spends nullifier. Denies with specific
   `PRAXIS_ATTESTATION_*` codes (deny **with reasons**).
2. Each verified attestation becomes a chartered host observation
   (`createHostObservation`/`verifyHostObservation`) under a distinct pinned
   verifier name (`attestation:tests`, `attestation:review`,
   `attestation:ci`) — one evidence item per verifier, satisfying the
   `PRAXIS_EVIDENCE_AMBIGUOUS` rule.
3. `decideCharteredAuthority` with pinned `MergeGate` policy evaluates the
   deterministic premises (e.g. `claims.tests_failed == 0`,
   `claims.verdict == "APPROVE"`, `claims.protected_workflows_green == true`).
   Allow → signed permit bound to the exact operation digest; deny → signed
   decision receipt with a `DECISION_DENIAL_CODES` code, no permit, and the
   program's `authorize` fails closed.
4. `finalize` + ledger `recordTerminalEffect` close the loop with an
   append-only, hash-linked record.

The op arg is the attestation-set digest: exact-plan binding means the permit
is valid for exactly one evidence set. New evidence → new digest → new permit.

## 2c. P0 gaps: stub or wait

| Gap | Decision |
|---|---|
| Unforgeable capabilities | **Wait** — not needed for the gate; v0 honest label stands. The gate uses permits/policies, not new capability syntax. |
| `assess` takes one input | **Stub around** — the gate judgment lives in the chartered `MergeGate` policy premises (multi-evidence by design), not in `assess`. No language change. |
| Loop → attestation emitters (test runner, reviewer) | **Stub** — the operational layer emits real attestations later; v0 uses synthetic attestations from the test. The schema is the contract. |
| Nullifier persistence | **Stub** — in-memory registry with an injectable store interface; callers persist spent digests (same discipline as B5's caller-persisted nonces). |
| Grid/production authority | **Wait** — P0 remains synthetic-host-only, production-unreachable, by design. |

## 3. Scope of this branch (narrow)

- `labs/praxis/attestation.mjs` (new): schema, sign/verify, nullifier
  registry, verifier factory, attestation→host-observation adapter.
- `labs/praxis/examples/21-attestation-gate.prax` (new) + MANIFEST.md row +
  `praxis-examples-v0.test.mjs` gallery entry (compile + format only; the
  example carries placeholder attestation JSON — execution is covered by the
  dedicated test with generated attestations).
- `mesh/test/praxis-attestation-gate-v0.test.mjs` (new): unit + adversarial +
  end-to-end gate allow/deny.
- `labs/praxis/ATTESTATION-GATE.md` (new): honest-scope note.

No merges. No language syntax changes. No registry/capability changes.
