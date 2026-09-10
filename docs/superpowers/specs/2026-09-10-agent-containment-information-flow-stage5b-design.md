# Agent Containment & Information-Flow — Fresh Stage 5B Design Gate

**Status:** OWNER APPROVED on 2026-09-10; documentation-only; F0/F1 implementation planning authorized, capability/runtime promotion not authorized

**Date:** 2026-09-10

**Scope:** AXIOM-MESH containment architecture for persistent or external agent runtimes that may observe private data, request connector actions, use delegated capabilities, and participate in consequential workflows.

**Fresh-gate rule:** this Stage 5B does not inherit implementation, migration, authorization, or promotion authority from any earlier sovereign-host, runtime, connector, Rust migration, agent-interoperability, or epistemic stage. Earlier artifacts, tests, evidence, reviews, and lessons are inputs/provenance only.

**Builds on:**

- `CONSTITUTION.md`
- `docs/superpowers/specs/2026-09-02-sovereign-host-deployment-shared-embodiment-design.md`
- `docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md`
- `docs/MASTER-TODO-RUNTIME-CONNECTOR-FABRIC.md`
- `docs/rebuild/REQUIREMENTS.md`
- `docs/security/CURRENT-BUILD-THREAT-MODEL.md`
- `docs/security/DENY-EGRESS-BOUNDARY.md`
- the existing `Gateway -> Hypervisor -> Sandbox -> Grid` authority path
- existing deny-dominant policy, exact-effect commitments, finite destination ceilings, one-use approvals, machine-principal constraints, private credential storage, durable evidence, and external-effect outbox semantics

**Authority boundary:** this design creates no executable capability, no provider activation, no external runtime activation, no credential release, no new egress, no browser automation, no payment authority, no autonomous delegation, no production promotion, and no authority-bearing change to `mesh/config/capabilities.json`.

---

## 1. Architectural decision

AXIOM-MESH should treat powerful agent runtimes as potentially compromised proposal engines operating inside a deterministic authority and information-flow envelope.

The adopted separation is:

```text
agent/runtime cognition
        |
        | proposes intents / reads authorized data
        v
Gateway -> Hypervisor -> Sandbox -> Grid
        |
        +--> trusted approval channel
        +--> credential broker
        +--> egress broker
        +--> evidence / flow receipts
```

The governing doctrine is:

> **Intelligence may request authority. Intelligence must not become the authority root.**

And, for data movement:

> **Network permission is insufficient. Egress must also be constrained by what information causally influenced the outgoing computation.**

The current deny-egress boundary remains the outer default. This programme adds flow-sensitive containment inside that boundary; it does not weaken or replace deny-egress.

---

## 2. Problem statement

The current build already separates authority, private credentials, policy, execution, and evidence. It also denies arbitrary external destinations and keeps the supported kernel in a no-egress candidate container.

That foundation does not yet fully answer four future-agent problems:

1. a runtime that reads private data may later attempt an otherwise permitted egress whose payload leaks that data;
2. a runtime that receives a reusable bearer credential may exfiltrate or replay it outside the intended action;
3. an agent-generated conversational approval prompt may manipulate the human while presenting itself as the trusted authorization ceremony;
4. access to one domain, especially inbox or browser state, may accidentally confer recovery or authentication authority over unrelated domains.

The new architecture closes those gaps without creating a parallel authorization system.

---

## 3. Considered approaches

### 3.1 Static route/destination controls only

Keep deny-egress plus exact destination allowlists and rely on connector-specific schemas.

**Advantages:** simple; compatible with existing policy; low implementation complexity.

**Rejected as sufficient:** destination permission says where data may go, not whether a specific computation is permitted to disclose the information it has observed. A compromised runtime can leak private data through an otherwise valid destination or action.

### 3.2 Application-level taint only

Have adapters annotate private inputs and require downstream application code to propagate labels.

**Advantages:** portable; easy to prototype; can run without host changes.

