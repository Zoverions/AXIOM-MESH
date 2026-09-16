# Agent-Native First-Party Knowledge — Stage 5B Design Refresh

**Status:** Approved architectural direction captured on current `main`; this document does not by itself authorize runtime activation, production projection, merge, deployment, spending, credentials, or capability grants.

**Date:** 2026-09-16

**Design base:** `b8a746eace641c1b97ca70163bb030f49ca033f3`

**Related tracking:** #1578

**Supersedes for current-main planning:** the September 13 design branch `docs/self-describing-host-stage5b` at `b97b99afac71942818de48f0ef9f9218debd2e38`. That branch remains provenance; this refresh carries its valid invariants forward and adds the first-party provenance and deterministic-tooling split described below.

## 1. Purpose

AXIOM should be understandable and operable by compatible agents without forcing each runtime to rediscover project conventions, depend on stale general training data, or receive one giant global prompt.

The target experience is:

> The environment describes itself, teaches supported workflows, exposes deterministic operations, and verifies results without turning any of those descriptive surfaces into authority.

The security invariant remains:

> Knowledge of an environment is not authority over the environment.

This refresh adds a second invariant:

> Discoverable guidance is not necessarily first-party guidance.

AXIOM now contains both repository-native AXIOM guidance and project-local third-party skills. The architecture must preserve that distinction in machine-readable form.

## 2. External design evidence and correction

Two current external patterns materially inform this design.

### 2.1 Omarchy: environment-owned skill discovery

Omarchy demonstrates the usefulness of an environment shipping its own operating guidance into several agent runtimes from one environment-owned source. That validates capability-scoped, progressive discovery rather than permanently loading all operational knowledge into root instructions.

### 2.2 Unity: first-party skills plus deterministic tooling

On 2026-09-16 Unity announced an official Codex plugin containing 31 skills written and maintained by the Unity teams that own the corresponding features. Unity explicitly frames the value as authenticity, accountability, version currentness, project inspection before changes, and verification after work.

Unity also exposes a Unity CLI for deterministic machine operation. Its current CLI work includes machine-readable command discovery for agents and tooling.

The Codex plugin should not be modeled as a live-editor authority channel. Unity's own current discussion/documentation describes the Codex package as a skills package plus CLI and states that it is not an MCP server that hooks into the running Editor. Unity separately ships live Editor control in other agent integrations, including its Claude Code plugin.

That distinction improves the AXIOM design:

1. **knowledge can be first-party and task-scoped;**
2. **operations can be deterministic and machine-readable;**
3. **live consequential control is a separate surface that deserves a separate authority gate.**

External evidence is design input only. It creates no AXIOM compatibility, endorsement, authority, or security claim.

Sources:

- https://unity.com/blog/unity-plugin-codex
- https://docs.unity.com/en-us/ai/unity-plugin/about-unity-plugin
- https://discussions.unity.com/t/the-official-unity-plugin-for-codex/1736730
- https://discussions.unity.com/t/unity-cli-1-0-0-beta-10-is-rolling-out/1736729

## 3. Current repository evidence

At the design base, AXIOM already has two materially different skill classes:

1. `agent-skills/axiom-authority-auditor/SKILL.md` is repository-native AXIOM guidance published through `agent-skills/index.json`; its index explicitly records `read_only`, `executes_actions`, and `grants_authority: false`.
2. `.agents/skills/typesafe-ai/SKILL.md` is a project-local third-party skill installed from the TypeSafe project. It is useful to the project but is not AXIOM-authored and is intentionally not published through the AXIOM skill index.

The distinction must survive future automatic discovery. An agent must not infer that a skill is AXIOM-authored, AXIOM-reviewed, or AXIOM-authoritative merely because the file is present inside an AXIOM checkout or host.

Existing foundations to reuse include:

- `AGENTS.md` and `AGENT-ENTRY.md`;
- `agent-skills/index.json`;
- `agent-readiness/build.mjs` and the generated discovery artifacts;
- `mesh/src/check-agent-readiness.mjs` and related tests;
- `mesh/src/lib/canonical.mjs` for strict canonical JSON and digest semantics;
- the existing Gateway, Hypervisor, Sandbox, and Grid authority path;
- the project-local `.agents/skills/` convention for non-published skills.

