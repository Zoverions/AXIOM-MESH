# Agent Trust Protocol — Promotion and Recovery Runbook

**Status:** laboratory promotion gate; not a production capability claim

**Applies to:** ATP v1 A1–A10 laboratories and any future Agent Commons feature that attempts entry into the authoritative `mesh/config/capabilities.json` registry.

## Governing rule

A green branch, signed artifact, draft PR, protocol label, local verification result, or passing synthetic fixture does **not** promote an ATP capability.

Promotion requires a synchronized candidate containing implementation, strict validation/canonicalization, positive and negative tests, threat model, recovery/revocation procedures, exact authoritative capability-registry binding where runnable, current-status documentation, protected CI on the exact candidate, and independent review appropriate to the authority/effect boundary.

Until those gates are simultaneously satisfied, public/product claims such as **universal agent trust**, **production Agent Passport**, **secure agent delegation**, **production portable work receipts**, **MCP/A2A trust parity**, or equivalent supported-runtime claims remain prohibited.

## 1. Promotion checklist

For each candidate capability:

1. freeze the exact candidate commit;
2. identify the canonical schema or strict executable validator;
3. identify at least one positive and one adversarial/negative executable test;
4. update or add the capability-specific threat model;
5. identify recovery, rotation, revocation, rollback and stale-state procedures relevant to the capability;
6. identify an independent verifier or conformance artifact where the capability produces portable claims;
7. run protected Clean Kernel and Windows workflows on the exact candidate/base/merge candidate;
8. obtain independent security review appropriate to the new authority/effect surface;
9. resolve every critical/high finding or record an explicitly approved, bounded and expiring exception under the repository's existing review policy;
10. only then add or change the authoritative `mesh/config/capabilities.json` entry and synchronized capability-evidence binding;
11. recompute all registry digests and update current-status/readiness documentation atomically;
12. rerun protected CI on the **post-registry** exact candidate;
13. verify public claims against the promoted registry state before release.

A capability is not promoted if any one of these steps is missing.

## 2. Registry transition rule

ATP laboratories intentionally live outside the authoritative registry until promotion review.

A proposed ATP capability ID must not be interpreted as supported merely because it appears in a laboratory promotion ledger. The authoritative registry remains `mesh/config/capabilities.json`.

When promotion is approved:

- use a stable capability ID;
- choose the narrowest truthful status;
- bind runnable evidence through `mesh/config/capability-evidence-bindings.json` when the capability is `implemented`;
- ensure the evidence test actually names/asserts the capability rather than merely sharing a file path;
- update the registry digest everywhere it is published;
- do not reuse an older protected-CI result after the registry changes.

## 3. Identity rotation and recovery

For A1-derived identities:

- never reuse an operational key across forbidden epochs;
- verify the complete supplied credential history before accepting rotation/recovery;
- preserve predecessor credential digests and dispositions;
- preserve historical receipts so old signatures remain independently checkable;
- issue revocation/compromise evidence before replacing a known-compromised key when possible;
- require A6-style retained latest-head currentness for new-effect admission once that path is integrated;
- after recovery, prove that an older retained head or retired credential cannot be used as the current credential.

A routine key retirement must not retroactively invalidate historical evidence that was valid under the protocol rules at the time.

## 4. Revocation and stale-state recovery

For any candidate that depends on currentness:

- retain the expected latest signed head outside the untrusted caller payload;
- on restart/recovery, restore and verify that retained head before admitting a new effect;
- reject credential-history truncation;
- reject revocation-set truncation;
- reject an older otherwise-valid checkpoint when a later retained head is expected;
- fail closed when required ancestor/currentness evidence is unknown;
- check revocation as late as safely possible before the first consequential effect;
- do not claim consume-before-effect unless the durable consume record is actually verified on the effect path.

A6a currently proves only a laboratory retained-head primitive; it is not yet the production recovery mechanism.

## 5. Delegation recovery

A3a is attenuation proof only. Current machine-principal v1 has delegation disabled.

Before any authority-bearing A3b promotion:

- specify the parent delegation authority source explicitly;
- bind every ancestor identity/currentness state;
- prove child authority is a subset in every dimension;
- define descendant invalidation after ancestor compromise/revocation;
- define crash/restart behavior between delegation issuance and effect admission;
- prove protocol/runtime/vendor changes cannot widen the chain;
- independently review the authority-bearing path.