**Rejected as the final boundary:** application-only tracking can be bypassed by an uninstrumented subprocess, native library, alternate runtime path, unexpected file/socket channel, or future adapter that drops labels.

### 3.3 Staged flow-sensitive enforcement with trusted brokers — adopted

Introduce language-neutral flow labels and receipts first, deterministic broker enforcement second, and host/kernel-assisted propagation only after separate evidence gates.

**Advantages:** preserves current architecture; supports incremental verification; allows Node/Rust differential work; keeps OS-specific enforcement out of the first slice; does not require trusting the agent to report its own data access.

**Trade-off:** more design and evidence work than static allowlists. The stronger properties are justified only for runtimes that may handle private information or consequential connector actions.

---

## 4. Non-negotiable invariants

1. **Agent/runtime is not authority.** Runtime identity, model quality, reputation, installation, or user familiarity never grants effect authority.
2. **Credential possession is minimized.** A supported consequential runtime path should not require the cognitive runtime to hold long-lived reusable provider credentials.
3. **Surrogate is not credential.** A capability/credential surrogate is meaningful only to the trusted broker and cannot be redeemed outside its exact bound action.
4. **Approval UI is authority-owned.** The authoritative approval challenge is generated from committed AXIOM state by a trusted authority component, not from arbitrary agent-authored text.
5. **Private read affects later egress eligibility.** A process/task that observes private or authority-bearing material cannot silently retain the same egress freedom as a public-data-only process/task.
6. **Unknown flow state fails closed.** Missing, malformed, stale, or unrepresentable flow provenance is not treated as public/clean state.
7. **No silent declassification.** A model-generated summary, redaction, rewrite, embedding, compression, encryption, or format conversion does not independently lower a data classification.
8. **Cross-domain recovery authority is isolated.** Access to ordinary application data must not automatically expose OTPs, reset links, magic links, recovery codes, signing keys, or equivalent authority-bearing secrets.
9. **Egress remains exact and finite.** Flow clearance never creates a destination, action, purpose, budget, or provider permission that was not already independently authorized.
10. **Evidence is privacy-minimized.** Flow receipts prove the policy-relevant facts without turning the evidence log into a second store of raw private content.
11. **Fallback never widens authority.** Loss of a broker, runtime, local model, network path, or host enforcement feature fails closed or falls back only to an independently eligible mode.
12. **Capability registry truth remains authoritative.** Design or laboratory code does not become implemented or production-promoted by existence.

---

## 5. Flow-sensitive data model

The programme introduces a language-neutral conceptual `FlowContext` bound to one task/process lineage.

The first contract should represent at least:

```text
flow_context_id
principal
runtime_identity
root_task_id
parent_flow_context_id?
observed_data_classes[]
observed_authority_classes[]
owner_or_domain_scopes[]
purpose_scopes[]
source_commitments[]
created_at
updated_at
policy_profile_digest
flow_digest
```

### 5.1 Data classes

The initial vocabulary should be small and deny-dominant. Candidate classes:

- `public`
- `owner_private`
- `shared_private`
- `regulated_or_restricted`
- `secret`
- `authority_bearing_secret`

The exact vocabulary is an F0 contract decision. The critical semantic rule is monotonic accumulation within a task lineage unless a separately reviewed trusted transformation creates a new derived context.

### 5.2 Authority-bearing material

Authority-bearing material is tracked separately from ordinary confidentiality because exposure can create new power rather than merely disclose information.

Examples include:

- passwords and bearer tokens;
- private signing keys;
- recovery codes;
- one-time authentication codes;
- password-reset links;
- magic-login links;
- session cookies where possession grants access;
- payment credentials;
- device-enrollment secrets.

An agent may be allowed to read an email body while being denied access to authority-bearing tokens embedded in that inbox.

### 5.3 Join semantics

When information from multiple contexts is combined, the child context accumulates the union of relevant restrictions.