This programme must extend those surfaces rather than create a parallel authority system.

## 4. Architectural decision

Adopt a three-plane agent-native architecture:

```text
                 descriptive / non-authorizing
+----------------------------------------------------------+
|  KNOWLEDGE PLANE                                         |
|  Host Profile + canonical skills + provenance/currentness|
+----------------------------------------------------------+
                         |
                         v
                 deterministic / bounded
+----------------------------------------------------------+
|  OPERATION PLANE                                         |
|  machine-readable command/tool manifests, inspect/plan/  |
|  verify interfaces, fixture adapters, later safe CLIs    |
+----------------------------------------------------------+
                         |
                         v
                 authoritative / consequential
+----------------------------------------------------------+
|  AUTHORITY PLANE                                         |
|  Gateway -> Hypervisor -> Sandbox -> Grid                |
|  grants, consent, currentness, revocation, effect limits |
+----------------------------------------------------------+
```

The planes may reference each other but MUST NOT collapse into one another.

A skill may explain an operation. A command manifest may describe how to invoke it. Neither may grant the permission required to perform a consequential effect.

## 5. Architectural invariants

1. **Knowledge is not authority.** Skill/profile presence, parsing, discovery, provenance, signatures, or currentness MUST NOT satisfy an AXIOM authorization predicate.
2. **Tool availability is not authority.** A CLI command, API route, MCP tool, function schema, executable, or successful dry-run MUST NOT satisfy authorization.
3. **First-party is explicit.** A skill is AXIOM first-party only when its provenance contract says so and that claim validates against the reviewed AXIOM source/issuer rules.
4. **Repository presence is not endorsement.** Files under `.agents/skills/`, vendor directories, worktrees, dependencies, or user-local paths MUST NOT be silently relabeled as AXIOM-authored.
5. **One canonical source, many projections.** Harness-specific projections are generated from canonical artifacts and do not become independent truth.
6. **Currentness is explicit.** Guidance declares the software/contract range to which it applies. Consequential guidance that cannot establish currentness fails closed.
7. **Deterministic where possible.** Exact state inspection, schemas, argument validation, command enumeration, and result verification should use code/contracts rather than semantic inference when the system already knows the answer.
8. **Semantic routing is advisory.** A model or TypeSafe-style semantic judgment MAY help select relevant guidance or rank candidate operations, but MUST NOT make the final authority decision or convert uncertainty into permission.
9. **No secret-bearing discovery plane.** Skills, host profiles, and command manifests exclude credentials, private content, raw personal identifiers, authority grants, consent records, and unnecessary topology.
10. **No alternate authority plane.** Supported privileged effects remain governed by `Gateway -> Hypervisor -> Sandbox -> Grid` unless a later reviewed architecture explicitly replaces that path.
11. **Lifecycle parity.** Install, upgrade, uninstall, rollback, component absence, skill revocation, and provenance changes are reflected in descriptive state.
12. **Verification is part of the workflow.** First-party operational guidance should define how an agent checks the actual pre-state and verifies the post-state rather than treating code generation as completion.

## 6. Provenance classes

The initial closed provenance vocabulary is:

- `AXIOM_FIRST_PARTY`
- `VENDOR_FIRST_PARTY`
- `PROJECT_LOCAL`
- `THIRD_PARTY`
- `USER_LOCAL`
- `UNKNOWN`

These values describe origin/trust context only. None grants execution authority.

### AXIOM_FIRST_PARTY

Issued and maintained by the AXIOM project under reviewed repository rules. Eligible for the canonical AXIOM public skill index when intentionally published.

### VENDOR_FIRST_PARTY

Issued by the software/service vendor whose component the skill describes, but not by AXIOM. Example pattern: a vendor-maintained skill for its own SDK or engine.

### PROJECT_LOCAL

