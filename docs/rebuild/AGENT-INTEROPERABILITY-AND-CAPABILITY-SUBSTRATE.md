# Agent Interoperability and Capability Substrate

**Status:** approved candidate architecture for review; not an implemented capability claim

**Adopted for branch review:** 2026-08-09

**Refreshed:** 2026-09-16 — first-party agent knowledge, provenance, deterministic operation discovery, and semantic-routing boundaries integrated from current external patterns and current repository state.

**Applies to:** AXIOM-MESH machine clients, future agent principals, capsules, provider/tool adapters, remote execution, AXIOM Studio, AXIOM Verify, and external agent-framework interoperability

**Current-build boundary:** AXIOM-MESH `0.12.0-dev.3` does not currently claim a supported autonomous-agent runtime, MCP server/client, A2A endpoint, remote task execution, production agent-to-agent federation, production host-profile projection, or production machine-operation manifest. The machine-readable capability registry remains authoritative.

## Purpose

AXIOM-MESH should not become another general-purpose agent framework. Agent runtimes evolve quickly and already compete on model loops, memory, channel integrations, tool discovery, skills, coding workflows, and user experience. Reimplementing that layer would create churn and duplicate work without strengthening AXIOM's core advantage.

AXIOM's distinctive role should instead be the **trusted capability and communication substrate underneath agents**.

External agents, local agents, service agents, human interfaces, scheduled workers, and future embodied systems should be able to use the same governed capability fabric without receiving ambient authority merely because they can plan, reason, call a tool, load a skill, or speak a supported protocol.

The substrate should also be legible to agents. Where a software component has a supported way to be inspected, configured, updated, verified, or operated, AXIOM should expose that knowledge in machine-discoverable form instead of requiring agents to infer current behavior from stale general training data or reverse-engineer a human interface.

That self-description must preserve provenance and authority boundaries. Discovering guidance is not the same as trusting its issuer, and understanding an operation is not the same as being authorized to perform it.

The architectural rule is:

> **Agents may propose. AXIOM authorizes. Sandboxes execute. Grid records. Verify checks. Protocol compatibility never imports authority.**

A complementary agent-native rule is:

> **Software may teach agents how it is meant to be used; neither the lesson nor the tool grants permission to act.**

This creates a protocol-neutral trust membrane between rapidly changing agent ecosystems and slower-moving authority, security, evidence, and governance infrastructure.

## 1. Agent runtimes are clients, not authorities

An agent runtime may provide:

- model inference and reasoning loops;
- memory retrieval and summarization;
- skills or procedural knowledge;
- tool discovery;
- channel integrations;
- multi-agent planning and delegation;
- scheduling and background workflows;
- user-facing conversation surfaces.

None of those functions inherently authorizes an external effect.

A conforming AXIOM integration treats the runtime as one or more authenticated principals that must use the same mandatory path as any other caller:

```text
agent/runtime/client
  -> Gateway
  -> Hypervisor policy + authority evaluation
  -> explicit plan / approvals where required
  -> short-lived scoped grant
  -> Sandbox bounded execution
  -> Grid state + evidence
  -> machine-readable result / receipt
```

No plugin, skill file, prompt, model output, agent reputation score, remote Agent Card, MCP tool declaration, command manifest, executable discovery record, or framework-specific permission setting may bypass that path.

## 2. Protocol-neutral core, standard-compatible edges

AXIOM should avoid inventing a new transport when a standard protocol can carry the request safely. Protocols are edge adapters; AXIOM semantics remain the authority layer.

Initial compatibility targets should include:

### 2.1 MCP edge adapters

A future **MCP server adapter** may expose a policy-selected subset of AXIOM capabilities to compatible clients. Discovery exposes what may be requested, not what will be authorized for a particular principal.

A future **MCP client adapter** may let an AXIOM-governed workflow invoke external MCP tools. External tools remain untrusted effectors. Credentials, destinations, environment variables, filesystem access, cost, network access, and output handling remain explicitly bounded by AXIOM policy and capsule/adapter contracts.