```text
public + owner_private -> owner_private
owner_private + authority_bearing_secret -> authority_bearing_secret present
purpose[A] + purpose[B] -> purposes[A,B]
owner[X] + owner[Y] -> owners[X,Y]
```

No component may select the least restrictive parent when combining data.

---

## 6. Trusted observation and propagation

The cognitive runtime must not be the sole authority for declaring what it has read.

The long-horizon target is layered observation:

```text
trusted data broker / filesystem broker
        +
trusted connector broker
        +
host process/file/socket observation where practical
        -> FlowContext updates
```

The first implementation slices may use deterministic synthetic/user-space observation only. They must not claim kernel-enforced information-flow control.

Later host enforcement may use Linux mechanisms such as LSM/eBPF or another reviewed equivalent to observe protected file/socket/process relationships. Adoption of any specific Linux mechanism requires a fresh implementation gate, threat review, performance limits, portability analysis, and bypass testing.

Windows/macOS support may use different mechanisms. The contract must remain platform-neutral even when one reference implementation is Linux-specific.

---

## 7. Credential-surrogate architecture

External credentials remain in a trusted credential broker/provider boundary.

The agent/runtime receives only an inert or broker-redeemable surrogate bound to an exact intended operation.

Conceptually:

```text
runtime
  -> action request + surrogate reference
  -> Hypervisor authorization
  -> exact prepared effect / broker request
  -> credential broker validates binding
  -> broker injects/uses real credential at trusted boundary
  -> credential never returned to runtime
```

A future `CredentialSurrogate` contract should bind at least:

```text
surrogate_id
credential_class
principal
provider_or_connector
exact_action
purpose
exact_destination
allowed_data_classes
value_or_resource_ceiling where applicable
issued_at
expires_at
single_use
prepared_effect_digest or equivalent exact request commitment
policy_profile_digest
```

Required semantics:

- no wildcard provider/action/destination in the first consequential slice;
- finite expiry;
- replay after consumption denied;
- credential rotation does not reveal the replacement credential to the runtime;
- logs, errors, receipts, browser-visible state, and agent memory never intentionally contain the real credential;
- a surrogate alone cannot create an effect outside the ordinary AXIOM authority path.

---

## 8. Trusted approval channel

Current one-use approval semantics remain controlling. This programme changes how future agent-facing approval ceremonies are sourced and presented.

The authoritative challenge must be derived by the trusted authority layer from exact committed state, including where applicable:

```text
requested action
destination/provider
information/data classes
purpose
cost/resource ceiling
retention or external-transfer state
reversibility / rollback limits
exact prepared/request digest
expiry
principal requesting the action
```

Agent-authored rationale may be displayed separately as agent-provided explanation. It cannot define or overwrite the authoritative action, destination, data scope, cost, expiry, or approval digest.

The trusted UI may be Axiom One or another approved client; the approval contract remains interface-neutral.

> **The model may explain the request. The model does not construct the authority object the human is asked to approve.**

---

## 9. Egress broker

The future egress broker is the only component permitted to convert an already-authorized protected agent/runtime action into a network request.

Before release it validates at least:

1. exact action/destination/provider authority;
2. current principal/runtime identity and policy digest;
3. valid prepared effect or equivalent exact request commitment;
4. current `FlowContext` digest;
5. destination-specific data-class policy;
6. purpose compatibility;
7. cost/resource bounds;
8. applicable approval state;
9. credential-surrogate validity;
10. expiry/replay state.

A public-only task may qualify for a less burdensome policy. A task that has observed private or authority-bearing data may require a narrower destination, a separately reviewed trusted transform, a new approval, or denial.

The broker intersects flow policy with existing destination/action authority. It never turns a prohibited destination into an allowed one.

---

## 10. No automatic declassification in the initial programme

The first flow-sensitive implementation does not attempt general semantic declassification.

Summarization, paraphrase, redaction, translation, aggregation, embedding generation, encryption, image transformation, and structured extraction are not declassification merely because a model performed them.