Intentionally installed for this repository/project but not represented as AXIOM-authored. The current `.agents/skills/typesafe-ai/SKILL.md` belongs in this class unless a future reviewed provenance record says otherwise.

### THIRD_PARTY

Discovered from an external plugin, package, shared skill directory, marketplace, or integration without a project-local authorship claim.

### USER_LOCAL

User-maintained local guidance that applies to the user's environment but is not an AXIOM or vendor claim.

### UNKNOWN

Origin cannot be established. `UNKNOWN` MUST NOT be upgraded to a stronger provenance class by model inference.

## 7. Skill provenance contract

Each canonical/projected skill record SHOULD support:

- `name`
- `skill_contract_version`
- `provenance_class`
- `issuer`
- `maintainer`
- `source_location`
- `source_digest`
- `signature_or_attestation` where available
- `applies_to`
- `compatibility`
- `read_only`
- `executes_actions`
- `grants_authority: false`
- `operation_refs`
- `documentation_refs`

For AXIOM first-party skills, the issuer and source binding MUST be deterministic and reviewable. For third-party/project-local skills, AXIOM MAY record provenance and compatibility without claiming the content is reviewed or endorsed by AXIOM.

A projection adapter MUST NOT rewrite `provenance_class`, `issuer`, `grants_authority`, or source identity to make a skill appear more trusted than its canonical record.

## 8. Host Profile refresh

The generated profile remains `axiom-host-profile.v1` unless implementation review determines the provenance additions require a schema-version increment.

The profile remains descriptive. In addition to the September 13 design, skill entries must expose provenance without confusing it with permission.

A projected skill record should make these questions machine-answerable:

- Who authored/issued this guidance?
- Is it AXIOM first-party, vendor first-party, project-local, or another class?
- Which component/version does it apply to?
- Is the guidance current for the installed state?
- Which deterministic operations does it describe?
- Does it execute actions?
- Does it grant authority? The answer for a skill contract is always `false`.

The profile MUST NOT copy user-specific grants into skill metadata.

## 9. Deterministic operation manifest

AXIOM SHOULD define an inert, machine-readable operation manifest before exposing any new live control surface.

The first contract name is proposed as:

`axiom-operation-manifest.v1`

Each operation record should support:

- `operation_id`
- `component_id`
- `description`
- `mode`: `INSPECT`, `PLAN`, `VERIFY`, or `APPLY`
- `input_schema`
- `output_schema`
- `effect_class`
- `required_authority_refs`
- `skill_refs`
- `currentness`
- `deterministic` boolean
- `network_effect` classification
- `side_effect_summary`
- `verification_operation_refs`
- `grants_authority: false`

`required_authority_refs` are descriptive pointers to the authority contract that would be required. They do not prove that the caller possesses it.

The manifest allows an agent to understand the supported way to inspect, plan, apply, and verify an operation without scraping help text or inventing shell commands.

## 10. Workflow contract

First-party operational guidance should follow this general shape:

```text
1. Inspect actual installed/project state.
2. Resolve current first-party or otherwise selected guidance.
3. Validate guidance/currentness/provenance.
4. Resolve a deterministic operation where one exists.
5. For consequential effects, obtain/evaluate current authority through the authority plane.
6. Execute only within that authority.
7. Verify the resulting state with an independent/read-only verification operation where practical.
8. Record/report evidence and uncertainty.
```

This captures the useful Unity pattern—inspect the real project, use current supported APIs/commands, verify the result—without copying a product-specific plugin model or weakening AXIOM's authority architecture.

## 11. Component skills

AXIOM first-party component skills may eventually include:

- `axiom-host`
- `axiom-one`
- `axiom-mesh`
- `axiom-verify`
- `axiom-circles`
- `axiom-gov`
- `axiom-ed`
- `axiom-privacy`

A component skill is eligible for active first-party projection only when:

1. the component is present according to an approved installed-state source;
2. the skill provenance validates as `AXIOM_FIRST_PARTY`;
3. component/skill compatibility is `CURRENT`;
4. canonical source integrity validates;
5. the projection target is an approved adapter;
6. projection does not change authority state.