The adapter must not translate `tools/list` into blanket permission. Every consequential tool invocation becomes an AXIOM intent.

### 2.2 A2A edge adapter

A future A2A-compatible adapter may support agent discovery, task exchange, asynchronous status, streaming, artifacts, and remote collaboration.

An Agent Card or equivalent descriptor is treated as a **claim about an agent**, not proof of identity, trust, competence, or authorization. Signed metadata may improve attribution but cannot grant local authority.

Remote tasks entering AXIOM become intents. Remote task outputs become typed artifacts/evidence with source identity, protocol context, integrity metadata, and declared assurance. Remote agents cannot self-assert local grants.

### 2.3 Native Gateway client

The existing versioned Gateway client remains the lowest-friction native machine interface for callers that do not need an external compatibility protocol. MCP and A2A adapters should project onto the same underlying capability semantics rather than create parallel authority systems.

### 2.4 First-party agent knowledge and deterministic tooling

Modern agent-native software increasingly ships machine-consumable operational knowledge and direct tooling rather than expecting a general model to reconstruct current product behavior from old documentation or click through human interfaces.

Two current external patterns are useful design evidence:

- Omarchy ships environment-specific agent guidance into multiple supported agent runtimes from an environment-owned source.
- Unity's official Codex plugin, announced 2026-09-16, ships 31 first-party skills written by the Unity teams that own the corresponding features and exposes Unity CLI workflows. Unity explicitly emphasizes project inspection, current APIs, and verification. Unity's current Codex integration is described by Unity as a skills package plus CLI rather than an MCP server attached to the running Editor; live Editor control exists in other Unity integrations. This separation is architecturally useful.

Sources:

- https://unity.com/blog/unity-plugin-codex
- https://docs.unity.com/en-us/ai/unity-plugin/about-unity-plugin
- https://discussions.unity.com/t/the-official-unity-plugin-for-codex/1736730
- https://discussions.unity.com/t/unity-cli-1-0-0-beta-10-is-rolling-out/1736729

AXIOM should adopt the pattern without collapsing it into authority. The target architecture has three distinct planes:

```text
KNOWLEDGE PLANE
  host/component profile
  first-party and other skills
  provenance + compatibility + currentness
        |
        v
OPERATION PLANE
  deterministic command/tool schemas
  inspect / plan / verify / apply descriptions
  exact structured inputs and outputs
        |
        v
AUTHORITY PLANE
  Gateway -> Hypervisor -> Sandbox -> Grid
  grants / consent / revocation / limits / evidence
```

A skill can explain an operation. A machine-readable operation manifest can describe how to call it. Neither can satisfy the authority predicate required for a consequential effect.

The initial implementation direction should prefer generated/static descriptive artifacts and fixture-only operation discovery before adding any live control surface. A future CLI, MCP tool, computer-use bridge, or other effectful adapter remains a separately reviewed integration.

## 3. AXIOM Invocation Envelope

Protocol messages should bind to a common semantic envelope. This envelope is not a replacement transport. It is the information AXIOM requires to authorize, execute, and evidence a machine-originated request regardless of whether it arrived through the native Gateway contract, MCP, A2A, a local adapter, or a future protocol.

Candidate fields include:

```text
schema_version
protocol_profile
caller_principal
runtime_instance_id
owner_or_delegator
 delegation_chain
intent_id
idempotency_key
causal_parent_ids
conversation_or_task_context
capability_id
capability_version_or_digest
purpose
input_schema_digest
data_classification
consent_scope
policy_digest
requested_assurance
required_approvals
grant_id
expires_at
nonce
resource_budget
network_egress_budget
cost_budget
time_budget
destination_scope
expected_output_schema
required_evidence_profile
result_digest
artifact_ids
evidence_receipt_ids
```

The exact schema requires normative design and adversarial testing before runtime promotion.

