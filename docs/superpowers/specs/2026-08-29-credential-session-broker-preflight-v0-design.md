# Credential & Session Broker Preflight v0 — Design

**Status:** approved architecture; design-only until implementation plan and TDD evidence exist

**Date:** 2026-08-29

**Scope:** inert access-request and credential-custody contracts plus a pure broker preflight resolver. No credential release, network access, browser automation, live delegation, or execution authority is enabled by this design.

**Authority:** `mesh/config/capabilities.json` remains authoritative for implemented and promoted capability state. This document does not promote any capability.

## 1. Design doctrine

This design extends the sovereign-agent composition, Self Bundle, provider-substrate, machine-principal, and attenuation-only delegation work already present on `main`.

> **Models receive authority, not secrets.**

More precisely:

> **An agent may know that access exists. It may request use of that access. It ordinarily does not need to possess the credential that makes the access possible.**

The design preserves three independent planes:

1. **cognitive delegation** — which model/runtime/worker performs reasoning or navigation;
2. **authority delegation** — which principal may request which effect under which constraints;
3. **credential use** — which trusted broker mechanism may authenticate to the exact external service.

These planes must never be silently collapsed.

Cognitive delegation does not grant authority. Authority delegation does not imply credential possession. Credential custody does not create authorization.

## 2. Current-build constraint

Current `axiom-machine-principal.v1` remains explicitly non-delegating. Machine-principal delegation is fixed to `allowed: false` and maximum depth `0`.

The repository already contains delegation graph, ledger, authority-ceiling, and signed attenuation-proof laboratories. Those components can prove that proposed child authority is equal-or-narrower, preserve expiry/revocation provenance, and return non-authorizing evidence. They explicitly do not grant execution authority.

The agent-interoperability roadmap requires the PHASEONE emergent-coordination campaign before machine delegation may move beyond the current depth-zero denial rule.

Therefore this design does **not** activate machine delegation. Broker preflight may consume direct authority evidence and may inspect proposed delegation evidence, but a cross-principal executor remains blocked until delegation is separately promoted by repository policy, capability state, tests, review, and evidence.

## 3. Architectural alternatives

### A. Access Envelope + Credential Slot + Broker Preflight — selected

Add three inert components:

- `Agent Access Envelope v0`
- `Credential Slot Profile v0`
- `Credential Broker Preflight v0`

The first two are descriptive/content-addressed contracts. The third is a pure deterministic resolver. None can use or expose credentials.

This cleanly separates access intent, credential custody metadata, and eventual effect execution.

### B. Activate live delegation first — rejected

Existing attenuation proofs make delegation structurally testable, but current machine principals still deny delegation and the roadmap requires additional emergent-coordination evidence before promotion. Turning delegation on here would cross an explicit safety boundary.

### C. Build a provider-specific broker first — rejected

Starting with Gmail, OAuth, browser sessions, MCP, or another concrete provider would prematurely couple the sovereign architecture to one authentication mechanism and would introduce live secret/network handling before the control contracts are stable.

## 4. Goals

The first executable slice must allow AXIOM to answer, without using a credential:

- who is the subject of the requested access;
- which persistent agent is acting;
- which runtime/worker is proposed as executor;
- what service/resource/action/purpose/destination is requested;
- which exact authority evidence is presented;
- whether a broker-held credential slot could structurally satisfy the authentication requirement;
- whether fresh human action would eventually be required;
- whether proposed delegated execution is merely evidence-valid or actually activation-eligible;
- which conditions must be revalidated immediately before any future effect.

The slice must produce deterministic, content-addressed results suitable for later receipts and review.

## 5. Non-goals

This slice does **not** implement or claim:

- password, token, refresh-token, cookie, TOTP-seed, private-key, passkey-private-key, or certificate-private-key storage;
- raw-secret export;
- OAuth authorization-code or token exchange;
- browser login or authenticated browsing;
- passkey, biometric, device, or MFA ceremony;
- API calls or outbound network access;
- external account discovery;
- MCP client/server authorization;
- SPIFFE workload issuance;
- attestation-based OAuth authentication;
- credential injection into child agents or model context;
- live delegation or subdelegation;
- Gateway routes;
- Hypervisor/Sandbox execution;
- capability-registry promotion;
- proof that a credential is currently valid at the external provider;
- proof that an external service will accept the credential;
- proof of subjective identity or agent personhood.