Vendor/project-local skills may be discoverable under their own provenance class but MUST NOT be projected into a namespace that implies AXIOM authorship.

## 12. Canonical skill store and harness projection

AXIOM maintains one canonical first-party skill store plus explicit projections:

```text
AXIOM first-party skills ----+
                             |
Vendor/project-local skills -+--> provenance-aware discovery view
                             |
Generated Host Profile ------+
                             |
Operation Manifest ----------+
                             v
                    Harness adapters
                     /   |   |   \
                 Codex Claude ... generic
```

For S0/S1, harness adapters write only into disposable fixture directories under test control.

Projection adapters define location/shape only. They MUST preserve semantic content, provenance, currentness, source identity, non-authority claims, and deterministic digests.

## 13. TypeSafe/System One boundary

The project-local TypeSafe skill creates a useful candidate for semantic routing experiments, but the boundary is strict.

TypeSafe/System One or another classifier MAY later help with:

- mapping a natural-language task to candidate skills;
- ranking candidate operation IDs;
- identifying which documentation slice is relevant;
- escalating ambiguous requests to a reasoning model or human.

It MUST NOT be the final mechanism for:

- determining whether authority exists;
- overriding a denied/revoked capability;
- inferring a grant from user intent;
- turning `UNKNOWN` compatibility/currentness into `CURRENT`;
- deciding that a consequential effect is allowed merely because it is semantically appropriate.

Known rules and authority predicates remain code/policy responsibilities.

## 14. Lifecycle semantics

### Install

A component or skill appears only through a reviewed installed-state/provenance source. Host Profile and discovery projections regenerate. The new artifact keeps its actual provenance class.

### Upgrade

Version changes trigger compatibility re-evaluation. `INCOMPATIBLE` or `UNKNOWN` guidance cannot masquerade as current simply because the skill is loadable.

### Uninstall

Descriptive projections disappear when the source is absent. User-owned state follows its separate retention/export policy.

### Rollback

Profile and operation/skill compatibility return to the restored software state. Newer stale guidance is not retained as current.

### Provenance change

If issuer/source verification changes or fails, the system updates/revokes the prior provenance claim. It does not continue advertising a stronger trust class because an older projection remains on disk.

## 15. Privacy and disclosure

Host profiles, skill indexes, and operation manifests must reject/omit:

- secrets, tokens, credentials;
- private prompts/conversations;
- personal files/content;
- raw account identifiers;
- stable analytics identifiers;
- private Grid objects;
- user-specific capability grants;
- consent records;
- unnecessary private network or hardware identifiers.

Prefer capability descriptions over uniquely identifying device details.

## 16. Failure behavior

Required fail-closed behavior includes:

- malformed source state -> no current profile;
- unsupported schema -> explicit incompatibility;
- profile/skill/manifest digest mismatch -> reject artifact;
- unverified first-party claim -> downgrade/reject the claim rather than infer first-party status;
- absent component -> withhold active component projection;
- unknown compatibility -> `UNKNOWN`;
- unknown provenance -> `UNKNOWN`;
- operation manifest references nonexistent schema/verification operation -> reject manifest;
- projection path ambiguity or escape -> reject;
- forbidden private field -> validation failure;
- unavailable discovery subsystem -> host remains operable through non-agent mechanisms;
- unavailable semantic router -> deterministic discovery remains available;
- discovered skill/tool but missing authority -> consequential operation remains denied.

## 17. S0/S1 test contract

Before any real host integration, tests must cover at least:

1. Fresh fixture host generates a valid profile and eligible first-party skill projections.
2. Absent component receives no active component skill.
3. Incompatible and unknown versions do not receive `CURRENT` guidance.
4. Tampered profile, skill, provenance record, or operation manifest is rejected.
5. Multi-harness projections preserve semantic content and provenance.
6. Uninstall removes active descriptive projection.
7. Rollback selects restored compatible guidance.
8. Forbidden sensitive fields fail validation.
9. Projection traversal/symlink escape is rejected.
10. Valid skill/profile/operation-manifest presence never satisfies authorization.
11. A usable deterministic `APPLY` operation remains denied when current authority is absent/revoked.
12. A project-local third-party skill is never relabeled `AXIOM_FIRST_PARTY` merely because it resides in the repository.
13. `.agents/skills/typesafe-ai/SKILL.md` is distinguishable from the repository-published AXIOM Authority Auditor in provenance-aware fixtures.
14. Semantic routing output cannot override a deterministic deny/currentness result.
15. Inspect/verify operations can be enumerated without enabling apply authority.
16. Digest output is deterministic across object key insertion order using existing canonicalization rules.
17. Stale on-disk projection cannot preserve stronger provenance/currentness after source state changes.

## 18. Staged delivery

### S0 — contracts and pure evaluators

Separately planned implementation may include:

- provenance enums/schema;
- skill provenance validator;
- Host Profile fixture generator/evaluator;
- operation-manifest schema/evaluator;
- compatibility/currentness evaluator;
- canonical digests using `mesh/src/lib/canonical.mjs`;
- negative authority tests;
- fixture representation of both AXIOM first-party and project-local third-party skills.

No real `$HOME` writes and no live control.

### S1 — disposable projection and operation laboratory

- fixture harness projections;
- fixture operation manifests;
- inspection/verification stubs over disposable data only;
- provenance parity tests;
- traversal/tamper/uninstall/rollback tests;
- no real host mutation.

### S2 — real host-local discovery

Requires separate authorization and exact specification of real installed-state/provenance sources and lifecycle hooks.

Potential scope:

- host-local profile generation;
- reviewed skill projections;
- reviewed machine-readable command/operation discovery;
- rollback/recovery integration.

S2 success does not imply permission for arbitrary live effects.

### S3 — component participation

AXIOM components publish reviewed first-party skills and operation manifests under the common contract.

### S4 — optional live tooling/control adapters

A live CLI, Gateway adapter, MCP surface, computer-control bridge, or other effectful tool surface is a separate reviewed step. It must preserve the authority path and must not inherit trust merely because the associated skill is first-party.

## 19. Relationship to #1578

Issue #1578 remains the agent-instruction/context optimization tracking surface.

This refresh turns two external observations into durable AXIOM requirements:

1. **software should ship version-matched first-party operational knowledge where appropriate;**
2. **agents should receive deterministic machine-operable interfaces instead of being forced through human UI when such interfaces exist.**

AXIOM adds stronger constraints: provenance classes, explicit currentness, negative authority semantics, privacy minimization, and a separate authority plane.

## 20. Acceptance criteria for this design refresh

The design is ready for S0 implementation planning when review confirms:

- the three planes—knowledge, operation, authority—remain distinct;
- first-party/vendor/project-local/third-party provenance cannot be silently conflated;
- current TypeSafe project-local installation is not represented as AXIOM-authored;
- operation manifests describe supported machine operations without granting them;
- semantic routing is advisory and cannot override deterministic authority/currentness decisions;
- currentness and provenance failures fail closed;
- real harness/home-directory writes and live effectful tooling remain excluded from S0/S1;
- existing canonicalization is reused;
- negative authority and false-attribution cases are directly testable;
- runtime/production activation remains separately gated.

## 21. Non-claims

This design does not claim:

- that first-party guidance is automatically correct or safe;
- that signatures/digests grant authority;
- that vendor first-party guidance is AXIOM-endorsed;
- that project-local third-party skills are reviewed by AXIOM;
- that any current agent will always select or follow the right skill;
- that TypeSafe/System One is an authority mechanism;
- that AXIOM currently has a production host profile, operation manifest, multi-harness projection, or live control surface;
- that Unity's Codex plugin uses live Editor MCP control;
- that a future AXIOM CLI/MCP/Gateway tool can bypass existing authority policy.

## 22. Governing principles

> **The environment should describe itself once; compatible intelligences should discover the relevant description automatically.**

> **Software should teach agents its supported way of working, and expose deterministic machine interfaces where possible.**

> **Discoverable guidance must preserve who actually authored it.**

> **Knowledge and tooling never substitute for current authority.**