The candidate [Agent Runtime Adapter v1 contract](../architecture/AGENT-RUNTIME-ADAPTER-CONFORMANCE.md)
now freezes the external-runtime manifest boundary at semantic version `1.0.0`
and an exact schema digest. Its protected 28-case synthetic drill validates the
contract, signed-grant trust bootstrap, mapping and grant bounds, cancellation,
revocation, idempotency, uncertain outcomes, and receipt integrity. This is
pre-external-runtime verifier evidence and does not promote interoperability.

## 4. First-class machine principals

Agents should eventually be represented as first-class principals rather than disguised human users or generic API tokens.

An agent principal should support:

- an authenticated identity tied to a specific runtime, service, workload, or delegated role;
- explicit owner, sponsoring institution, Circle, or autonomous service relationship where applicable;
- scoped capability grants;
- purpose and destination restrictions;
- time, cost, compute, storage, and network budgets;
- expiration and revocation;
- attenuation-only delegation unless a separately authorized authority explicitly grants expansion;
- evidence of which principal proposed, approved, delegated, executed, and verified an action;
- independent device/runtime rotation without silently changing owner authority.

Agent identity must not become a universal reputation or moral score. Trust remains claim-, capability-, context-, and authority-specific.

## 5. Delegation without ambient autonomy

Agent-to-agent delegation is useful, but the safe primitive is not "agent A trusts agent B." The primitive is a bounded delegation record.

A delegation should eventually identify:

- delegator and delegate;
- capabilities permitted;
- actions or action families permitted;
- purpose;
- input/data scope;
- destinations;
- budget ceilings;
- maximum delegation depth;
- whether subdelegation is permitted;
- assurance floor;
- approval requirements;
- start, expiry, and revocation;
- evidence and receipt obligations.

Subdelegation must be equal to or narrower than the authority received. A downstream agent cannot increase scope by changing framework, protocol, prompt, model, or tool name.

## 6. Skills and capsules

The useful part of modern agent skill ecosystems is portability, first-party operational knowledge, and progressive disclosure, not their authority semantics.

AXIOM Studio should eventually be able to import or adapt common skill/package formats into an **inert capsule candidate**. AXIOM components should also be able to publish reviewed first-party operational skills that teach agents the supported way to inspect, configure, update, verify, and use that component.

An imported skill or capsule candidate should declare:

- source and upstream version;
- immutable content digest;
- instructions and entry points;
- required tools/capabilities;
- required files and filesystem modes;
- required environment variables and credentials;
- allowed network destinations;
- data classes consumed and produced;
- compute, time, storage, and cost expectations;
- output schema;
- known side effects;
- licensing and provenance;
- tests and conformance evidence.

Installation or import grants **zero authority**. Skill instructions are untrusted content unless and until a separate provenance process establishes a stronger descriptive origin claim; even a verified first-party claim still grants zero authority. A skill becomes executable only when a policy-authorized AXIOM capability/capsule path grants the required effects.

This preserves useful ideas from older agent repositories—skills registries, tool normalization, progressive disclosure, hardware profiles, and reusable procedures—without preserving their ambient execution assumptions.

### 6.1 Skill provenance is explicit

AXIOM must not confuse repository presence, installation, or discoverability with authorship or endorsement.

The initial closed descriptive provenance vocabulary should be:

- `AXIOM_FIRST_PARTY`
- `VENDOR_FIRST_PARTY`
- `PROJECT_LOCAL`
- `THIRD_PARTY`
- `USER_LOCAL`
- `UNKNOWN`

These labels describe origin context only. They never grant a capability.

A provenance-aware skill record should be able to identify:

```text
name
skill_contract_version
provenance_class
issuer
maintainer
source_location
source_digest
signature_or_attestation
applies_to
compatibility
read_only
executes_actions
grants_authority=false
operation_refs
documentation_refs
```

The projection layer must not rewrite provenance to make a skill appear more trusted than its canonical source.

Current repository state already demonstrates why this matters:

- `agent-skills/axiom-authority-auditor/SKILL.md` is repository-native AXIOM guidance intentionally published through the AXIOM skill index;
- `.agents/skills/typesafe-ai/SKILL.md` is a useful project-local third-party skill and is intentionally not published as AXIOM-authored guidance.