## 6. Identity roles

The Access Envelope distinguishes three roles.

### 6.1 Subject

The principal, person, institution, account-owner, or governed entity on whose behalf the requested external access exists.

The subject is not necessarily the executor and is not inferred from possession of a credential descriptor.

### 6.2 Actor

The persistent AXIOM agent or machine principal that decided to request the operation.

The actor is the authority claimant whose direct or delegated authority evidence must be evaluated.

### 6.3 Executor

The concrete runtime principal proposed to carry out the operation or navigation.

`actor_id == executor_id` means no cross-principal authority delegation is required by the envelope.

`actor_id != executor_id` means cognitive delegation is present and authority delegation must be assessed separately. Under the current depth-zero machine-principal boundary, evidence may be structurally valid while runtime delegation remains blocked.

This prevents every worker from impersonating the subject or actor.

## 7. Agent Access Envelope v0

### 7.1 Purpose

`axiom-agent-access-envelope.v0` is a content-addressed description of one proposed external-access transaction.

It is not a bearer token, capability token, authorization grant, session cookie, OAuth credential, or execution request.

### 7.2 Proposed fields

The exact v0 contract contains:

- `schema`
- `transaction_id`
- `subject_id`
- `actor_id`
- `executor_id`
- `service_id`
- `resource_ref`
- `actions`
- `purpose`
- `destination`
- `data_classes`
- `authority_evidence`
- `created_at`
- `expires_at`
- fixed non-authority semantics
- `envelope_digest`

`actions` and `data_classes` are bounded, sorted, and unique.

`authority_evidence` is a closed-world typed reference object. v0 supports exact digest references only; it does not embed generic opaque credentials or arbitrary configuration bags.

Initial evidence kinds are:

- `machine-authority-digest`
- `agent-authority-ceiling`
- `delegation-chain-resolution`
- `agent-attenuation-proof`

The resolver may accept more than one evidence reference only where the contract explicitly defines how they compose. Unknown evidence kinds fail closed.

### 7.3 Hard semantics

Every normalized v0 envelope fixes:

```text
contains_secret_material = false
bearer_token = false
presentation_grants_authority = false
credential_effect = none
authority_effect = none
network_effect = none
runtime_activation = false
```

Any attempt to alter these values fails validation.

### 7.4 Expiry

The envelope lifetime is intentionally short and bounded. The implementation plan should choose one exact maximum not exceeding 15 minutes, matching the repository's short-lived machine-authority projection style unless a stronger existing invariant dictates a lower ceiling.

A preflight performed after `expires_at` is blocked.

## 8. Credential Slot Profile v0

### 8.1 Purpose

`axiom-credential-slot-profile.v0` describes broker custody and authentication capabilities without containing the secret material itself.

It answers questions such as:

- which service/account boundary the slot is for;
- which authentication mechanism class is available;
- whether fresh user presence may be required;
- which exact authentication destinations are structurally allowed;
- which trusted custody mode owns the eventual credential use.

It does not answer whether the current actor is authorized to use the slot.

### 8.2 Proposed fields

The exact v0 profile contains:

- `schema`
- `slot_id`
- `subject_id`
- `service_id`
- `credential_kind`
- `custody_kind`
- `account_ref`
- `auth_destinations`
- `user_presence`
- `created_at`
- `updated_at`
- fixed secrecy/non-authority semantics
- `slot_digest`

`account_ref` is a bounded opaque identifier or digest-like account reference suitable for matching. It must not contain raw secret material.

`auth_destinations` is a bounded, sorted, unique list of exact origins or service destination identifiers. Wildcard destination syntax is forbidden in v0.

### 8.3 Credential kinds

The closed v0 set is:

