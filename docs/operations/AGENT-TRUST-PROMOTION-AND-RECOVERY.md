# Agent Trust — Promotion and Recovery Runbook

**Status:** laboratory promotion discipline; not a production capability claim  
**Authoritative capability state:** `mesh/config/capabilities.json`  
**Exact implemented-evidence binding:** `mesh/config/capability-evidence-bindings.json`

## Governing rule

A green branch, signed artifact, draft PR, protocol label, local verification result, contribution history, semantic-trust record, parity result, benchmark, or passing synthetic fixture does **not** promote an Agent Trust or Agent Commons capability.

The local A11 preflight is intentionally weaker than promotion. It verifies only structural repository prerequisites plus the health of the current authoritative registry/evidence-binding state. It cannot verify GitHub protected CI, independent review, an explicit promotion decision, a post-mutation registry state, or post-registry protected CI. It therefore always leaves promotion and production claims unauthorized.

## Promotion sequence

A proposed runnable capability must pass these gates in order:

1. freeze the exact candidate commit and scope;
2. identify the implementation and strict executable validator/schema;
3. identify positive and adversarial executable tests;
4. update the capability-specific threat model;
5. document recovery, rotation, revocation, rollback and stale-state behavior relevant to the capability;
6. identify an independent verifier or conformance path where portable claims are produced;
7. run protected Clean Kernel and Windows/macOS validation on the exact pre-registry candidate;
8. obtain independent security review appropriate to the authority/effect surface and bind that review to the exact reviewed artifacts;
9. resolve critical/high findings or record an explicitly approved bounded exception under existing review policy;
10. obtain an explicit promotion decision through the authorized human/governance process;
11. only then add or modify the authoritative capability-registry entry and exact executable evidence binding;
12. recompute synchronized registry/binding digests and current-status documentation;
13. run fresh protected CI on the exact **post-registry** candidate;
14. verify release/public claims against that final authoritative state.

Missing any one gate means the capability is not promoted.

## A11 local preflight

`axiom-agent-trust-promotion-preflight.v1` evaluates one candidate rather than maintaining a static A1–A10 readiness table.

The preflight requires repository-resident:

- implementation;
- strict validation/schema;
- positive tests;
- adversarial tests;
- threat model;
- recovery runbook;
- verifier or conformance path.

It also validates the **current** capability registry and capability-evidence-binding file using the repository's canonical validators and rejects a candidate capability that is already present in the registry. The preflight is therefore a pre-mutation structural gate only.

The preflight result fixes these facts false:

- exact candidate commit bound by the verifier;
- protected CI verified;
- independent review verified;
- explicit promotion decision verified;
- post-registry CI verified;
- exact final candidate/registry binding verified;
- promotion authorized;
- registry mutation authorized;
- production claims allowed.

Those facts require external evidence and/or a later authorized transition. Do not add caller-controlled booleans to make the local preflight self-certifying.

## Registry transition rule

Laboratory code remains outside the authoritative registry until promotion review.

When promotion is explicitly approved:

- use a stable, narrow capability ID;
- choose the narrowest truthful status from the registry vocabulary;
- if status is `implemented`, name runnable Node test evidence;
- add an exact entry to `mesh/config/capability-evidence-bindings.json` whose named test/assertions actually bind that capability;
- run the canonical registry and evidence-binding validators;
- update published registry digests/status documentation atomically;
- do not reuse pre-registry CI as post-registry evidence.

Documentation, a promotion-preflight record, or an old readiness ledger cannot substitute for these files.

## Identity rotation and recovery

For A1 machine identity:

- never reuse an operational key across forbidden epochs;
- verify complete supplied credential history before successor issuance;
- preserve predecessor digests and dispositions;
- retain historical receipts so valid historical signatures remain checkable;
- preserve issuer-signed compromise/revocation evidence;
- use retained-head currentness evidence for new-effect decisions where that path is actually integrated;
- after recovery, prove an older retained head or retired credential cannot be treated as current.

A routine key retirement must not retroactively invalidate historical evidence that was valid under the protocol rules at the time.

## Currentness and stale-state recovery

For any candidate that depends on A6-style currentness:

- retain the expected latest signed checkpoint head outside the untrusted caller payload;
- restore and verify that retained head after restart before any new effect that depends on it;
- reject credential-history truncation and revocation-set truncation;
- reject an older otherwise-valid checkpoint when a later retained head is expected;
- enforce bounded freshness at the actual decision boundary;
- fail closed when required currentness evidence is unknown;
- do not call a post-hoc currentness recheck proof that the original runtime consulted currentness.

The current A5/A6 composition can re-evaluate an executor at the Grid intent start boundary. It does not prove original effect-path consultation, consume-before-effect, or global currentness.

## Delegation recovery

A3a is attenuation proof only. It proves a proposed child ceiling is equal to or narrower than a parent ceiling; it does not prove the parent possessed delegation authority.

Before any authority-bearing delegation design:

- identify the parent authority source explicitly;
- bind every relevant ancestor identity/currentness state;
- prove child authority is a subset in every dimension;
- define descendant invalidation after ancestor compromise/revocation;
- define crash/restart behavior between delegation issuance and effect admission;
- prove protocol/runtime/vendor changes cannot widen the chain;
- independently review the authority-bearing path.

Do not enable delegation by reinterpreting a proof, passport field, handoff, or protocol mapping as a grant.

## Handoff and replay recovery