An automatic agent-discovery layer must preserve that distinction.

### 6.2 First-party host and component skills

Candidate AXIOM first-party skills include:

- `axiom-host`
- `axiom-mesh`
- `axiom-one`
- `axiom-verify`
- `axiom-circles`
- `axiom-gov`
- `axiom-ed`
- `axiom-privacy`

A first-party component skill is eligible for active projection only when:

1. the component is present according to an approved installed-state source;
2. the skill provenance validates as `AXIOM_FIRST_PARTY`;
3. component/skill compatibility is current;
4. canonical source integrity validates;
5. the projection target is an approved adapter;
6. projection does not change authority state.

A stable host skill should remain small. Its role is to teach compatible agents how to inspect a host/component profile, locate current component guidance, use supported lifecycle procedures, and distinguish descriptive/read-only work from consequential requests.

### 6.3 Generated host profile

AXIOM should maintain a generated descriptive host/component profile rather than hard-code installed state into static skills.

The profile should answer, without exposing private state:

- which AXIOM components are present;
- which versions/builds are installed;
- which first-party skills apply;
- which project-local/vendor skills are present under their real provenance class;
- whether guidance compatibility is `CURRENT`, `INCOMPATIBLE`, or `UNKNOWN`;
- where canonical documentation lives;
- which deterministic operations are described;
- that neither profile nor skill grants authority.

The profile must exclude secrets, credentials, private content, raw personal identifiers, user grants, consent records, and unnecessary sensitive topology.

### 6.4 Deterministic operation discovery

Where the software already knows the supported machine operation, agents should not have to scrape prose, guess shell commands, or click human UI.

AXIOM should therefore define an inert machine-readable operation-manifest contract before introducing any new live control surface.

A candidate operation record is:

```text
operation_id
component_id
description
mode = INSPECT | PLAN | VERIFY | APPLY
input_schema
output_schema
effect_class
required_authority_refs
skill_refs
currentness
deterministic
network_effect
side_effect_summary
verification_operation_refs
grants_authority=false
```

`required_authority_refs` describe which authority contract would be required. They do not prove that the caller possesses it.

The preferred workflow is:

```text
inspect actual state
-> resolve relevant current guidance
-> validate provenance/currentness
-> select a deterministic operation where available
-> for consequential effects, evaluate current authority
-> execute only inside that authority
-> verify the resulting state
-> record/report evidence and uncertainty
```

This keeps the human interface optional for agent operation where a direct machine interface exists, while preserving identical authority semantics.

### 6.5 Semantic routing is advisory

Semantic judgment can improve agent ergonomics without becoming an authority mechanism.

TypeSafe/System One or another classifier may later help:

- map a natural-language task to candidate skills;
- rank candidate operation IDs;
- select relevant documentation;
- detect that a request needs escalation to a reasoning model or human.

It must not:

- determine that authority exists;
- infer a grant from user intent;
- override a denied or revoked capability;
- upgrade `UNKNOWN` compatibility/currentness into permission;
- turn an appropriate-looking operation into an authorized operation.

Known rules, currentness, revocation, and authority predicates remain code/policy responsibilities.

## 7. Credentials and secrets

Machine interoperability must reduce credential spread rather than create another secret-sharing layer.

Required direction:

- no blanket forwarding of the host environment;
- no agent prompt or skill may receive credentials merely because a tool might use them;
- credentials are adapter/capsule specific and purpose bound;
- secrets are materialized only at the execution boundary that requires them;
- remote agents receive derived authority or signed requests, not reusable owner credentials;
- logs, errors, model context, evidence summaries, and protocol metadata must redact or omit secret values;
- credential availability must never silently weaken policy when a provider is unavailable;
- revocation and rotation must not require rewriting historical evidence.

## 8. Communication efficiency

Security should not require bloated agent traffic. Machine paths should support compact deterministic exchanges and asynchronous operation.

The design should favor:

- capability discovery with stable identifiers and schemas;
- request digests and idempotency keys;
- asynchronous task handles for long-running work;
- bounded streaming for progress and artifacts;
- resumable observation where protocol support permits it;
- signed or integrity-bound receipts instead of replaying full transcripts;
- selective evidence retrieval;
- batching where independent authorization semantics are preserved;
- cacheable immutable capability/capsule metadata;
- explicit size, concurrency, time, rate, and cost limits;
- causal identifiers so agents can coordinate without copying entire histories;
- machine-readable operation discovery for deterministic supported workflows.

Machine interfaces should expose exact structured errors rather than forcing agents to infer policy state from prose.

## 9. Machine-facing capability surface

The long-horizon machine surface should be smaller and more stable than a full agent framework. Candidate primitives are:

1. discover capabilities and schemas;
2. inspect capsule/adapter metadata and provenance;
3. discover current first-party/project-local operational guidance with preserved provenance;
4. enumerate deterministic inspect/plan/verify/apply operation descriptions;
5. submit an intent;
6. request a policy-bound plan preview;
7. observe approval requirements and status;
8. request human/independent approval without self-approving;
9. inspect grant scope and expiry;
10. observe asynchronous task status;
11. retrieve typed results and artifacts;
12. retrieve and independently verify receipts/evidence;
13. perform authorized memory/object reads and writes;
14. create provenance links;
15. perform selective sharing;
16. participate in approved causal exchange;
17. delegate a strictly bounded capability;
18. revoke or expire delegated authority;
19. subscribe to permitted events;
20. invoke an approved external adapter/capsule.

Human products may project these primitives into understandable interfaces. Agents may call them directly. The authority semantics remain identical.

## 10. Relationship to AXIOM products

### AXIOM One

Human personal control plane. It should remain optimized for comprehension, consent, review, recovery, and personal workflows. An agent using the same node does not replace the owner's interface or approval rights.

### AXIOM Verify

Should be both human- and machine-usable. Agents need to validate receipts, source bindings, execution identity, policy/version claims, artifact digests, assurance limitations, and first-party/provenance claims without trusting the producing runtime.

### AXIOM Circles

May eventually include service and agent principals alongside people and institutions. Machine members receive explicit roles/delegations; they do not become members merely by possessing a network endpoint.

### AXIOM Studio

Natural home for capsule/skill import, provenance review, adapter generation, manifests, permission review, conformance testing, protocol compatibility profiles, simulation, and publishing inert packages.

### AXIOM Managed Node

May operate communication and compatibility infrastructure while remaining unable to grant itself data ownership or ambient execution authority.

## 11. What to retain from legacy agent work

The older OpenClaw/GCA/IronAgent experiments should be mined, not preserved as architectural authority.

High-value extraction candidates include:

- skill normalization and registry ideas;
- tool/capability discovery and progressive disclosure;
- context-poisoning and prompt-injection detectors as advisory security signals;
- channel adapters as optional edge integrations;
- hardware/resource profile heuristics for scheduling;
- multi-agent task decomposition patterns;
- local/offline model routing concepts;
- explicit action-risk classification as one policy input;
- adversarial test harness ideas;
- migration/import tooling for external agent ecosystems.

Do **not** preserve as authority:

- fail-open ethics behavior;
- a model-derived "moral kernel" as the final permission gate;
- ambient host CLI access;
- self-expanding skills or tools that acquire permissions by creation;
- framework-level trust scores as substitutes for grants;
- raw chain-of-thought or private reasoning as required evidence;
- autonomous background behavior that can create external effects without explicit delegated authority;
- upstream forks maintained solely to keep pace with fast-moving general agent frameworks.

A GCA-like evaluator may survive as an optional policy signal, research capsule, or comparative evaluator. It must not outrank explicit AXIOM authority, consent, policy, and evidence.

## 12. Threat model additions

Future agent interoperability must address at least:

- malicious or compromised agent runtimes;
- prompt injection and context poisoning;
- tool-description poisoning;
- malicious skill/package instructions;
- false first-party attribution or provenance laundering;
- stale first-party guidance surviving upgrade/uninstall/rollback;
- machine-operation manifest substitution or downgrade;
- tool availability being mistaken for authorization;
- semantic router output being mistaken for authority;
- confused-deputy attacks across agents;
- delegation laundering and authority amplification;
- protocol identity spoofing;
- Agent Card or capability metadata substitution;
- MCP/A2A endpoint impersonation;
- credential exfiltration through tool arguments, errors, logs, model context, or artifacts;
- untrusted remote results presented as verified local facts;
- replay and duplicate external effects;
- task/result substitution;
- runaway loops consuming compute, money, bandwidth, or external quotas;
- cross-agent data leakage;
- hidden sub-agent spawning;
- adapter supply-chain compromise;
- schema/version downgrade;
- remote tool changes after discovery;
- policy bypass via alternate protocol paths.

Every compatibility adapter must prove that changing the protocol does not change the underlying authority result.

Negative conformance tests should additionally prove that:

- a project-local or third-party skill cannot be relabeled `AXIOM_FIRST_PARTY` by installation path;
- valid skill/profile/operation-manifest discovery cannot satisfy authorization;
- an available `APPLY` operation remains denied when current authority is absent or revoked;
- semantic routing cannot override a deterministic deny/currentness result;
- `INSPECT`/`VERIFY` discoverability does not enable `APPLY` authority;
- stale on-disk projections cannot retain stronger provenance/currentness after canonical state changes.

## 13. Promotion sequence

Recommended sequence:

1. finish current production-candidate pilot/security gates and preserve current claims;
2. maintain the byte-pinned Agent Runtime Adapter v1 contract and synthetic verifier while specifying machine principal and invocation-envelope semantics;
3. define inert provenance-aware skill records, a generated host/component profile, and a machine-readable operation-manifest contract over deterministic fixtures;
4. prove false-attribution, stale-guidance, operation-substitution, semantic-router, and negative-authority cases in fixture-only tests;
5. expose a read-only machine discovery/verification profile through the native Gateway contract only after its separate authority/surface review;
6. build one local MCP server adapter exposing only non-consequential/read-only capabilities;
7. prove protocol-parity and negative authorization behavior;
8. add one bounded agent principal with no subdelegation and no external egress;
9. add AXIOM Studio skill/capsule import as inert artifacts with preserved provenance;
10. add one bounded external tool/provider path with isolated credentials;
11. implement asynchronous task/receipt semantics;
12. specify attenuation-only machine delegation;
13. add A2A-compatible discovery/task translation in a laboratory;
14. add authenticated remote execution only after remote result/evidence semantics, compromise recovery, and independent verification are mature;
15. add agent participation in Circles only after Circle identity/delegation/appeal semantics exist.

Real user-home skill projection, live CLI/control adapters, MCP effectors, or other machine-operated consequential surfaces require their own reviewed activation step. Success of inert discovery does not authorize live control.

## 14. Current non-claims

This architecture does not claim that current `0.12.0-dev.3`:

- implements MCP server or client support;
- implements A2A discovery or task exchange;
- provides a supported autonomous-agent product;
- performs authenticated remote task execution;
- supports production agent-to-agent delegation;
- imports third-party skills safely for execution;
- provides production first-party host/component skill projection;
- provides a production generated host profile or machine-operation manifest;
- treats project-local third-party skills as AXIOM-authored or endorsed;
- uses TypeSafe/System One as an authorization mechanism;
- provides a production capsule marketplace;
- makes external agent outputs trustworthy;
- allows autonomous agents to bypass human, owner, policy, consent, or independent-approval requirements;
- has production-promoted remote federation.

The architecture also does not claim that first-party guidance is automatically correct or safe. Provenance, signatures, currentness, and vendor identity can strengthen attribution and relevance; they do not create permission and do not replace independent verification.

## 15. Governing maxim

> **Do not compete with every agent runtime. Make every agent runtime safer and more useful when it crosses an AXIOM boundary. Standardize the authority envelope, not the personality loop. Let capabilities travel farther than credentials, and let evidence travel farther than authority. Let software teach agents the supported way to work, but keep knowledge, deterministic tooling, and authority as separate things.**
