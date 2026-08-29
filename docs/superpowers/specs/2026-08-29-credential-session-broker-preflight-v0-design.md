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

The repository already contains delegation graph, ledger, authority-ceiling, and signed attenuation-proof laboratories. Those components can prove proposed narrowing, preserve expiry/revocation provenance, and return non-authorizing evidence. They explicitly do not grant execution authority.

The agent-interoperability roadmap requires the PHASEONE emergent-coordination campaign before machine delegation may move beyond the current depth-zero denial rule.

Therefore this design does **not** activate machine delegation. Broker preflight may inspect proposed delegation evidence, but a cross-principal executor remains blocked until delegation is separately promoted by repository policy, capability state, tests, review, and evidence.

## 3. Architectural alternatives

### A. Access Envelope + Credential Slot + Broker Preflight — selected

Add three inert components:

- `Agent Access Envelope v0`
- `Credential Slot Profile v0`
- `Credential Broker Preflight v0`

The first two are descriptive/content-addressed contracts. The third is a pure deterministic resolver. None can use or expose credentials.

This separates access intent, credential custody metadata, and eventual effect execution.

### B. Activate live delegation first — rejected

Existing attenuation proofs make delegation structurally testable, but current machine principals still deny delegation and the roadmap requires additional emergent-coordination evidence before promotion. Turning delegation on here would cross an explicit safety boundary.

### C. Build a provider-specific broker first — rejected

Starting with Gmail, OAuth, browser sessions, MCP, or another concrete provider would prematurely couple the sovereign architecture to one authentication mechanism and would introduce live secret/network handling before the control contracts are stable.

## 4. Goals

The first executable slice must allow AXIOM to answer, without using a credential:

- who is the subject of the requested access;
- which persistent machine principal is acting;
- which runtime/worker is proposed as executor;
- which exact service/account/resource/action/purpose/destination is requested;
- which exact non-authorizing authority snapshot is presented;
- whether a broker-held credential slot structurally matches the requested service/account/destination;
- whether fresh human presence would eventually be required;
- whether cross-principal execution would require delegation;
- whether supplied delegation evidence is structurally consistent while live delegation remains blocked;
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
- proof that a credential currently exists or is valid at the external provider;
- proof that an external service will accept a credential;
- proof of account ownership;
- proof of subjective identity or agent personhood.

## 6. Identity roles

The Access Envelope distinguishes three roles.

### 6.1 Subject

The person, institution, principal, or governed entity on whose behalf the external account/session exists.

The subject is not inferred from credential-slot existence or credential possession.

### 6.2 Actor

The persistent AXIOM machine principal that decided to request the operation.

For v0, direct authority evidence is bound to the actor through an exact `axiom-agent-authority-manifest.v1` snapshot.

### 6.3 Executor

The concrete runtime principal proposed to carry out the operation or navigation.

`actor_id == executor_id` means no cross-principal authority delegation is required by the envelope.

`actor_id != executor_id` means cognitive delegation is present and authority delegation must be assessed separately. Under the current depth-zero machine-principal boundary, runtime activation remains blocked even if proposed delegation evidence is structurally valid.

This prevents every worker from impersonating the subject or actor.

## 7. Agent Access Envelope v0

### 7.1 Purpose

`axiom-agent-access-envelope.v0` is a content-addressed description of one proposed external-access transaction.

It is not a bearer token, capability token, authorization grant, session cookie, OAuth credential, or execution request.

### 7.2 Exact v0 fields

The exact v0 contract contains:

- `schema`
- `transaction_id`
- `subject_id`
- `actor_id`
- `executor_id`
- `service_id`
- `account_ref`
- `resource_ref`
- `actions`
- `purpose`
- `destination`
- `authority_evidence`
- `created_at`
- `expires_at`
- `semantics`
- optional `envelope_digest` on input; normalized output always includes it.

Unknown fields fail closed.

`actions` is bounded to 1-64 sorted unique action identifiers. Wildcards are forbidden.

`purpose` is one exact bounded purpose identifier.

`destination` is one exact bounded destination/origin identifier. Wildcard destination syntax is forbidden.

`account_ref` and `resource_ref` are bounded opaque references. They identify matching/routing context only and must not be treated as authority or credential values.

### 7.3 Authority evidence reference

`authority_evidence` has exactly two fields:

```text
manifest = {
  schema: axiom-agent-authority-manifest.v1,
  digest: <64-hex manifest digest>
}

delegation = null | {
  schema: axiom-delegation-chain-resolution.v1,
  digest: <64-hex chain digest>
}
```

The manifest reference is mandatory.

