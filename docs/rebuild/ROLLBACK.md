# AXIOM-MESH Kernel Rollback

**Updated:** 2026-08-24

**Applies to:** AXIOM-MESH `0.12.0-dev.3` supported development build

This runbook applies only to the supported `mesh/` kernel. Archived runtimes,
contracts, installers, and superseded deployment evidence are not rollback
targets.

## Rollback procedure

1. Stop Gateway first so no new intents enter the system.
2. Stop Hypervisor and Sandbox, then stop Grid after its active transaction
   finishes.
3. Preserve the current data directory and encryption key as a read-only
   incident artifact. Never copy the key into source control or release output.
4. Select the previous signed release whose migration ceiling is greater than
   or equal to the database's recorded schema version.
5. Verify that release's registry digest, SBOM, provenance, migration checksums,
   and source commit before starting it.
6. Start Grid alone. It must verify the signed evidence chain and rebuild all
   materialized state successfully.
7. Verify `/internal/v1/status` and the evidence head, then start Sandbox,
   Hypervisor, and Gateway in that order.
8. Run the audit verifier and a read-only status check before reopening traffic.

If the previous runtime cannot read the current migration version, do not force
it to start and do not edit `schema_migrations`. Restore into an isolated copy
using the deterministic procedure below.

## Migration compatibility

Migrations are forward-only, contiguous, and checksum verified. A runtime
refuses a database with a newer schema or a changed migration checksum.

Schema version 9 adds causal-sync bundles, signed updates, and multi-head
materialization. A `0.9.x` runtime cannot interpret those tables and MUST NOT be
started against a `0.10.x` database. Preserve the complete newer database,
encryption key, evidence log, and exported `sync_update` records before any
downgrade. Older runtimes may stage those records only as foreign provenance;
they cannot recreate native causal heads.

For an incompatible rollback:

1. Create an isolated data directory with the older runtime.
2. Export from the newer runtime or use its signed evidence log as the source.
3. Stage the bundle in the isolated runtime and inspect the deterministic diff.
4. Apply only after explicit independent approval.
5. Compare record counts and evidence heads; retain foreign provenance.
6. Switch traffic only after functional and audit verification.

This process intentionally avoids reverse SQL migrations that could discard
newer evidence or silently reinterpret state.

## Agent Trust and Agent Commons promotion discipline

A green branch, signed artifact, draft pull request, protocol label, local
verification result, contribution history, semantic-trust record, parity result,
benchmark, or passing synthetic fixture does **not** promote an Agent Trust or
Agent Commons capability.

The A11 local preflight is intentionally weaker than promotion. It may verify
repository-resident structural prerequisites and the health of the current
capability registry/evidence-binding state, but it cannot verify protected CI,
independent review, an explicit promotion decision, a post-mutation registry
state, or post-registry protected CI. It therefore leaves promotion and
production claims unauthorized.

### Promotion sequence

For a proposed runnable capability:

1. freeze the exact candidate commit and scope;
2. identify implementation plus strict executable validation/schema;
3. identify positive and adversarial executable tests;
4. update the capability-specific threat model;
5. document recovery, rotation, revocation, rollback, replay, and stale-state
   behavior relevant to the capability;
6. identify an independent verifier or conformance path when portable claims are
   produced;
7. run protected Clean Kernel and Windows/macOS validation on the exact
   pre-registry candidate;
8. obtain independent security review bound to the exact authority/effect
   surface;
9. resolve critical/high findings or record an explicitly approved bounded
   exception under existing review policy;
10. obtain an explicit promotion decision through the authorized
    human/governance process;
11. only then add or modify `mesh/config/capabilities.json` and the exact
    executable binding in `mesh/config/capability-evidence-bindings.json`;
12. recompute synchronized registry/binding digests and current-status claims;
13. run fresh protected CI on the exact **post-registry** candidate;
14. verify release/public claims against that final authoritative state.

Missing any gate means the capability is not promoted.

### A11 local preflight boundary

`axiom-agent-trust-promotion-preflight.v1` evaluates one candidate rather than
maintaining a static A1-A10 readiness table. It requires repository-resident
implementation, strict validation/schema, positive tests, adversarial tests,
threat model, recovery runbook, and verifier/conformance artifacts.

It validates the actual current capability registry and exact capability
assertion bindings using the repository's canonical validators. The candidate
capability must still be absent from the authoritative registry; post-registry
validation belongs to a separate authorized transition.

The local preflight must keep these facts false:

- exact candidate commit bound by the local verifier;
- protected CI verified;
- independent review verified;
- explicit promotion decision verified;
- post-registry CI verified;
- exact final candidate/registry binding verified;
- promotion authorized;
- registry mutation authorized;
- production claims allowed.

Do not add caller-controlled completion flags that make the local preflight
self-certifying.

### Registry transition rule

Laboratory code remains outside the authoritative registry until promotion
review. When promotion is explicitly approved:

- use a stable, narrow capability ID;
- choose the narrowest truthful registry status;
- if status is `implemented`, name runnable Node test evidence;
- bind the implemented capability to an exact test declaration and exact
  assertion lines in `mesh/config/capability-evidence-bindings.json`;