A future trusted transform may create a derived `FlowContext` only after its exact transform, inputs, output contract, leakage assumptions, verifier profile, and authorization are separately reviewed.

Until then, derived output inherits the relevant restrictions of its inputs.

---

## 11. Recovery-authority isolation

Connectors exposing communications, files, browsers, or identity stores distinguish ordinary content from authority-bearing recovery/authentication material.

The initial policy default-denies delivery to cognitive runtimes of OTPs, password-reset links, magic-login links, recovery codes, private keys, session export material, and device-enrollment secrets.

A future purpose-specific workflow may use such material through a trusted broker without revealing it to the runtime, but that requires an independent gate.

> **Access to domain A must not silently create authentication or recovery authority over domain B.**

---

## 12. Browser boundary

Browser automation is later-phase work. The target is a brokered browser surface rather than unrestricted browser internals.

Future candidate restrictions include:

- bounded accessibility/semantic observation rather than unrestricted debugging interfaces;
- no arbitrary page-context JavaScript execution solely because browser control is granted;
- no exposure of inserted credentials to the agent;
- explicit human-control transfer for sensitive authentication;
- downloaded-file classification feeding `FlowContext`;
- form submission as an external effect with exact destination/data bindings;
- prompt-injection and cross-origin confused-deputy tests.

No browser capability is authorized by this Stage 5B design.

---

## 13. Consequence-scoped transactional credentials

For future payments or similar consequential integrations, AXIOM should prefer narrow transaction credentials over reusable account-level credentials.

A transaction credential may bind counterparty, maximum value and currency, exact purpose, finite use count, validity window, provider/instrument, and prepared-effect digest.

The same pattern may later apply to document signing, service enrollment, resource purchase, device control, or other real-world authority.

This is a compatibility requirement only; it does not authorize payment support.

---

## 14. Relationship to the existing external-effect path

The evidence-first ordering remains controlling.

```text
intent
 -> resolved target + policy
 -> information-flow/data-class evaluation
 -> trusted confirmation / independent approval where required
 -> atomic approval consumption + exact prepared effect
 -> credential-surrogate redemption at trusted boundary
 -> egress/operator invocation
 -> terminal evidence
```

Information-flow evaluation is an additional deny condition, not a shortcut around effect preparation. Existing burn-on-uncertainty and no-false-rollback semantics remain applicable.

---

## 15. Relationship to Runtime & Connector Fabric

This programme creates no second catalog, adapter registry, runtime identity, task model, or delegation system.

It extends Runtime & Connector Fabric compatibility requirements so future entries/adapters can declare and enforce:

- data classes read;
- authority-bearing secret exposure risk;
- credential strategy (`none`, brokered surrogate, or explicitly unsupported);
- exact network destinations;
- egress-broker requirements;
- flow-propagation support;
- trusted-transform support if later approved;
- recovery/authentication-material handling;
- browser-control profile where applicable.

Internal worker spawning remains distinct from AXIOM delegation. Flow restrictions propagate across worker/sub-agent lineage even when the child has no independent AXIOM authority.

---

## 16. Relationship to Sovereign Host and Rust trust-core migration

The sovereign host is the long-horizon place to enforce process/filesystem/network aspects that application code cannot robustly police.

The Rust trust-core migration remains independently staged. This design grants no permission to move authorization or flow semantics into Rust merely because Rust is the intended long-term trust-core language.

```text
language-neutral contracts/vectors
        -> Node reference semantics
        -> Rust pure verifier/evaluator candidate
        -> differential conformance
        -> host enforcement candidate
        -> independently promoted runtime use
```

No stage inherits production authority from a previous stage.

---

## 17. Evidence and privacy receipts

A future protected external action should emit a privacy-minimized flow receipt proving policy-relevant facts without storing the private payload.

Candidate fields:

```text
flow_context_digest
principal/runtime binding
data-class summary
authority-bearing-secret class/presence summary
purpose
destination/provider
action
policy_profile_digest
prepared_effect_digest
credential_surrogate_digest
approval reference where applicable
decision allow/deny
reason codes
timestamp
```

Receipts must not include raw passwords, tokens, OTPs, private message content, full prompts, arbitrary user files, or other secret payloads merely to prove the decision.

---

## 18. Threat classes introduced or sharpened

The implementation threat model must cover at least:

- prompt-injection-driven data exfiltration;
- allowed-destination exfiltration;
- credential theft from runtime memory/logs/errors;
- surrogate replay or rebinding;
- confused-deputy credential redemption;
- agent-authored fake approval ceremony;
- approval-field substitution after human review;
- stale flow-context reuse;
- label dropping or least-restrictive-parent selection;
- uninstrumented child/subprocess escape;
- covert communication through shared files/caches/logs/receipts;
- declassification laundering through summarization/redaction/encryption;
- OTP/reset/magic-link extraction;
- browser debugging/page-context privilege escalation;
- cross-origin form/data exfiltration;
- runtime update changing declared flow behavior;
- destination redirect/rebinding after authorization;
- DNS/transport substitution at the broker boundary;
- receipt/log correlation leaks;
- host-observer bypass;
- resource exhaustion through high-cardinality flow lineage;
- denial-of-service by permanent restriction accumulation;
- rollback to a version lacking required flow enforcement.

---

## 19. Resource and performance boundaries

Flow tracking itself is bounded. No runtime may create unbounded flow labels, source commitments, lineage depth, process-tree observers, filesystem watch state, network decision state, receipt cardinality, policy recomputation, or per-byte provenance.

The implementation tracks policy-relevant classes and digests, not full semantic lineage of every byte.

Unknown or overflowed state fails closed for protected egress rather than silently truncating to a less restrictive context.

---

## 20. Failure semantics

| Condition | Required result |
|---|---|
| missing FlowContext for protected egress | deny |
| malformed/stale flow digest | deny |
| unknown data class | deny or explicitly stricter handling |
| authority-bearing secret observed | deny ordinary runtime disclosure/egress |
| credential broker unavailable | deny credential-requiring effect |
| surrogate expired/consumed/rebound | deny |
| approval challenge digest mismatch | deny and regenerate trusted challenge |
| agent rationale conflicts with trusted challenge | trusted challenge controls; conflict remains visible |
| child process cannot be observed under required profile | deny protected effect or use an independently approved stricter isolation profile |
| host enforcement unavailable | do not claim host-enforced flow control |
| policy cannot represent required restriction | deny |
| uncertain external outcome | existing uncertainty/burn semantics apply |

---

## 21. Rollback and recovery

Software rollback must not silently remove a protection required by current policy. A rollback candidate lacking required flow/credential-broker semantics is ineligible for workloads whose policy requires them.

Credential-broker recovery preserves credential confidentiality, surrogate replay protection, rotation/revocation state, and non-reissue of consumed one-use surrogates.

Flow receipts and authority evidence remain append-only according to existing evidence rules; rollback does not rewrite historical decisions.

---

## 22. Migration contract

Implementation is incremental and independently gated.

### F0 — inert contracts and adversarial vectors

Define language-neutral draft contracts for `FlowContext`, credential-surrogate semantics, trusted approval challenge, and flow receipt. Synthetic fixtures only. No credential access, process observation, egress, external runtime, browser, or capability promotion.

### F1 — deterministic user-space flow evaluator

Pure evaluation of synthetic contexts against exact action/destination/purpose/data policies. No live process instrumentation or external effects.

### F2 — brokered no-secret connector laboratory

Use a disposable/synthetic connector requiring no real credential or public network. Prove broker/surrogate semantics and flow decisions without exposing a credential.

### F3 — first real credential-surrogate connector candidate