Do not enable delegation by changing a presentation/passport field.

## 6. Handoff and replay recovery

A4a is a signed proposal, not authorization.

A production handoff path must additionally prove:

- recipient-side current authority reevaluation;
- nonce/replay/idempotency enforcement by durable state, not merely presence of fields;
- exact delegation-chain head where delegation exists;
- stale credential/handoff rejection after recovery;
- cancellation/uncertain-outcome behavior;
- no duplicate effect after crash/retry.

## 7. Work-receipt recovery

A5a binds Grid terminal lifecycle evidence, but it does not prove a concrete effect.

Before full A5 promotion:

- bind the exact authority/currentness evidence actually consulted;
- bind plan/approval/grant/consumption evidence where applicable;
- bind effect-specific executor receipts;
- verify ordered effect summaries against the actual execution path;
- retain uncertainty semantics for crash/timeout/remote ambiguity;
- never turn `completed` into task success without task-specific verification;
- preserve executor and independent witness signatures across key rotation.

## 8. Durable-memory recovery

A7 lives on a separate laboratory branch until composed.

Before promotion:

- reconstruct provenance from evidence rather than bulk-trusting legacy rows;
- leave ambiguous legacy records untrusted/unclassified;
- preserve review/provenance history append-only;
- rebind lifecycle state when provenance changes;
- suppress expired/quarantined/rejected records at the accepted retrieval path;
- prove derived content cannot inherit privileged instruction authority silently;
- test backup/restore without losing provenance, lifecycle or review-chain state.

## 9. Contribution-history recovery

A8a history is advisory only.

Before any deployed Commons history service:

- retain an independently witnessed latest head;
- preserve rejected, failed, superseded, invalidated and reverted entries;
- define reviewer credential rotation without rewriting prior receipts;
- document identity-reset/Sybil/collusion limitations;
- never convert history into automatic authority or approval exemptions.

## 10. Protocol-adapter recovery

A9a proves only canonical A2 requestability parity for protocol-labelled projections.

Before real MCP/A2A adapter promotion:

- pin the exact external protocol/specification version;
- test downgrade/version confusion;
- preserve native AXIOM identity/authority semantics;
- treat discovery and adapter metadata as untrusted/non-authorizing;
- preserve remote-result provenance and uncertainty;
- recover from remote endpoint/key/profile changes without silently trusting cached metadata;
- run the same live authority/currentness fixtures through every adapter.

## 11. Independent verifier recovery

A10b's detached report is not authenticated; only direct live reverification establishes its live-verification result.

Before broad independent-verifier claims:

- package the verifier so it accepts public inputs without privileged runtime state;
- separate verifier runtime/process from the producing runtime;
- add a second independently implemented verifier or conformance harness;
- bind A5b effect-specific evidence and A7 provenance once composed;
- test corrupted/missing trust roots, stale heads and unavailable artifacts;
- keep detached report integrity distinct from proof that live verification actually occurred.

## 12. Independent review evidence

Independent review must use the repository's existing signed security-review intake or an equivalently strict reviewed profile. A promotion ledger may record a review as complete only when the exact candidate/artifacts are bound to review evidence.

A review of an earlier head does not automatically cover a later authority/effect change.

## 13. Rollback after promotion

If a promoted ATP capability develops a critical/high security defect:

1. deny or disable the affected capability/effect path first;
2. preserve the evidence showing why it was disabled;
3. revoke/retire compromised credentials or trust roots where necessary;
4. prevent descendant/new effects where ancestor currentness is affected;
5. retain historical verification material;
6. update the authoritative registry/readiness status truthfully;
7. produce a corrective PR with adversarial regression evidence;
8. repeat the full promotion checklist before re-enabling.

Rollback must not rewrite history to imply the defect or earlier assurance never existed.

## 14. Current ATP laboratory boundary

The current stacked ATP work contains green laboratories for A1, A2, A3a, A4a, A5a, A6a, A8a, A9a and A10b. A7 is green on a separate branch. A3b authority-bearing delegation, A5b effect-specific portable evidence, full A6 consume-before-effect integration, real MCP/A2A adapters, runtime-separated/independent verification, and final cross-runtime demonstration remain open.

Therefore ATP v1 is **not production complete** and must not be marketed as such.