- `oauth-grant`
- `authenticated-web-session`
- `api-credential`
- `passkey-mediated-session`
- `client-certificate`
- `workload-identity`
- `external-secret-provider`

These are mechanism classes only. Listing one does not prove the external credential exists, is valid, or may be used.

### 8.4 Custody kinds

The closed v0 set is:

- `local-broker`
- `trusted-session-executor`
- `workload-identity-provider`
- `external-secret-manager`

No custody kind gains authority from being listed.

### 8.5 User-presence states

The closed v0 set is:

- `not-required-by-profile`
- `may-be-required`
- `fresh-presence-required`

`not-required-by-profile` does not prove that an external provider will not independently require MFA or reauthentication.

### 8.6 Hard semantics

Every normalized slot profile fixes:

```text
descriptor_contains_secret = false
broker_api_raw_secret_export = false
model_secret_visibility = none
child_agent_secret_visibility = none
authority_effect = none
credential_use_effect = none
network_effect = none
runtime_activation = false
```

Unknown fields fail closed. Generic environment/configuration maps are intentionally not representable.

## 9. Credential Broker Preflight v0

### 9.1 Purpose

The first executable component is a pure function that evaluates supplied access-envelope, credential-slot, and authority evidence.

It performs no filesystem mutation, credential lookup, network access, OAuth exchange, browser interaction, provider call, Gateway invocation, or effect.

### 9.2 Inputs

The resolver accepts:

- one normalized or normalizable Access Envelope;
- one normalized or normalizable Credential Slot Profile;
- an explicit evaluation timestamp;
- supplied current authority evidence required by the envelope;
- optional supplied delegation/attenuation evidence;
- explicit current activation-policy facts indicating whether machine delegation is promoted.

No implicit global credential store, ambient principal, default subject, or process environment is consulted.

### 9.3 Structural checks

The preflight must fail closed when:

- schema/version is unknown;
- envelope or slot digest mismatches;
- envelope is expired or not yet valid where applicable;
- subject IDs do not match;
- service IDs do not match;
- requested destination is not represented by the slot's exact authentication boundary;
- authority evidence digest or type does not match the envelope reference;
- requested action/purpose/destination/data class exceeds the supplied authority ceiling;
- budget/assurance/approval floors would be widened or lowered by proposed delegation;
- authority/delegation evidence is expired or revoked according to the supplied evidence snapshot;
- actor/executor relationship requires delegation but live delegation remains unpromoted;
- duplicate or ambiguous evidence is supplied;
- the slot attempts to encode secret-bearing or activation-bearing fields.

### 9.4 Direct execution case

When `actor_id == executor_id`, the resolver may evaluate direct machine-authority evidence.

A structurally successful result still says only that the request is eligible for a future live broker authorization recheck. It does not authorize credential release or execution.

### 9.5 Cross-principal execution case

When `actor_id != executor_id`, the resolver evaluates any supplied attenuation/delegation evidence as evidence only.

Under current repository policy, even a valid attenuation chain yields a blocked activation state because `axiom-machine-principal.v1` remains depth-zero/non-delegating.

The report must distinguish:

```text
delegation_evidence = valid | invalid | absent | unassessed
delegation_activation = eligible | blocked
```

For the first implementation on current `main`, `eligible` must not be emitted for cross-principal machine execution because live machine delegation is not promoted.

### 9.6 Preflight result

The pure result uses a closed schema such as `axiom-credential-broker-preflight.v0` and contains:

- transaction/envelope/slot digests;
- subject/actor/executor IDs;
- structural match results;
- direct-authority result;
- delegation-evidence result;
- user-presence requirement;
- exact blocking reasons;
- exact future revalidation requirements;
- deterministic report digest;
- hard non-effect semantics.

The top-level status is one of:

- `structurally-ready`
- `user-action-required`
- `blocked`

`structurally-ready` means only that the supplied evidence is internally consistent enough to proceed to a future live authorization/broker stage.

It does not mean authorized, authenticated, or executed.

### 9.7 Hard result boundary

Every result fixes:

```text
broker_mode = broker-mediated
secret_visibility = broker-only
authorization_recheck_required = true
receipt_required = true
credential_release_authorized = false
execution_authorized = false
network_effect = none
runtime_activation = false
```

## 10. Data flow

The first slice is intentionally local and pure:

```text
Agent / runtime
    |
    | proposes
    v
Agent Access Envelope
    +
Credential Slot Profile
    +
explicit authority/delegation evidence
    |
    v
Credential Broker Preflight v0
    |
    +--> structurally-ready
    +--> user-action-required
    +--> blocked

NO credential read
NO network access
NO browser/session use
NO Gateway effect
NO authority grant
```

A later promoted path may become:

```text
Access Envelope
    -> live authority/policy/currentness recheck
    -> Credential & Session Broker
    -> exact authentication mechanism
    -> exact external service
    -> sanitized result
    -> AXIOM receipt/evidence
```

That later path requires separate design, implementation, review, promotion, and threat-model evidence.

## 11. Relationship to existing AXIOM primitives

### 11.1 Machine principals

Machine principals remain the runtime identity/authority root for machine callers. The broker contracts do not create principals or widen machine-principal constraints.

### 11.2 Agent Authority Manifest

The current authority manifest is a short-lived non-authorizing projection of requestable authority. It may inform future broker UX/evidence but presentation of the manifest does not authorize execution or delegation.

### 11.3 Authority Ceiling and attenuation proof

`axiom-agent-authority-ceiling.v1` and `axiom-agent-attenuation-proof.v1` are reusable evidence inputs because they already prove subset/attenuation properties while fixing `authority_effect = none` and `execution_authorized = false`.

The broker must not reinterpret those proof-only semantics as live authority.

### 11.4 Delegation graph and ledger

The delegation graph/ledger already model bounded actions, purposes, data scopes, destinations, budgets, assurance floors, expiry, depth, provenance, and revocation. Their chain-resolution outputs explicitly state that execution authority is not granted.

Broker preflight consumes those outputs as evidence; it does not duplicate their graph logic or make them executable.

### 11.5 Agent Composition and Self Bundle

Agent Composition may reference a credential/session-broker policy artifact, but composition never contains credential values. Self Bundle lineage may commit to the composition that names such a policy, but historical identity state cannot authorize present credential use.

### 11.6 Provider substrate

A future credential broker, OAuth adapter, browser session executor, SPIFFE provider, or secret manager may be represented through the provider substrate. Provider declaration/binding remains descriptive and non-authorizing.

## 12. Secret non-observability boundary

The first slice proves only that its data contracts do not contain representable secret fields and that its resolver has no secret/network runtime dependencies.

It does **not** prove arbitrary strings are never secret material. Generic string scanning cannot establish that property.

Future live broker implementations must enforce non-observability at the execution boundary. Requirements will include:

- no raw credential return path;
- no secret-bearing error path;
- no cookies/auth headers/local-storage tokens in model-visible observations;
- no secret-bearing screenshots/DOM projections where the authentication UI exposes sensitive values;
- least-privilege broker process identity;
- exact destination binding;
- short-lived credential use where supported;
- explicit reauthentication/user-presence handling;
- sanitized outputs and receipts.

Those are later implementation gates, not claims of this v0 contract.

## 13. User-presence handling

The v0 resolver may report that fresh human presence is required, but it cannot satisfy that requirement.

If the slot profile says `fresh-presence-required`, a matching request that would otherwise be structurally ready returns `user-action-required`.

The result must identify the required next-stage condition without inventing an approval or authentication event.

Future high-consequence operations may require combinations of:

- fresh explicit approval;
- passkey/WebAuthn ceremony;
- biometric/device confirmation;
- provider MFA;
- independent AXIOM approval.

Those mechanisms remain outside v0.

## 14. Standards compatibility

External standards inform adapters and translation layers but do not become AXIOM's internal authority root.

### 14.1 OAuth Rich Authorization Requests

RFC 9396-style structured authorization details are a useful future mapping target for AXIOM's typed action/resource/purpose constraints.