A4 is a signed task proposal, not authorization.

A production recipient path would additionally need:

- live recipient-side authority reevaluation;
- durable nonce/replay/idempotency enforcement;
- exact delegation-chain evidence if delegation ever exists;
- stale credential/handoff rejection after recovery;
- cancellation/uncertain-outcome semantics;
- crash/retry protection against duplicate effect.

## Work-receipt and effect recovery

A5 binds portable Grid terminal lifecycle evidence. It does not prove a concrete filesystem/process/network/hardware/payment/communication effect or application task success.

Before any effect-specific A5 promotion:

- bind the authority/currentness evidence actually consulted on the effect path;
- bind plan/approval/grant/consumption evidence where applicable;
- bind and independently verify the exact effect-specific executor receipt;
- preserve ordered effect summaries and uncertainty semantics;
- check currentness as late as safely possible before the first consequential effect;
- never convert Grid `completed` into application success without task-specific verification.

The historical `read-system-facts` effect laboratory remains design/evidence provenance but predates the current A6 retained-currentness model and must not be treated as a current effect proof without reconstruction.

## Sovereign context / semantic-trust recovery

Current A7 reconciliation lives in the Sovereign Vault / Personal Context Broker architecture rather than the old independent semantic-memory store.

Before semantic-trust promotion:

- preserve the distinction between data and instruction semantics;
- keep model/remote/tool/imported/derived content non-authorizing by default;
- bind exact derivation ancestry and make stale/quarantined/expired ancestry deny-dominant;
- prevent derivations from inheriting instruction or authority semantics;
- integrate persisted provenance/lifecycle with the accepted Vault/Context path rather than creating a second write authority;
- reconstruct ambiguous legacy provenance from evidence instead of bulk-trusting it;
- add a cryptographically grounded owner-review evidence contract before any owner-approved instruction path is enabled;
- test backup/restore without losing provenance, lifecycle, correction, supersession or review history.

Historical A7 storage/review work remains useful design provenance where those persistence gates are not yet represented by the current semantic-trust slice.

## Contribution-history recovery

A8 contribution history is review-prioritization evidence only.

Before any deployed history service:

- retain an independently witnessed latest head;
- preserve rejected, failed, superseded, invalidated and reverted entries;
- define reviewer credential rotation without rewriting earlier receipts;
- document identity-reset, Sybil and collusion limitations;
- resolve cited work/evidence objects where stronger claims require them;
- never convert history or a scalar score into automatic authority, merge priority, or approval exemption.

## Protocol projection recovery

Current Stage C parity proves only that the offline MCP tool and offline A2A skill mappings cover the same canonical C0 public read-only methods.

It does **not** prove MCP/A2A wire conformance, a network/stdio transport, live authorization, runtime authority parity, or a servable A2A Agent Card.

Before a real edge adapter is promoted:

- pin the exact external specification/profile version;
- separately review transport and hostile-input handling;
- preserve native AXIOM identity/authority semantics;
- treat discovery and protocol metadata as non-authorizing;
- test downgrade/version confusion;
- preserve remote-result provenance and uncertainty;
- recover safely from endpoint/key/profile changes;
- feed the same live policy/currentness constraints through every real execution-capable adapter.

## Independent verifier recovery

A10 direct live reverification is stronger than checking its detached report. The detached report remains unauthenticated and non-portable assurance.

Before broad independent-verifier claims:

- package public inputs without privileged producer-runtime state;
- separate verifier runtime/process from producer runtime;
- add a second independently implemented verifier or conformance harness;
- bind effect-specific evidence only after an A5b path exists;
- bind semantic provenance only after the accepted A7 persistence/retrieval path exists;
- test missing/corrupt trust roots, stale heads and unavailable artifacts;
- keep report integrity distinct from evidence that live verification actually occurred.

## Independent review evidence

Independent review must be bound to the exact authority/effect surface being promoted. Review of an older head does not automatically cover a later authority/effect change.

A local preflight must never accept `independent_review_complete:true` from its own candidate payload. Review verification belongs to a separate trusted evidence path.

## Rollback after promotion

If a promoted capability later develops a critical/high defect:

1. deny or disable the affected capability/effect path first;
2. preserve the evidence explaining the disablement;
3. revoke/retire compromised credentials or trust roots where necessary;
4. prevent descendant/new effects when ancestor currentness is affected;
5. retain historical verification material;
6. update authoritative registry/readiness state truthfully;
7. produce a corrective candidate with adversarial regression evidence;
8. repeat the full promotion sequence before re-enabling.

Rollback must not rewrite history to imply the defect or prior assurance never existed.

## Current laboratory boundary

Current Agent Trust/Agent Commons work includes mature laboratory primitives for machine identity/currentness, authority snapshots, attenuation proof, signed proposals, portable terminal evidence, post-hoc currentness composition, live reverification, contribution history, Sovereign Context semantic trust, and offline Stage C protocol-projection parity.

These pieces do not collectively imply a production Agent Trust Protocol. Open gates include authority-bearing delegation, accepted effect-specific consume-before-effect integration, retained-head recovery across independent restarts, full accepted-context persistence/review integration, real protocol transports, runtime-separated/independent verification, independent security review of the final composed authority surface, explicit promotion decisions, authoritative capability-registry/evidence binding, and post-registry protected CI.

Therefore no laboratory preflight, draft stack, or documentation status may be marketed as production-complete Agent Trust.
