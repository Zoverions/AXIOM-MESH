# State Placement and Projection Threat Model

## Current activation boundary

S0 is an inert, pure planning/evaluation laboratory. It defines closed state-placement request, destination, policy, and plan contracts plus deterministic eligibility evaluation. It performs no provider or network I/O, no object transfer, no credential access, no Gateway route, no Grid mutation, no canonical-state migration, and no external effect. Grid remains the first-generation canonical authoritative state store.

S0 does not implement the later projection outbox, derived consumer runtime, remote-object adapters, recovery pilot, or scale campaign. It does not expand the Rust trust-core authority boundary.

## Assets and trust statements

The protected assets are truthful placement constraints, exact policy/request/destination bindings, owner scope, residency and confidentiality requirements, retention/freshness/encryption requirements, deterministic eligibility results, and the separation between a placement plan and effect authority.

A valid destination profile is descriptive evidence only. Storage location, provider availability, recency, low cost, successful evaluation, replica count, or a placement plan never creates canonical-state, provider, network, credential, or execution authority.

## S0 attacker capabilities

Assume an attacker can submit malformed or stale contract objects; alter digests or identifiers; substitute owner scope, destination class, region, evidence level, retention, freshness, encryption, cost, or effect fields; reorder or duplicate destination candidates; present unsupported enum values; attempt to use cheap destinations to bypass privacy constraints; replay expired inputs; and present a placement plan as if it were a capability.

S0 does not assume the destination profile proves physical location, legal compliance, provider honesty, or future availability. Those stronger claims require later separately reviewed evidence.

## S0 threats and required controls

| Threat | Required S0 control |
|---|---|
| stale request or policy replay | Canonical time/currentness checks; fail closed outside the validity window |
| policy/request digest substitution | Request binds the exact policy digest; every contract self-digest is recomputed |
| owner-scope substitution | Request and policy owner scopes must match exactly |
| residency evidence downgrade | Explicit evidence-strength table and the strongest request/policy minimum floor |
| destination-class substitution | Dual filtering by request and policy; closed destination-class enum |
| provider cost used to override privacy | Residency, confidentiality, retention, encryption, destination and policy checks are hard eligibility constraints; cost never ranks S0 |
| unsupported encryption, retention, consistency or freshness | Closed exact checks and bounded fields |
| duplicate destination identity | Duplicate destination IDs and ambiguous profile identity fail closed |
| availability shortfall | `satisfied:false`; never move a failed destination into the eligible set |
| plan presented as capability | All authority/network/provider/canonical-state effect fields are fixed to `none`; no runtime route exists |
| I/O accidentally introduced | Source-boundary regression rejects network, filesystem, process, provider, credential, Gateway, Hypervisor, Sandbox, and Grid dependencies |
| raw credentials inserted into contracts | Closed fields, bounded objects, no credential fields, and `contains_secret_material:false` where applicable |
| candidate order manipulation | Eligible/ineligible results and reason codes are deterministically sorted; input order cannot change the plan digest |
| policy candidate truncation hides choices | S0 fails closed if otherwise-eligible candidates exceed the policy ceiling rather than silently ranking or truncating them |

## Required negative tests

The S0 suite must reject unknown fields and enums, malformed or substituted digests, duplicate set members, invalid timestamps, expired request/policy/destination state, owner-scope mismatch, exact-policy-digest mismatch, disallowed operations, weak residency evidence, wrong regions, insufficient confidentiality, unsupported disclosure/retention/freshness/consistency/encryption/recovery requirements, cost-ceiling violations, duplicate candidate identities, excessive candidate counts, effect-field elevation, and tampered plan digests.

The suite must also prove that insufficient replica count or failure-domain diversity yields `satisfied:false` without weakening any eligibility constraint, and that a cheaper ineligible destination cannot defeat a more expensive eligible one.

## Later S1-S6 threats not yet implemented

Later stages must separately address immutable local/object-store writes, provider credentials and adapter confinement, uncertain provider results, durable projection-outbox atomicity, duplicate/replay/reorder handling, derived-consumer write-back attempts, remote provider compromise, ciphertext/object substitution, retry storms, deletion truth, fresh-host rollback/tamper recovery, cache poisoning/stampedes, tenant isolation, privacy/correlation, and measured scale/backpressure behavior.

None of those controls is claimed by S0.

## Current non-claims

S0 does not claim or authorize production cloud/object storage, object transfer, provider SDK integration, remote storage discovery, backup replacement, an alternative canonical database, multi-master consensus, a projection or CDC runtime, exactly-once delivery, search/index service activation, privacy analytics execution, automatic provider migration, autonomous deletion or billing, credential use, Gateway exposure, Grid mutation, capability promotion, production deployment, verified physical residency, legal compliance certification, or Rust production authority.