- run the canonical registry and evidence-binding validators;
- update published digests/status documentation atomically;
- do not reuse pre-registry CI as post-registry evidence.

Documentation, a promotion-preflight record, or an old readiness ledger cannot
substitute for the authoritative registry and binding files.

### Identity rotation and currentness recovery

For A1 machine identity, preserve complete credential history, exact predecessor
digests and dispositions, issuer-signed revocation/compromise evidence, and
operational-key uniqueness across forbidden epochs. Historical valid signatures
remain historical evidence after routine key retirement.

For A6-style currentness, retain the expected latest signed head outside the
untrusted caller payload, restore and verify it after restart, reject credential
or revocation-history truncation, reject older otherwise-valid heads when a
later retained head is expected, and fail closed when required currentness is
unknown. A post-hoc currentness recheck is not proof that the original effect
path consulted currentness.

### Delegation, handoff, and replay recovery

A3 attenuation proof is not delegation authority. Before any authority-bearing
delegation design, bind the parent authority source and relevant ancestor
identity/currentness state, prove child authority is a subset in every
dimension, define descendant invalidation after ancestor compromise, define
crash/restart behavior, and prove protocol/runtime/vendor changes cannot widen
the chain.

A4 is a signed task proposal, not authorization. A production recipient path
must add live recipient-side authority reevaluation, durable nonce/replay/
idempotency enforcement, exact delegation-chain evidence if delegation exists,
stale credential/handoff rejection, cancellation and uncertain-outcome
semantics, and duplicate-effect protection after crash/retry.

### Work-receipt and effect recovery

A5 portable Grid terminal lifecycle evidence is not automatically proof of a
filesystem, process, network, hardware, payment, communication, or application
result. Before effect-specific promotion, bind the exact authority/currentness
actually consulted on the effect path, plan/approval/grant/consumption evidence
where applicable, the exact effect-specific executor receipt, ordered effect
summaries, and uncertainty semantics. Never convert Grid `completed` into task
success without task-specific verification.

### Sovereign context and contribution-history recovery

A7 semantic-trust work belongs in the Sovereign Vault / Personal Context
architecture rather than a competing memory authority. Preserve data-vs-
instruction semantics, non-authorizing defaults for model/remote/tool/imported/
derived content, exact derivation ancestry, deny-dominant stale/quarantined/
expired ancestry, and no silent instruction/authority inheritance. Persisted
provenance/lifecycle and any owner-review contract must integrate with the
accepted Vault/Context path. Ambiguous legacy provenance remains untrusted until
deterministically reconstructed or explicitly reviewed.

A8 contribution history is review-prioritization evidence only. Preserve
rejected, failed, superseded, invalidated, and reverted entries; define reviewer
credential rotation; retain an independently witnessed latest head for stronger
currentness claims; document Sybil/collusion/identity-reset limits; and never
convert history or a scalar score into automatic authority, merge rights, or
approval exemption.

### Protocol projection and verifier recovery

Current Stage C parity proves only that offline MCP tool and offline A2A skill
mappings cover the same canonical C0 public read-only methods. It does not prove
wire conformance, transport availability, live authorization, runtime authority
parity, or a servable A2A Agent Card. Real edge adapters require pinned external
spec versions, separate transport/hostile-input review, downgrade/version-
confusion tests, preserved native AXIOM authority semantics, and safe recovery
from endpoint/key/profile changes.

A10 direct live reverification is stronger than checking its detached report.
The detached report remains unauthenticated and non-portable assurance. Broad
independent-verifier claims require public-input packaging without privileged
producer state, runtime/process separation, a second independently implemented
verifier or conformance harness, and fail-closed handling of missing/corrupt
trust roots, stale heads, and unavailable artifacts.

### Rollback after promotion

If a promoted capability develops a critical/high defect:

1. deny or disable the affected capability/effect path first;
2. preserve evidence explaining the disablement;
3. revoke or retire compromised credentials/trust roots where necessary;
4. prevent descendant/new effects when ancestor currentness is affected;
5. retain historical verification material;
6. update authoritative registry/readiness state truthfully;
7. produce a corrective candidate with adversarial regression evidence;
8. repeat the full promotion sequence before re-enabling.

Rollback must not rewrite history to imply the defect or earlier assurance never
existed.

### Current laboratory boundary

Current Agent Trust/Agent Commons work includes laboratory primitives for machine
identity/currentness, authority snapshots, attenuation proof, signed proposals,
portable terminal evidence, post-hoc currentness composition, live
reverification, contribution history, Sovereign Context semantic trust, and
offline Stage C protocol-projection parity.

These pieces do not collectively imply a production Agent Trust Protocol. Open
gates include authority-bearing delegation, accepted effect-specific
consume-before-effect integration, retained-head recovery across independent
restarts, full accepted-context persistence/review integration, real protocol
transports, runtime-separated/independent verification, independent security
review of the final composed authority surface, explicit promotion decisions,
authoritative capability-registry/evidence binding, and post-registry protected
CI.