The delegation reference is mandatory only when `actor_id != executor_id`; it must be `null` when `actor_id == executor_id`.

This removes ambiguous evidence composition from v0. The existing signed attenuation-proof laboratory remains relevant evidence research, but Broker Preflight v0 does not accept it directly. A later version may add a signed-proof input only after exact key-trust, signature-verification, and currentness semantics are specified.

### 7.4 Hard semantics

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

### 7.5 Lifetime

`created_at` and `expires_at` are canonical UTC ISO timestamps.

The maximum v0 envelope lifetime is **10 minutes**.

`expires_at` must be later than `created_at` and no more than 10 minutes later.

At preflight time:

- evaluation before `created_at` returns `blocked` with `envelope_not_yet_valid`;
- evaluation at or after `expires_at` returns `blocked` with `envelope_expired`.

## 8. Credential Slot Profile v0

### 8.1 Purpose

`axiom-credential-slot-profile.v0` describes broker custody and authentication capabilities without containing the secret material itself.

It answers:

- which subject/service/account boundary the slot is for;
- which authentication mechanism class is available;
- whether fresh user presence may be required;
- which exact authentication destinations are structurally allowed;
- which trusted custody mode owns eventual credential use.

It does not answer whether the current actor is authorized to use the slot.

### 8.2 Exact v0 fields

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
- `semantics`
- optional `slot_digest` on input; normalized output always includes it.

Unknown fields fail closed.

`account_ref` must exactly match the Access Envelope account reference before preflight can be structurally ready.

`auth_destinations` is a bounded sorted unique list of exact origins/service destinations. Wildcards are forbidden.

The slot has no `expires_at` in v0 because it is a descriptor of configured custody, not proof that the underlying credential is currently valid. Credential currentness is explicitly deferred to the future live broker stage.

### 8.3 Credential kinds

The closed v0 set is:

- `oauth-grant`
- `authenticated-web-session`
- `api-credential`
- `passkey-mediated-session`
- `client-certificate`
- `workload-identity`
- `external-secret-provider`

These are mechanism classes only. Listing one does not prove the credential exists, is valid, or may be used.

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

`not-required-by-profile` does not prove the external provider will not independently require MFA or reauthentication.

`may-be-required` means the v0 profile cannot determine whether the external provider will challenge at use time.

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

Generic environment/configuration maps are intentionally not representable.

Closed-world field validation rejects named password/token/cookie/private-key/TOTP fields because they are unsupported fields. The design does **not** claim arbitrary-string secret detection.

## 9. Credential Broker Preflight v0

### 9.1 Purpose

The first executable component is a pure function that evaluates supplied access-envelope, credential-slot, authority-manifest, and optional delegation evidence.

It performs no filesystem mutation, credential lookup, network access, OAuth exchange, browser interaction, provider call, Gateway invocation, Grid mutation, or effect.

### 9.2 Exact inputs

The resolver accepts only:

- one normalized or normalizable Access Envelope;
- one normalized or normalizable Credential Slot Profile;
- one supplied `axiom-agent-authority-manifest.v1` object;
- when `actor_id != executor_id`, one delegation evaluation package sufficient to reproduce `resolveDelegationChain(...)` and compare its `chain_digest` with the envelope reference;
- an explicit evaluation timestamp.

The delegation evaluation package contains only the existing delegation resolver inputs:

- `root_authority`
- `grants`
- `revocations`
- `target_grant_id`

No caller-supplied flag can enable delegation in v0. Cross-principal execution is hard-blocked by this contract while current machine-principal delegation remains unpromoted.

No implicit global credential store, ambient principal, default subject, process environment, or current policy cache is consulted.

### 9.3 Manifest binding

The supplied authority manifest must satisfy all of these structural conditions:

- schema is exactly `axiom-agent-authority-manifest.v1`;
- its canonical `manifest_digest` matches the envelope's manifest digest reference;
- its `principal.id` equals `actor_id`;
- its validity window contains the preflight evaluation timestamp;
- every envelope action appears in `authority.requestable_actions`;
- envelope purpose appears in `authority.purposes`;
- envelope destination appears in `authority.destinations`.

The manifest is still a non-authorizing snapshot. Passing these checks does not prove current policy, revocation, approval, or external credential state. `authorization_recheck_required` remains true in every result.

### 9.4 Slot binding

The supplied slot must satisfy all of these exact bindings:

- `slot.subject_id == envelope.subject_id`
- `slot.service_id == envelope.service_id`
- `slot.account_ref == envelope.account_ref`
- `envelope.destination` appears exactly in `slot.auth_destinations`.