One low-risk least-privilege connector with a separately provisioned credential held only by a trusted broker. It remains non-production until independent security review and exact egress evidence pass.

### F4 — trusted approval-channel integration

Axiom One or another approved client renders authority-owned challenges from exact committed state. Agent text remains non-authoritative annotation.

### F5 — host-assisted information-flow candidate

Add Linux host/process/file/socket observation only after a separate design review and bypass/performance evidence. No cross-platform or kernel-enforced claim beyond tested platforms.

### F6 — browser broker laboratory

Restricted browser observation/control, credential invisibility, authority-bearing-secret filtering, form-effect bindings, and prompt-injection tests. No general browser-autonomy claim.

### F7 — agent-to-agent flow propagation

Carry data restrictions and authority-neutral lineage across internal workers and future independently authorized remote handoffs without treating communication as pooled authority.

### F8 — consequence-scoped transactional credentials

Only after domain-specific legal/security/payment or equivalent review. No approval of F0-F7 authorizes F8.

Approval of one phase does not automatically authorize the next.

---

## 23. Mandatory acceptance tests before any implementation promotion

Future tests must prove at minimum:

1. runtime cannot obtain the real credential from a surrogate;
2. surrogate cannot be redeemed for a different action, destination, provider, principal, purpose, value ceiling, or prepared effect;
3. consumed/expired surrogate replay is denied;
4. runtime logs/errors/receipts do not expose real credentials;
5. reading private data makes an otherwise public-only egress policy ineligible;
6. combining public and private inputs cannot produce a public flow context;
7. missing/unknown flow state fails closed;
8. child/sub-agent lineage cannot shed inherited restrictions;
9. summarization, redaction, translation, encryption, or embedding cannot self-declassify data;
10. agent-authored text cannot alter the trusted approval challenge;
11. approval is invalid after action/data/destination/cost/request digest changes;
12. approval cannot be consumed twice under concurrency;
13. ordinary inbox/content access does not reveal OTP/reset/magic-link material;
14. cross-domain recovery material cannot be treated as ordinary content;
15. an allowed destination cannot bypass data-class restrictions;
16. redirect/DNS/target substitution cannot widen destination authority;
17. broker failure cannot fall back to direct runtime network/credential access;
18. flow receipts prove policy inputs/decision without raw protected content;
19. resource ceilings bound flow lineage/state;
20. rollback to a protection-weaker build is rejected when current policy requires stronger enforcement;
21. runtime/model replacement does not reset restrictions for an active task lineage;
22. communication or sub-agent coordination does not create additional authority;
23. host-enforcement absence cannot be reported as host-enforced success;
24. every promoted claim is bound to exact implementation/test evidence.

---

## 24. Initial implementation boundary after written-spec approval

The first permitted implementation proposal is **F0/F1 only**.

Expected changed-file envelope remains documentation/contracts/tests plus pure evaluator code. It must not include:

- `mesh/config/capabilities.json` promotion;
- real provider credentials;
- external runtime activation;
- live egress;
- browser automation;
- privileged host hooks;
- eBPF/LSM attachment;
- payment or recovery actions;
- autonomous delegation;
- production deployment changes.

If F0/F1 implementation requires any of those, STOP and reopen the Stage 5B gate.

---

## 25. Stage 5B approval state

The owner explicitly approved this written Stage 5B specification on 2026-09-10.

F0/F1 implementation planning is authorized. The implementation plan is `docs/superpowers/plans/2026-09-10-agent-containment-information-flow-f0-f1.md` and remains constrained to inert contracts, synthetic/adversarial vectors, pure flow-context composition, deterministic evaluation, and documentation/evidence changes. F2 and later phases remain independently gated.

No approval in this document promotes a capability, activates an external runtime, releases a credential, enables live egress, authorizes browser automation, adds privileged host enforcement, or changes production authority.

> **The agent may become arbitrarily capable. Its authority and disclosure rights remain separately bounded, explicit, evidence-backed, and revocable.**