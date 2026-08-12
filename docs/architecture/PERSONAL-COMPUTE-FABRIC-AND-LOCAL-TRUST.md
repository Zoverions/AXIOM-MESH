# Personal Compute Fabric and Local Trust Plane

**Status:** normative architecture and phased development specification; no
runtime implementation or production-promotion claim

**Specification version:** `1.0.0-draft.1`

**Created:** 2026-08-11

**Applies to:** future AXIOM One, wearable endpoints, personal and managed
compute, agent-runtime capsules, identity presentation, local authorization,
payment mandates, and provider adapters

## Purpose and status

This specification defines how a person may use a pendant, glasses, headphones,
phone, personal computer, managed node, or cloud model as interchangeable parts
of one AXIOM experience without transferring authority to a model, device,
provider, or platform operator.

It establishes two related systems:

1. a **personal compute fabric** that selects an allowed agent runtime, model,
   and compute location for each bounded request; and
2. a **Local Trust Plane** that deterministically verifies credentials,
   evaluates policy, obtains user confirmation, reserves local budgets, and
   signs exact one-use authorization mandates.

The specification is deliberately contract-first. The five JSON Schemas linked
under [Versioned contract set](#versioned-contract-set) are design inputs for
future implementations. The current runtime loads only the separately byte-
pinned Agent Runtime Adapter contract; it does not load the other four drafts.
No external identity or payment adapter is implemented by them, and their
presence does not change the machine-readable capability registry.

The current AXIOM One preview remains loopback-only. It MUST NOT be exposed to a
wearable, phone, LAN, remote node, identity issuer, payment processor, or public
service merely because this architecture has been specified.

## Architecture decisions

The first implementation SHALL preserve these decisions:

1. **The wearable is a constrained interaction endpoint.** It may capture
   audio, indicate recording, request an action, and provide a physical user-
   presence signal. It is not the root identity wallet, payment vault, policy
   authority, or durable personal memory store.
2. **The phone is the initial companion and network relay.** Direct cellular
   wearable operation is deferred because modem power, carrier certification,
   custody, and recovery create a materially larger product and safety scope.
3. **Personal continuity is portable data, not one permanent base model.** A
   Personal Agent Pack binds encrypted memory, preferences, policies, runtime
   choices, evaluation evidence, and optional model adapters without assuming
   one provider or weight format.
4. **Agent orchestration is replaceable and untrusted.** Deterministic
   workflows, single-agent loops, planner-executor systems, specialist teams,
   and critic loops are separately versioned Agent Runtime Capsules. A capsule
   may propose work; it cannot approve work or mint authority.
5. **Compute placement follows policy before optimization.** Privacy, consent,
   jurisdiction, destination, capability, and budget are hard filters. Quality,
   latency, reliability, cost, and energy rank only the eligible choices.
6. **The Local Trust Plane contains no generative decision-maker.** Identity,
   authorization, budget, mandate, replay, and settlement-state decisions use
   canonical structured inputs, deterministic rules, and named cryptographic
   verifiers.
7. **Verification, authorization, external authorization, and settlement are
   different states.** Local approval never means that an issuer validated an
   identity, a bank approved a charge, or final settlement occurred.
8. **The kernel authority path remains non-bypassable.** Every privileged or
   externally visible effect continues through Gateway, Hypervisor, Sandbox,
   and Grid.
9. **Local ownership is optional, not punitive.** A user may begin with the
   wearable, companion, and managed compute, then add a personal node or
   user-supplied provider without losing history or being routed through a
   degraded commercial tier.
10. **The business model sells dependable service, not identity data or secret
    model substitution.** Routing, provider, data scope, cost, retention,
    fallback, and result status remain visible.

## Non-bypassable architecture

```text
wearable / glasses / headphones
              |
       BLE control or local Wi-Fi
              |
       companion phone and AXIOM One
              |
       Personal Agent Pack
              |
       Agent Runtime Capsule
              |
        proposed bounded intent
              v
Gateway -> Hypervisor -> Sandbox -> Grid
   |          |             |        |
 ingress   plan, policy   one grant  state, accounting,
 and auth  and approval   and adapter evidence and receipts
                            |
                   compute or trust adapter
                    /       |        \
                phone   home node   managed node/API
```

The model and runtime capsule sit outside the trusted kernel. Model output is
data. A capsule can request an inference or tool action, but it cannot turn its
own output into a grant, payment, identity assertion, public communication, or
device command.

The Local Trust Plane may be physically co-located with AXIOM One or the
personal node, but its logical responsibilities remain separate:

```text
request -> canonicalize -> verify -> decide -> confirm -> mandate
                                                        |
                                             Gateway authority path
                                                        |
                                         adapter -> external outcome
                                                        |
                                              reconcile -> receipt
```

## Terminology

- **Personal Agent Pack** — an owner-controlled exportable manifest and set of
  encrypted artifacts describing continuity across models and infrastructure.
- **Agent Runtime Capsule** — a signed, immutable orchestration definition with
  exact implementation, permissions, budgets, stop conditions, and evidence
  obligations.
- **Endpoint** — a constrained user-facing device such as a pendant, glasses,
  headphones, or button.
- **Companion** — the phone-class device that handles pairing, presentation,
  accessibility, network relay, and secure-platform authentication.
- **Compute node** — an admitted phone, personal computer, managed node, or
  provider adapter able to offer named inference capabilities.
- **Compute placement** — selection of one eligible runtime, model, and node for
  a bounded job. Placement is not execution authority.
- **Local Trust Plane** — deterministic credential verification, policy
  decision, confirmation, budget reservation, mandate signing, and receipt
  verification components.
- **Verification result** — a structured account of which exact proofs were
  checked, with trust anchors, freshness, result, and explicit non-claims.
- **Authorization mandate** — an expiring, replay-resistant, one-use signature
  over exact subject, requester, action, resource, transaction, policy, and
  confirmation digests.
- **External authorization** — an issuer, payment processor, bank, relying
  party, or other named authority accepting or declining the mandate.
- **Settlement** — completion of an external value transfer according to its
  named rail. It is not implied by local accounting or authorization.

## Personal Agent Pack

The Personal Agent Pack is the durable consumer asset. It SHALL be exportable
without requiring a continuing AXIOM subscription and SHALL NOT require one
specific base model, hosting provider, social identity, or settlement account.

The pack may reference:

- encrypted owner memory and provenance bundles;
- communication, accessibility, and interaction preferences;
- owner policy, consent, privacy, budget, and routing preferences;
- allowed and denied Agent Runtime Capsule identifiers;
- allowed, denied, or pinned provider and model profiles;
- optional LoRA or equivalent adapter artifacts where their licences permit;
- voice configuration without treating voice as a sole high-risk authenticator;
- evaluation baselines, correction history, and known limitations;
- deletion, recovery, migration, and portability instructions; and
- exact licences and artifact digests.

The pack SHALL NOT contain plaintext provider keys, raw payment credentials,
private device keys, or a claim that model weights contain the user's verified
identity. Secret handles may reference separately protected local custody.

Personal memory SHALL remain separate from base-model weights by default. A
training or adaptation action requires its own visible source scope, purpose,
provider, destination, retention, licence, deletion, and evaluation contract.

## Agent Runtime Capsules

Agent Runtime Capsules make the coordination layer interchangeable. The initial
contract recognizes these orchestration patterns:

- `deterministic-workflow`;
- `single-agent`;
- `planner-executor`;
- `orchestrator-worker`;
- `specialist-team`; and
- `critic-loop`.

A capsule manifest SHALL bind:

- implementation and SBOM digests;
- accepted input and produced output schemas;
- required model modalities and structured-output behavior;
- requested tools, data scopes, destinations, and provider capabilities;
- maximum steps, model calls, input/output units, cost, wall time, and
  concurrency;
- cancellation, checkpoint, stop, escalation, and kill-window behavior;
- fallback choices and whether fallback may cross an egress boundary;
- evaluation and receipt obligations; and
- uninstall, rollback, and state-export behavior.

Installing, listing, selecting, or measuring a capsule grants no execution
authority. Capsule state is not authoritative policy. A capsule cannot edit its
own manifest, budget, allowed provider set, evaluation result, or promotion
status while running.

The default MVP uses one bounded single-agent capsule. Multi-agent coordination
is introduced only after a single agent fails a recorded evaluation that the
more complex capsule can improve without unacceptable cost, latency, privacy,
or failure behavior.

## Personal compute fabric

### Consumer routing modes

AXIOM One SHALL present understandable policy presets while retaining an expert
view that can pin exact capsules, models, and compute nodes:

| Mode | Hard behavior |
|---|---|
| Private | Use only owner-approved local devices; fail closed when none qualify |
| Balanced | Prefer local; permit an explicitly approved managed destination only for eligible data |
| Best | Select the highest evaluated eligible result within a user-set budget and deadline |
| Budget | Select the lowest expected cost that meets the quality, privacy, and latency floor |

No routing mode may silently relax consent, purpose, retention, residency,
identity, safety, or approval requirements.

### Placement sequence

For each inference or orchestration step, the placement engine SHALL:

1. normalize the task class and required modalities;
2. load the exact owner policy, consent, privacy, destination, jurisdiction,
   retention, deadline, and budget constraints;
3. exclude expired, quarantined, incompatible, unhealthy, unmeasured, stale, or
   insufficiently secured candidates;
4. exclude any candidate whose model or runtime licence forbids the use;
5. rank only eligible candidates using task-specific evidence for usefulness,
   latency, reliability, monetary cost, and energy;
6. record the chosen and rejected candidate identifiers without storing raw
   private content in operational telemetry;
7. obtain a normal AXIOM plan and grant before execution; and
8. record the actual provider, model, runtime, node, cost, latency, fallback,
   cancellation, and outcome.

Placement SHALL fail closed when required observations are absent or stale. A
declared resource or benchmark is not measured availability. Existing admitted-
node reservations remain separate from future remote dispatch and inference.

### Evaluation ledger

The owner-local evaluation ledger SHOULD record, by task class and exact
capsule/model/node version:

- completion, denial, timeout, cancellation, retry, and uncertain outcomes;
- explicit user rating where supplied;
- deterministic task checks and source-grounded correctness checks;
- user correction, abandonment, and recovery rate;
- tool-call and structured-output validity;
- latency percentiles and time to first useful response;
- input/output units, external fees, and energy estimates;
- data egress class, destination, retention class, and redaction result; and
- fallback reason and whether the user accepted it.

Raw prompts, audio, credentials, identity attributes, payment data, and memory
objects SHALL NOT enter shared telemetry by default. Aggregate learning is
separate, opt-in, purpose-bound, revocable, and unable to alter authority.
Routing experiments require visible enrollment, an allowed candidate set, a
cost ceiling, and an exit path. User dissatisfaction, engagement, or commercial
margin may not silently expand data disclosure.

## Device and hardware profiles

### Endpoint rules

Every endpoint SHALL have a unique revocable device identity, authenticated
pairing, bounded capabilities, signed firmware identity, replay defense,
explicit recording state, and a recovery/removal path. An endpoint SHALL NOT
receive ambient access to the Grid, provider credentials, payment credentials,
or unrestricted local-network discovery.

An audio wearable SHALL provide a physical microphone-disconnect control or an
equally strong independently testable electrical privacy control. Recording
indication must be visible or otherwise perceivable by affected users and may
not be suppressed by the model or runtime capsule.

Voice matching is a convenience signal, not sole authorization for identity,
payment, public communication, deletion, credential release, or device control.

### Non-normative reference profiles

These profiles guide prototypes and procurement; capability and evidence, not
brand, determine conformance.

| Profile | Reference resources | Intended work |
|---|---|---|
| Link development endpoint | Secure-boot-capable Wi-Fi/BLE MCU, at least 8 MiB external RAM and 16 MiB flash, two digital microphones, button, haptic, recording indicator, physical mute, rechargeable battery | Wake word, voice activity, audio codec, pairing, presence; no general LLM |
| Companion phone | Supported secure keystore/passkey platform, BLE, modern Wi-Fi, at least 8 GiB memory, accessible display and audio | Pairing, authentication, local speech where available, plan/approval UI, network relay |
| Starter personal node | 32-64 GiB system memory, 12-16 GiB accelerator memory, 2 TiB encrypted NVMe, 2.5 GbE | Speech, embeddings, and smaller quantized language models |
| Personal node | 64-128 GiB system memory plus 24-32 GiB accelerator memory, or 64-128 GiB unified memory; 4 TiB encrypted NVMe; 2.5/5/10 GbE | Primary private inference and bounded personal workflows |
| Memory-heavy node | At least 96-128 GiB accelerator-accessible memory, 4-8 TiB encrypted NVMe, 10 GbE | Larger quantized models and controlled multi-model evaluation |

The development endpoint may begin with an ESP32-S3-class board. Product
hardware requires a production audio/radio module, regional certification,
battery and charging review, acoustic and thermal evidence, manufacturing test,
secure update and rollback, warranty, and end-of-life support. A development
board compilation or bench demonstration is not hardware-safety evidence.

The first wearable requires the companion phone for mobile connectivity. Direct
Wi-Fi to an owner node may be added after authenticated discovery and session
security exist. Direct cellular, camera capture, projection displays, biometric
identification, and payment credentials are deferred from the first hardware
revision.

## Local Trust Plane

### Responsibilities

The Local Trust Plane consists of replaceable deterministic components:

| Component | Responsibility | Explicit limit |
|---|---|---|
| Authenticator broker | Obtain passkey, hardware-key, PIN, biometric-mediated, or device-presence proof | Does not establish real-world identity by itself |
| Credential verifier | Verify exact credential format, issuer chain, holder binding, scope, expiry, status, and disclosure | Proves only the checked issuer claims under the named trust set |
| Policy decision point | Evaluate subject, requester, action, resource, context, consent, risk, and budget | Cannot execute or mint a kernel grant |
| Confirmation presenter | Bind the human-readable terms the user actually confirmed | Voice output alone is not proof of comprehension or consent |
| Budget and accounting reserve | Reserve integer units in balanced owner-local journals | Is not proof of external funds or settlement |
| Mandate signer | Sign one exact expiring request digest with replay protection | Cannot widen or reuse a mandate |
| Receipt verifier | Match external response, adapter, mandate, amount, status, and evidence | Cannot reinterpret missing or uncertain settlement as success |

The Hypervisor remains the authoritative AXIOM policy and grant component. A
standard authorization decision API may be supported at the Local Trust Plane
adapter boundary, but a third-party policy decision is an input to the
Hypervisor and never a bypass.

### Decision states

The Local Trust Plane SHALL use stable, non-overlapping states:

- `denied` — a named local rule or verifier rejected the request;
- `locally_authorized` — the exact local mandate was approved and signed;
- `pending_external_authorization` — local authorization succeeded and a named
  external authority has not returned a final response;
- `externally_authorized` — the named external authority accepted the mandate;
- `declined` — the external authority rejected the mandate;
- `uncertain` — timeout, interruption, stale status, or ambiguous response
  prevents a safe conclusion;
- `settled` — the named rail supplied a verified final settlement receipt; and
- `reversed` — a previously authorized or settled operation was reversed under
  a recorded external process.

Only the states applicable to an action are used. An access decision may end at
`locally_authorized`. A payment MUST NOT be presented as paid at that state.

### Immediate authorization sequence

1. Accept a versioned canonical request containing requester, subject, action,
   resource, requested claims or transaction details, purpose, nonce, creation,
   and expiry.
2. Authenticate the requester and reject replay, clock, audience, origin, or
   body-binding failures.
3. Verify only the credential claims required by policy, including holder
   binding and status freshness where applicable.
4. Evaluate deny-dominant owner, device, organizational, jurisdictional,
   adapter, and global policy.
5. Present exact terms, including data disclosure, payee, amount and currency,
   fees, destination, retention, reversibility, and external dependencies.
6. Obtain the required user-presence or user-verification proof. Higher-risk
   transactions require a separately protected authenticator or approver.
7. Reserve the bounded local budget where relevant.
8. Sign a short-lived one-use mandate over every exact field and applicable
   policy, credential, confirmation, and request digest.
9. Submit the resulting AXIOM intent through the Gateway authority path.
10. Match every external response to the mandate, retain uncertain outcomes,
    reconcile later state, and append readable evidence.

The local path SHOULD complete without network access when every required trust
anchor, credential status, policy, authenticator, and resource observation is
available and fresh. A cached item has an issuer-defined and owner-policy-
bounded freshness limit. Missing or stale status is `uncertain` or `denied`, not
silently valid.

### Identity and selective disclosure

Identity proofing, authentication, credential presentation, and authorization
remain separate. The first identity laboratory SHALL support synthetic or
test-authority credentials only and SHALL select one exact interoperable
profile from:

- W3C Verifiable Credentials Data Model 2.0;
- ISO/IEC 18013-5 mobile documents through an approved profile; or
- SD-JWT VC through an approved profile.

OpenID for Verifiable Presentations 1.0 is the preferred presentation protocol
candidate because it supports same-device and cross-device presentation and
multiple credential formats. WebAuthn/passkeys are the preferred user-
verification candidate for browser and companion flows. NIST SP 800-63-4
assurance concepts may guide risk classification, but referencing them does not
create certification or prove a deployed assurance level.

The verifier SHALL disclose the minimum claim sufficient for the action. A
predicate such as age-over-threshold, residency region, membership, licence
class, or completed customer-due-diligence attestation is preferred over a full
identity document when the relying party accepts it. The result identifies the
issuer, trust anchor, credential/profile version, disclosed claim set, holder-
binding method, status source and freshness, verifier implementation digest,
and non-claims.

A valid signature proves neither that an issuer's claim is true nor that the
presenter is the rightful holder unless the selected profile and ceremony bind
them. Facial comparison or voice matching alone is not identity proofing.

### Payment authorization and settlement

The initial payment work is a test-value-only adapter laboratory. It SHALL use
processor tokens or another reviewed payment credential boundary; raw primary
account numbers and equivalent reusable credentials do not enter the wearable,
browser storage, Agent Pack, Grid evidence, logs, prompts, or model context.

A payment request SHALL bind at least:

- payer and payee references;
- integer amount and ISO currency;
- purpose and merchant/requester identity;
- maximum disclosed fee and any tax or gratuity behavior;
- credential or processor-token handle without secret value;
- local budget and external adapter identifiers;
- expiry, nonce, idempotency key, and cancellation behavior;
- refund, reversal, dispute, and uncertain-outcome instructions; and
- the exact terms shown to and confirmed by the user.

Local accounting may reserve, release, and reconcile units. It cannot create
funds, prevent double-spend on an external rail, guarantee merchant acceptance,
or claim settlement. Offline value requires a separately specified issuer-
signed limit, double-spend and merchant-risk model, expiry, reconciliation,
dispute, insolvency, loss, recovery, and jurisdictional review; it is not part
of the MVP.

Before any real-value pilot, the exact payment adapter, processor agreement,
merchant-of-record role, custody model, PCI scope, consumer disclosures,
refunds, chargebacks, sanctions/AML responsibilities, taxation, privacy,
support, incident response, and jurisdictional licences require qualified legal
and payments review.

## Versioned contract set

This draft defines a five-contract documentation set:

- [Personal Agent Pack v1](contracts/personal-agent-pack.v1.schema.json);
- [Agent Runtime Capsule v1](contracts/agent-runtime-capsule.v1.schema.json);
- [Agent Runtime Adapter v1](contracts/agent-runtime-adapter.v1.schema.json);
- [Compute Node Profile v1](contracts/compute-node-profile.v1.schema.json); and
- [Local Trust Envelope v1](contracts/local-trust-envelope.v1.schema.json).

The schemas are normative only for this architecture draft. The separately
byte-pinned Agent Runtime Adapter contract has its own synthetic verifier; the
other four do not have runtime validators. None is a Gateway route, supported
SDK contract, capability manifest, or proof of external compatibility.

Contract changes follow these rules:

- an additive optional field may advance the draft revision without changing
  the schema identifier;
- a newly required field, changed meaning, weakened bound, removed field, or
  incompatible enumeration requires a new major schema identifier;
- every implementation pins the exact schema, implementation digest, and
  compatibility range;
- unknown security, authority, payment, identity, data, or settlement fields
  fail closed;
- adapters never infer missing authority from a newer or older contract; and
- a migration includes deterministic validation, dry-run output, rollback, and
  retained provenance.

The future authoritative Gateway contracts remain in AXIOM-MESH. Personal
applications and capsule implementations should consume released versioned
artifacts rather than Git submodules or mutable branches.

## Privacy, security, and recovery

The threat model for this system SHALL include at least:

- lost, stolen, cloned, resold, and maliciously repaired wearables;
- microphone bypass, misleading recording indication, and covert capture;
- pairing downgrade, relay, replay, origin confusion, and session fixation;
- companion compromise, malicious accessibility overlays, and confirmation
  substitution;
- model prompt injection, tool-result poisoning, capsule self-modification, and
  routing manipulation;
- model or provider substitution, fabricated capability claims, and stale
  performance observations;
- provider credential theft, unexpected retention, and cross-user leakage;
- credential correlation, over-disclosure, issuer impersonation, status
  suppression, and stale revocation data;
- forged merchant identity, amount/payee substitution, duplicated mandates,
  uncertain payment outcomes, reconciliation drift, refunds, and disputes;
- local-node compromise, rollback to vulnerable software, and recovery-key
  theft; and
- commercial incentives that bias routing, telemetry, or identity disclosure.

Recovery SHALL distinguish endpoint replacement, authenticator recovery,
Personal Agent Pack recovery, identity credential reissuance, payment credential
replacement, local-node restore, and account/service recovery. Loss of one
endpoint must be revocable without deleting the person's underlying identity
or memory. Recovery cannot silently bypass the assurance required for a new
authenticator or payment credential.

## Service and adoption model

The commercial design follows these fairness constraints:

- the protocol, local verifier, core export, and self-host path remain usable
  without a managed-compute subscription;
- user-supplied models, providers, and hardware receive the same authority and
  evidence contract as managed choices;
- managed routing discloses the actual provider, model, destination, retention,
  units, external charge, AXIOM fee, and fallback;
- no advertising auction, affiliate margin, engagement target, or hidden
  subsidy influences a trust or routing decision;
- identity data and verification events are not sold;
- users can set hard per-request and monthly spend limits; and
- cancellation, export, deletion, device revocation, and migration remain
  reachable from the primary experience.

Candidate commercial tiers may include an open community/self-host option,
device and encrypted-relay support, a managed personal-compute allowance,
customer-owned managed-node support, and transparent usage top-ups. Pricing is
not specified until measured workload cost, support burden, hardware returns,
fraud, processor fees, taxes, and target gross margin are recorded. The product
sells trustworthy continuity, operations, and support rather than transferable
provider keys or opaque token bundles.

## Repository and component boundaries

- **AXIOM-MESH** owns Gateway, Hypervisor, Sandbox, Grid, the authoritative
  Gateway contract, Local Trust kernel invariants, and end-to-end negative
  tests.
- **AXIOM One** owns the phone/browser experience, device enrollment, plan and
  confirmation presentation, Personal Agent Pack UX, routing controls, and
  accessibility evidence.
- **AXIOM Capsules** owns separately packaged agent runtimes, model/provider
  adapters, identity profiles, and payment adapters under conformance tests.
- **AXIOM Verify** owns independent local/static verification of receipts,
  credentials, mandates, exports, and explicit non-claims.
- **AXIOM Deployments** owns private environment manifests, monitoring,
  backups, managed-node lifecycle, and external custody integrations without
  storing repository secrets.

The Local Trust Plane is an architectural boundary, not permission to create a
new privileged service that bypasses the kernel. Keep its deterministic policy
and grant invariants atomic with AXIOM-MESH until at least three independent
implementations or multiple generated SDK languages justify a separate
contracts repository.

## Phased MVP plan

### MVP-0 — contract and threat-model laboratory

Deliver this architecture, the five draft schemas, example fixtures, validation
rules, threat inventory, privacy data-flow map, and an explicit claim matrix.

Exit evidence:

- all documentation and schemas pass repository verification and JSON parsing;
- reviewers can identify every authority boundary and non-claim;
- no capability status changes and no production credentials or external
  accounts are created.

### MVP-1 — phone-first personal runtime

Build one phone-size AXIOM One flow using a bounded single-agent capsule, one
local or user-supplied model adapter, and one managed model adapter. The user
selects Private, Balanced, Best, or Budget mode and sees actual routing and cost.

Exclude custom hardware, identity documents, payment credentials, background
autonomy, multi-agent teams, and consequential external effects.

Exit evidence:

- same request succeeds through two replaceable providers;
- privacy and budget filters prevent forbidden fallback;
- provider/model substitution, cancellation, timeout, and uncertain outcomes
  are visible and evidence-linked;
- Personal Agent Pack export/import preserves supported preferences and
  evaluation records without secrets.

### MVP-2 — wearable development endpoint

Prototype a push-to-talk pendant using a development radio/MCU board and the
companion phone relay. Implement authenticated pairing, unique device identity,
physical mute, recording indication, signed firmware identity, update/rollback,
revocation, loss handling, bounded audio buffering, and accessible confirmation
handoff to the phone.

Exclude camera, direct cellular, full-time recording, standalone payment,
biometric identity, and claims about final battery, RF, acoustic, electrical,
thermal, mechanical, or consumer-product safety.

Exit evidence:

- copied, revoked, stale, wrong-owner, downgraded, and replayed endpoint
  sessions fail closed;
- mute and recording indication receive independent bench verification;
- the endpoint cannot access Grid or provider secrets;
- measured latency, battery, packet loss, thermal behavior, and recovery are
  recorded as prototype evidence only.

### MVP-3 — owner-local compute node

Extend admitted-node metadata with a separately reviewed compute profile and
measured runtime observations. Add authenticated dispatch, cancellation,
resource enforcement, output provenance, and reconciliation for one local
inference runtime.

Exit evidence:

- the same capsule runs on managed and owner-local compute without authority
  drift;
- false resource, wrong model, wrong runtime, stale health, forged result,
  replay, cancellation loss, and node quarantine tests fail closed;
- local-only operation remains useful during managed-provider loss;
- no multi-host federation or consensus claim is made.

### MVP-4 — local identity verification laboratory

Implement WebAuthn user verification and one exact test credential profile with
synthetic or dedicated test-authority identities. Add selective disclosure,
holder binding, issuer trust, credential status/freshness, revocation, verifier
versioning, presentation consent, and readable verification receipts.

Exit evidence:

- forged issuer, wrong holder, excessive disclosure, expired, revoked, stale-
  status, replayed, wrong-audience, and correlation-risk fixtures are rejected
  or surfaced accurately;
- AXIOM Verify reproduces the result without trusting a hosted AXIOM service;
- the pilot makes no government-ID, KYC, age-assurance, regulatory, or legal-
  identity claim.

### MVP-5 — payment authorization simulation

Implement the Local Trust Envelope for synthetic value and a payment-provider
sandbox. Bind exact payee, amount, currency, fee ceiling, confirmation,
credential handle, local reserve, idempotency, external response, reconciliation,
refund, reversal, dispute, and uncertain outcome.

Exit evidence:

- amount/payee mutation, mandate reuse, duplicate delivery, timeout, late
  success, partial response, forged receipt, reserve drift, refund, and reversal
  tests preserve balanced accounting and truthful state;
- no raw reusable payment credential reaches AXIOM storage, logs, prompts, or
  wearable memory;
- all value is synthetic or provider-sandbox value and no production payment
  capability is claimed.

### MVP-6 — bounded invitation-only pilot

After earlier evidence is reviewed, pilot the wearable, companion, two compute
choices, Personal Agent Pack portability, and non-regulated Local Trust flows
with named consenting adults. Identity and payment components remain synthetic
unless separately promoted.

Exit evidence:

- activation, task completion, comprehension, accessibility, privacy, support,
  device loss/revocation, export, deletion, recovery, routing, cost, and hardware
  observations meet predeclared thresholds;
- an independent review covers the exact hardware, firmware, app, kernel,
  adapters, deployment, data flow, policies, and claims;
- every unresolved finding and non-claim remains visible.

## Promotion gates and non-claims

This specification does not establish:

- a supported wearable, phone application, personal node, or managed service;
- production AI inference or agent orchestration;
- secure remote dispatch or measured compute truth;
- completion of hardware, RF, battery, acoustic, accessibility, usability,
  manufacturing, repair, or consumer-safety validation;
- identity proofing, government-ID validation, KYC, age assurance, personhood,
  reputation truth, or regulatory identity assurance;
- secure biometric or voice-only authorization;
- production payment authorization, funds availability, merchant acceptance,
  custody, money transmission, PCI compliance, AML/sanctions compliance,
  consumer-credit compliance, or settlement;
- offline digital cash or double-spend resistance;
- operational zk verification;
- legal, financial, privacy, tax, accessibility, or jurisdictional compliance;
  or
- production promotion of any current or future AXIOM capability.

Promotion requires implementation, negative tests, executable evidence,
current registry status, deployment-specific security and recovery evidence,
human comprehension and accessibility testing, independent review, and the
applicable hardware, identity, payments, legal, custody, and domain approvals.

## Standards references

- [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/)
- [OpenID for Verifiable Presentations 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0-final.html)
- [W3C Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/)
- [OpenID AuthZEN Authorization API 1.0](https://openid.net/specs/authorization-api-1_0-final.html)
- [NIST SP 800-63-4 Digital Identity Guidelines](https://pages.nist.gov/800-63-4/)
- [Bluetooth LE Audio specifications](https://www.bluetooth.com/learn-about-bluetooth/feature-enhancements/le-audio/le-audio-specifications/)

These references identify candidate interoperability and assurance inputs.
Conformance, certification, legal acceptance, and deployment assurance require
their own exact profiles, test suites, qualified review, and evidence.