There is no fallback matching by display name, domain suffix, substring, wildcard, or inferred account ownership.

### 9.5 Direct execution case

When `actor_id == executor_id`:

- `authority_evidence.delegation` must be `null`;
- no delegation resolver input is accepted;
- direct manifest checks are evaluated;
- successful structural checks may produce `structurally-ready` or `user-action-required` depending on the slot's user-presence profile.

The result remains non-authorizing.

### 9.6 Cross-principal execution case

When `actor_id != executor_id`:

- a delegation evidence reference is required;
- the supplied delegation evaluation package is resolved using existing `resolveDelegationChain(...)` logic;
- the resulting `chain_digest` must exactly match the envelope delegation reference;
- resolved `root_holder` must equal `actor_id`;
- the final chain delegate and effective-authority holder must equal `executor_id`;
- the delegated actions/purposes/destinations must cover the envelope request without widening;
- the existing delegation resolver's expiry/revocation/attenuation checks must pass.

Even when every check passes, Broker Preflight v0 returns `blocked` with `live_machine_delegation_not_promoted`.

The result distinguishes:

```text
delegation_evidence = valid | invalid | absent | unassessed
delegation_activation = not-required | blocked
```

`eligible` is intentionally not a v0 value.

### 9.7 User-presence handling

If all structural checks pass and the slot says:

- `fresh-presence-required` -> status `user-action-required`;
- `may-be-required` -> status `structurally-ready` with revalidation requirement `provider_user_presence_may_be_required`;
- `not-required-by-profile` -> status `structurally-ready`.

A cross-principal request remains `blocked` regardless of user-presence state because live delegation is not promoted.

The resolver cannot satisfy or invent an approval, MFA, passkey, biometric, or provider-authentication event.

### 9.8 Preflight result

The pure result uses exact schema `axiom-credential-broker-preflight.v0` and contains:

- `schema`
- `status`
- `transaction_id`
- `envelope_digest`
- `slot_digest`
- `subject_id`
- `actor_id`
- `executor_id`
- `bindings`
- `authority`
- `delegation`
- `user_presence`
- `blocking_reasons`
- `revalidation_requirements`
- `semantics`
- `preflight_digest`.

`blocking_reasons` and `revalidation_requirements` are bounded, sorted, and unique stable identifiers.

The top-level status is exactly one of:

- `structurally-ready`
- `user-action-required`
- `blocked`.

`structurally-ready` means only that the supplied snapshot evidence and slot descriptor are internally consistent enough to proceed to a future live authorization/broker stage.

It does not mean authorized, authenticated, or executed.

### 9.9 Hard result boundary

Every result fixes:

```text
broker_mode = broker-mediated
secret_visibility = broker-only
authorization_recheck_required = true
credential_currentness_verified = false
receipt_required = true
credential_release_authorized = false
execution_authorized = false
authority_effect = none
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
Agent Authority Manifest snapshot
    +
optional delegation graph inputs
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
NO Grid mutation
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

The current authority manifest is the v0 direct-authority snapshot because it binds a principal ID, runtime identity, requestable actions, purposes, destinations, budgets, policy/discovery digests, identity credential digest, and short validity window while explicitly remaining non-authorizing.

Broker Preflight validates its structural binding and preserves its `requires_live_revalidation` semantics.

### 11.3 Authority Ceiling and attenuation proof

`axiom-agent-authority-ceiling.v1` and `axiom-agent-attenuation-proof.v1` remain useful attenuation laboratories. Broker Preflight v0 does not accept them directly because v0 chooses one unambiguous direct-authority snapshot format and one unambiguous delegation-resolution format.

A later version may add them only with explicit subject/executor/key/currentness bindings.

### 11.4 Delegation graph and ledger

The delegation graph/ledger already model bounded actions, purposes, data scopes, destinations, budgets, assurance floors, expiry, depth, provenance, and revocation. Their chain-resolution outputs explicitly state that execution authority is not granted.

Broker Preflight reuses `resolveDelegationChain(...)` for structural evidence and does not duplicate its graph logic or make it executable.

### 11.5 Agent Composition and Self Bundle

Agent Composition may reference a credential/session-broker policy artifact, but composition never contains credential values. Self Bundle lineage may commit to the composition that names such a policy, but historical identity state cannot authorize present credential use.

### 11.6 Provider substrate

A future credential broker, OAuth adapter, browser session executor, SPIFFE provider, or secret manager may be represented through the provider substrate. Provider declaration/binding remains descriptive and non-authorizing.

## 12. Secret non-observability boundary

The first slice proves only that its data contracts have no credential-value fields and that its pure resolver has no secret/network runtime dependencies.

It does **not** prove arbitrary strings never contain secret material. Generic string scanning cannot establish that property.

Future live broker implementations must enforce non-observability at the execution boundary. Requirements will include:

- no raw credential return path;
- no secret-bearing error path;
- no cookies/auth headers/local-storage tokens in model-visible observations;
- no secret-bearing screenshots/DOM projections where authentication UI exposes sensitive values;
- least-privilege broker process identity;
- exact destination binding;
- short-lived credential use where supported;
- explicit reauthentication/user-presence handling;
- sanitized outputs and receipts.

Those are later implementation gates, not claims of this v0 contract.

## 13. Standards compatibility

External standards inform adapters and translation layers but do not become AXIOM's internal authority root.

### 13.1 OAuth Rich Authorization Requests

RFC 9396-style structured authorization details are a useful future mapping target for AXIOM's typed action/resource/purpose constraints.

The v0 contracts do not send OAuth requests.

### 13.2 OAuth Transaction Tokens

Transaction-token concepts are useful for propagating transaction/principal/workload context through trusted call chains without embedding the original access token.

The v0 Access Envelope is an AXIOM-local contract, not a claim of Transaction Token compatibility.

### 13.3 SPIFFE

SPIFFE/SVID-style workload identity is a strong future candidate for authenticating broker and executor workloads without long-lived shared client secrets.

The v0 slot may classify `workload-identity`, but it does not issue or validate an SVID.

### 13.4 Attestation-based OAuth client authentication

Client-instance attestation may later strengthen confidence that a broker instance is the intended credential-using workload.

The v0 broker preflight does not perform attestation.

### 13.5 MCP and A2A

MCP/A2A remain compatibility/transport layers. They do not define AXIOM authority, credential custody, or delegation semantics. Any future mapping must terminate in the same AXIOM authority and broker boundaries.

## 14. Error handling

Validation errors are deterministic and fail closed.

No validation failure may fall back to ambient credentials, default accounts, broader destinations, actor-as-subject assumptions, or executor-as-actor assumptions.

Preflight distinction:

- malformed, ambiguous, digest-invalid, or contradictory input -> validation error;
- well-formed request that fails a structural authority/slot/expiry/delegation condition -> `blocked`;
- direct well-formed request whose only unsatisfied condition is explicit fresh human presence -> `user-action-required`;
- direct well-formed request with all v0 structural evidence satisfied -> `structurally-ready`.

A `structurally-ready` result remains non-authorizing.

## 15. Threat model additions

The eventual broker boundary introduces new threat classes that this v0 design must already model:

- confused deputy: worker tries to use a slot for another subject/service/account/resource;
- credential laundering: slot existence is treated as permission;
- authority laundering: valid attenuation evidence is treated as active delegation before promotion;
- executor substitution;
- actor substitution;
- subject/account substitution;
- destination widening or redirect-based credential exfiltration;
- secret leakage through errors, logs, screenshots, DOM, cookies, headers, or model context;
- stale authority/currentness or revocation snapshots;
- replay of a previously structurally-ready access envelope;
- credential-kind downgrade or custody-mode substitution;
- user-presence bypass;
- provider metadata/prompt injection causing broader credential use;
- cross-protocol authority amplification;
- ambient environment-variable or host-session credential use.

The first slice mitigates structural confusion and representation risks only. Live secret-use threats remain unimplemented and must not be advertised as solved.

## 16. Testing strategy

Use Node built-in tests and existing canonical validation/digest helpers.

### 16.1 Access Envelope tests

Cover:

- exact schema/version;
- unknown-field rejection;
- bounded/sorted/unique actions;
- deterministic digest across object key order;
- canonical timestamps and exact 10-minute maximum lifetime;
- exact account/resource/service/destination references;
- subject/actor/executor distinction;
- mandatory manifest evidence reference;
- delegation reference required exactly when actor differs from executor;
- fixed non-authority semantics;
- deep-frozen input/non-mutation;
- rejection of secret/config bags.

### 16.2 Credential Slot tests

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

The tests must not claim arbitrary-string secret detection.

### 16.3 Broker Preflight tests

Cover:

- exact subject/service/account/destination match;
- authority manifest digest/principal/validity binding;
- action/purpose/destination subset checks against manifest;
- direct actor==executor path;
- direct request with fresh-presence requirement -> `user-action-required`;
- `may-be-required` user presence produces a future revalidation condition;
- actor!=executor requires exact delegation reference and resolver inputs;
- valid delegation chain root/final-delegate/digest binding;
- structurally valid delegation still blocked from live delegation;
- invalid/expired/revoked delegation resolver inputs fail closed;
- envelope not-yet-valid and expired states;
- deterministic reason ordering and preflight digest;
- `structurally-ready` still sets credential/execution authorization false;
- no mutation of input evidence;
- no network/filesystem/subprocess/Gateway/Grid/credential-provider imports in the pure resolver.

### 16.4 Adversarial tests

Include:

- actor/executor swap;
- actor/manifest-principal swap;
- subject/account swap;
- slot reuse across service IDs;
- account-ref substitution;
- destination substitution;
- manifest digest for a different actor;
- delegation chain for a different executor;
- delegation root holder different from actor;
- expired envelope with otherwise valid evidence;
- unpromoted delegation represented as if promoted;
- unknown credential mechanism;
- added secret-bearing field;
- added runtime-activation field.

## 17. First implementation files

The implementation plan should target a small isolated set:

- `mesh/config/agent-access-envelope-v0.schema.json`
- `mesh/config/credential-slot-profile-v0.schema.json`
- `mesh/src/lib/agent-access-envelope.mjs`
- `mesh/src/lib/credential-slot-profile.mjs`
- `mesh/src/lib/credential-broker-preflight.mjs`
- corresponding focused tests
- documentation-boundary registration
- threat-model/roadmap wording only where necessary to prevent claim drift.

Existing authority-manifest and delegation resolver modules must be reused, not forked.

## 18. Promotion boundary

Passing this slice proves only that AXIOM can:

- represent a proposed external-access transaction without embedding credentials;
- represent broker credential custody without embedding secret values;
- deterministically compare supplied request, slot, authority-manifest, and proposed delegation evidence;
- preserve the current machine-delegation denial boundary;
- identify whether fresh human action would be needed before a future live broker stage.

It does not prove external authentication, provider availability, secret protection in a live process, browser isolation, OAuth correctness, passkey security, credential revocation, account ownership, remote-effect correctness, or live delegation safety.

No capability is promoted by this slice.

## 19. Follow-on slices

After this v0 contract is implemented and verified, future independently governed work may proceed in this order:

1. **live authority/currentness recheck contract** — bind preflight to current policy/revocation/approval state immediately before credential use;
2. **one broker-held credential provider laboratory** — preferably a narrow read-only API/OAuth provider with no browser complexity;
3. **trusted browser/session executor laboratory** — separate model observation from cookies/session/authentication state;
4. **workload identity and broker attestation** — SPIFFE/attestation compatibility where justified;
5. **delegation activation** — only after PHASEONE and separate promotion gates;
6. **sanitized result + broker receipt binding** — connect access envelope, live authority decision, credential-use event, provider response digest, and final AXIOM evidence;
7. **bounded external-provider pilot** — one exact service/account/action profile under least privilege.

## 20. Durable invariants

The following statements are intended to survive later implementation changes:

> **Models receive authority, not secrets.**

> **Credential custody is not authority.**

> **Credential existence is not authorization.**

> **Cognitive delegation is not authority delegation.**

> **Authority delegation is not credential delegation.**

> **A valid attenuation or delegation proof is evidence of narrowing, not proof that delegation is currently enabled.**

> **The executor must be explicitly bound; a worker may not inherit the actor's identity by convenience.**

> **Every consequential external effect must be revalidated against current AXIOM authority immediately before effect.**

> **No protocol adapter may turn transport success, credential possession, or provider authentication into AXIOM authority.**

> **Historical Self Bundle or composition state can explain who the agent is, but cannot authorize present credential use.**

## 21. Acceptance criteria before implementation planning

This design is ready for an implementation plan when all of the following are accepted:

1. v0 remains inert and pure;
2. machine-principal live delegation remains disabled;
3. the existing authority manifest is the exact direct-authority snapshot format;
4. the existing delegation-chain resolver is the exact proposed-delegation evidence path;
5. subject, actor, and executor remain distinct roles;
6. Access Envelope contains no credential values and cannot authorize execution;
7. Credential Slot Profile contains no secret values and cannot authorize use;
8. Broker Preflight cannot read credentials or perform network/browser/Gateway/Grid effects;
9. `structurally-ready` is explicitly non-authorizing;
10. fresh user-presence requirements are reportable but not satisfiable by v0;
11. cross-principal execution is always blocked in v0 even with structurally valid delegation evidence;
12. unknown fields and ambiguous evidence fail closed;
13. no capability-registry status changes occur in the first implementation slice;
14. live broker, OAuth, browser/session, passkey, and delegation activation work remain separate future promotion gates.