The v0 contracts do not send OAuth requests.

### 14.2 OAuth Transaction Tokens

Transaction-token concepts are useful for propagating transaction/principal/workload context through trusted call chains without embedding the original access token.

The v0 Access Envelope is an AXIOM-local contract, not a claim of Transaction Token compatibility.

### 14.3 SPIFFE

SPIFFE/SVID-style workload identity is a strong future candidate for authenticating broker and executor workloads without long-lived shared client secrets.

The v0 slot may classify `workload-identity`, but it does not issue or validate an SVID.

### 14.4 Attestation-based OAuth client authentication

Client-instance attestation may later strengthen confidence that a broker instance is the intended credential-using workload.

The v0 broker preflight does not perform attestation.

### 14.5 MCP and A2A

MCP/A2A remain compatibility/transport layers. They do not define AXIOM authority, credential custody, or delegation semantics. Any future mapping must terminate in the same AXIOM preflight and effect-authority rules.

## 15. Error handling

Validation errors are deterministic and fail closed.

No validation failure may fall back to ambient credentials, default accounts, broader destinations, actor-as-subject assumptions, or executor-as-actor assumptions.

Preflight distinction:

- malformed/ambiguous/contradictory input -> validation error;
- well-formed request that lacks required authority/currentness/delegation -> `blocked`;
- well-formed request whose only unsatisfied condition is explicit fresh human presence -> `user-action-required`;
- well-formed request with all v0 structural evidence satisfied -> `structurally-ready`.

A `structurally-ready` result remains non-authorizing.

## 16. Threat model additions

The eventual broker boundary introduces new threat classes that this v0 design must already model:

- confused deputy: worker tries to use a slot for another subject/service/resource;
- credential laundering: possession/existence of a slot is treated as permission;
- authority laundering: valid attenuation evidence is treated as active delegation before promotion;
- executor substitution: envelope authorizes one executor but another attempts use;
- subject substitution: worker swaps account/subject references;
- destination widening or redirect-based credential exfiltration;
- secret leakage through errors, logs, screenshots, DOM, cookies, headers, or model context;
- stale authorization/currentness or revocation snapshots;
- replay of a previously structurally-ready access envelope;
- credential-kind downgrade or broker-mode substitution;
- user-presence bypass;
- provider metadata/prompt injection causing broader credential use;
- cross-protocol authority amplification;
- ambient environment-variable or host-session credential use.

The first slice mitigates only structural confusion and representation risks. Live secret-use threats remain unimplemented and therefore must not be advertised as solved.

## 17. Testing strategy

Use Node built-in tests and existing canonical validation/digest helpers.

### 17.1 Access Envelope tests

Cover:

- exact schema/version;
- unknown-field rejection;
- bounded/sorted/unique actions and data classes;
- deterministic digest across object key order;
- canonical timestamps and bounded lifetime;
- subject/actor/executor distinction;
- closed authority-evidence types;
- fixed non-authority semantics;
- deep-frozen input/non-mutation;
- rejection of secret/config bags.

### 17.2 Credential Slot tests

Cover:

- exact schema/version;
- closed credential/custody/user-presence enumerations;
- subject/service/account/destination validation;
- wildcard destination rejection;
- fixed no-secret/no-authority semantics;
- deterministic digest;
- timestamp ordering;
- deep-frozen input/non-mutation;
- rejection of password/token/cookie/private-key/TOTP-like named fields.

The test should not claim arbitrary-string secret detection.

### 17.3 Broker Preflight tests

Cover:

- exact subject/service/destination match;
- direct actor==executor path;
- actor!=executor path blocked under current depth-zero delegation policy;
- structurally valid attenuation evidence still blocked from live delegation;
- action/purpose/destination/data-class widening rejection;
- authority evidence digest mismatch;
- expired/stale/revoked supplied evidence;
- fresh user-presence transition to `user-action-required`;
- deterministic reason ordering and report digest;
- `structurally-ready` still sets credential/execution authorization false;
- no mutation of input evidence;
- no network/filesystem/subprocess/Gateway/Grid/credential imports in the pure resolver.

### 17.4 Adversarial tests

Include:

- actor/executor swap;
- subject/account swap;
- slot reuse across service IDs;
- destination substitution;
- duplicated conflicting evidence;
- authority proof for a different transaction context;
- delegation chain for a different executor;
- expired envelope with otherwise valid evidence;
- unpromoted delegation represented as if promoted;
- unknown credential mechanism;
- added secret-bearing field;
- added runtime-activation field.

## 18. First implementation files

The implementation plan should aim for a small, isolated set such as:

- `mesh/config/agent-access-envelope-v0.schema.json`
- `mesh/config/credential-slot-profile-v0.schema.json`
- `mesh/src/lib/agent-access-envelope.mjs`
- `mesh/src/lib/credential-slot-profile.mjs`
- `mesh/src/lib/credential-broker-preflight.mjs`
- corresponding focused tests
- documentation-boundary registration
- threat-model or roadmap wording only where necessary to prevent claim drift.

Existing delegation graph/ledger/attenuation modules should be reused, not forked.

## 19. Promotion boundary

Passing this slice proves only that AXIOM can:

- represent a proposed external-access transaction without embedding credentials;
- represent broker credential custody without embedding secret values;
- deterministically compare supplied request, slot, and authority evidence;
- preserve the current machine-delegation denial boundary;
- identify whether fresh human action would be needed before a future live broker stage.

It does not prove external authentication, provider availability, secret protection in a live process, browser isolation, OAuth correctness, passkey security, credential revocation, account ownership, remote-effect correctness, or live delegation safety.

No capability is promoted by this slice.

## 20. Follow-on slices

After this v0 contract is implemented and verified, future independently governed work may proceed in this order:

1. **live authority/currentness recheck contract** — bind preflight to current policy/revocation/approval state immediately before credential use;
2. **one broker-held credential provider laboratory** — preferably a narrow read-only API/OAuth provider with no browser complexity;
3. **trusted browser/session executor laboratory** — separate model observation from cookies/session/authentication state;
4. **workload identity and broker attestation** — SPIFFE/attestation compatibility where justified;
5. **delegation activation** — only after PHASEONE and separate promotion gates;
6. **sanitized result + broker receipt binding** — connect access envelope, live authority decision, credential-use event, provider response digest, and final AXIOM evidence;
7. **bounded external-provider pilot** — one exact service/account/action profile under least privilege.

## 21. Durable invariants

The following statements are intended to survive later implementation changes:

> **Models receive authority, not secrets.**

> **Credential custody is not authority.**

> **Credential existence is not authorization.**

> **Cognitive delegation is not authority delegation.**

> **Authority delegation is not credential delegation.**

> **A valid attenuation proof is evidence of narrowing, not proof that delegation is currently enabled.**

> **The executor must be explicitly bound; a worker may not inherit the actor's identity by convenience.**

> **Every consequential external effect must be revalidated against current AXIOM authority immediately before effect.**

> **No protocol adapter may turn transport success, credential possession, or provider authentication into AXIOM authority.**

> **Historical Self Bundle or composition state can explain who the agent is, but cannot authorize present credential use.**

## 22. Acceptance criteria before implementation planning

This design is ready for an implementation plan when all of the following are accepted:

1. v0 remains inert and pure;
2. machine-principal live delegation remains disabled;
3. existing delegation/attenuation machinery is reused as evidence only;
4. subject, actor, and executor remain distinct roles;
5. Access Envelope contains no credential values and cannot authorize execution;
6. Credential Slot Profile contains no secret values and cannot authorize use;
7. Broker Preflight cannot read credentials or perform network/browser/Gateway effects;
8. `structurally-ready` is explicitly non-authorizing;
9. fresh user-presence requirements are reportable but not satisfiable by v0;
10. unknown fields and ambiguous evidence fail closed;
11. no capability-registry status changes occur in the first implementation slice;
12. live broker, OAuth, browser/session, passkey, and delegation activation work remain separate future promotion gates.
