# Self-Describing Sovereign Host Agent Knowledge — Stage 5B Design

**Status:** Approved design captured for review; implementation not authorized by this document alone.

**Date:** 2026-09-13

**Design base:** `6ab02963f16cb56140f297b6e4508389619b0e63`

**Related tracking:** #1578

## 1. Purpose

AXIOM should make a sovereign host intelligible to compatible AI agents without requiring each runtime to rediscover the machine, memorize AXIOM internals, or depend on a single vendor-specific instruction surface.

The target experience is:

> The host describes itself once. Compatible intelligences discover that description automatically.

The security boundary remains separate:

> Knowledge of an environment is not authority over the environment.

This design takes the useful pattern demonstrated by AI-first operating environments—shipping environment-specific agent knowledge into common skill-discovery locations—and adapts it to AXIOM's stronger currentness, provenance, privacy, and authority requirements.

## 2. Fresh Stage 5B boundary

This is a fresh Stage 5B design gate. Stage 5A artifacts, experiments, tests, and lessons may be inputs and provenance only. They do not confer implementation, merge, deployment, production, capability, or runtime authority on this work.

This design does not authorize:

- a live Gateway route;
- modification of `mesh/config/capabilities.json`;
- production or user-home skill installation;
- writes to actual Codex, Claude, Hermes, Pi, Gemini/Antigravity, or generic agent directories;
- new network listeners;
- production credentials or secrets;
- Grid mutation;
- policy or grant changes;
- provider access;
- deployment or production promotion.

The first implementation slice, if separately planned and approved, is deliberately inert: schemas, canonicalization, validation, fixture-only generation, and negative authority tests.

## 3. Existing repository foundations

The repository already contains the correct primitives to extend rather than replace:

1. `AGENTS.md` establishes that capability, identity, discovery, connectivity, skills, plugins, runtimes, and reachable services do not create authority.
2. `AGENT-ENTRY.md` provides a short machine-oriented conceptual entry point.
3. `agent-skills/index.json` is a canonical repository-native skill registry and already records properties such as `read_only`, `executes_actions`, and `grants_authority`.
4. `agent-skills/axiom-authority-auditor/SKILL.md` demonstrates a portable Agent Skills-format artifact whose presence does not create permission.
5. `agent-readiness/build.mjs` already publishes a self-contained skill artifact and computes a SHA-256 digest.
6. `mesh/src/lib/canonical.mjs` already provides strict canonical JSON and object-digest primitives suitable for deterministic schema-bound digests.
7. The discovery surface already separates descriptive machine readability from runtime authority and production claims.

The new subsystem should therefore be a host-state projection layer over these foundations, not a second agent-instruction architecture.

## 4. External design signal and failure evidence

Omarchy currently ships an operating-system skill and exposes it through multiple harness-specific skill directories, including Codex, Claude Code, Pi, Antigravity/Gemini, Hermes, and a generic agent-skill location. This demonstrates the practical value of one environment knowledge source being automatically discoverable by multiple agent runtimes.

The same ecosystem also provides currentness failure examples: bundled agent guidance has referenced command forms that no longer worked in the installed environment, and repository-renaming changes have left stale skill references. These are not AXIOM vulnerabilities; they are useful evidence that self-describing agent knowledge must include version/currentness semantics and negative tests for stale guidance.

External examples remain design input only. They create no AXIOM authority or compatibility claim.

## 5. Decision

Adopt **stable canonical skills plus a generated Host Profile**, with fixture-only projection first.

Do not begin with a live self-description API.

### Why this option

A purely static host skill inevitably drifts from the installed machine. A live API adds runtime and protocol surface before there is evidence that it is required. A generated profile gives AXIOM a small, testable, portable boundary:

```text
trusted installed-state inputs
        |
        v
Host Profile Generator
        |
        v
axiom-host-profile.v1.json
        |
        +--> stable axiom-host skill
        |
        v
Projection Manager
        |
        +--> Codex fixture
        +--> Claude fixture
        +--> Hermes fixture
        +--> Pi fixture
        +--> Gemini/Antigravity fixture
        +--> generic Agent Skills fixture
```

## 6. Architectural invariants

The subsystem MUST preserve all of the following:

1. **Knowledge is not authority.** Skill presence, profile presence, successful parsing, discovery, or harness loading MUST NOT satisfy any AXIOM authorization predicate.
2. **Discovery is descriptive.** A component can be described only because the host can establish that it is installed or otherwise explicitly represented by an approved source of truth.
3. **Currentness is explicit.** Guidance MUST identify the contract/schema version and the software/version range or exact build state to which it applies.
4. **Stale consequential guidance fails closed.** If a consequential procedure cannot establish compatibility with the installed state, it is not current guidance.
5. **One canonical source, many projections.** Harness-specific copies MUST be generated/projected from canonical artifacts rather than manually maintained as independent truth.
6. **No secret-bearing discovery plane.** Host profiles and projected skills MUST exclude secrets, credentials, private content, raw personal data, stable analytics identifiers, and unnecessary sensitive topology.
7. **No alternate authority plane.** The subsystem MUST NOT bypass or replace `Gateway -> Hypervisor -> Sandbox -> Grid` for supported privileged effects.
8. **Lifecycle parity.** Install, upgrade, uninstall, rollback, and component absence MUST be reflected in generated descriptive state.
9. **Tamper evidence is not permission.** Digests/signatures can establish artifact integrity/provenance but MUST NOT be interpreted as authorization.
10. **Interface neutrality.** AXIOM MAY project into multiple harness conventions, but no harness becomes canonical authority merely because it has an adapter.

## 7. Host Profile contract

The initial schema name is:

`axiom-host-profile.v1`

The profile is a generated descriptive artifact. It MUST contain only information required for an agent to understand the installed AXIOM environment and locate authoritative operating guidance.

### Required top-level fields

- `schema`
- `generated_at`
- `generator_version`
- `source_state_digest`
- `host`
- `components`
- `skills`
- `documentation`
- `currentness`
- `non_authority_claim`
- `profile_digest`

### Host object

The host object SHOULD describe:

- AXIOM sovereign-host version/build identifier;
- platform/architecture only where needed for operating guidance;
- supported lifecycle mechanisms such as update, rollback, recovery, and verification;
- canonical pointers to the current capability registry and other local documentation where applicable.

It MUST NOT expose secrets, account identifiers, private network addresses, raw hardware serials, or user data.

### Component object

Each component record MUST include:

- canonical component identifier;
- installed/absent state;
- installed version/build when present;
- compatible skill contract/version;
- canonical documentation pointer;
- descriptive maturity/status where already supported by canonical project state;
- an explicit `grants_authority: false` property or equivalent invariant enforced by schema/validator.

An absent component MUST NOT receive an active projected component skill.

### Currentness object

The currentness object MUST bind the profile to:

- schema version;
- generator version;
- source-state digest;
- host/component version information;
- skill contract versions;
- compatibility result.

Compatibility states are closed and explicit:

- `CURRENT`
- `INCOMPATIBLE`
- `UNKNOWN`

`UNKNOWN` MUST NOT be silently upgraded to `CURRENT` for consequential procedures.

### Canonicalization and digest semantics

S0 MUST reuse the repository's existing strict canonical JSON primitives in `mesh/src/lib/canonical.mjs` (`canonicalize`, `canonicalJson`, `sha256`, and `digestObject`) rather than define a second JSON canonicalization algorithm.

Digest strings in this subsystem use the form `sha256:<64 lowercase hex characters>`.

`source_state_digest` is computed from the fully validated deterministic installed-state input object:

```text
source_state_digest = "sha256:" + digestObject(validated_source_state)
```

`profile_digest` MUST NOT hash itself. It is computed over the complete validated Host Profile with `profile_digest` omitted, using the same canonical JSON rules:

```text
profile_without_digest = host_profile minus top-level profile_digest
profile_digest = "sha256:" + digestObject(profile_without_digest)
```

Verification recomputes the digest after removing only the top-level `profile_digest` field and requires exact equality. Unknown fields, non-finite numbers, sparse arrays, symbol-keyed state, non-enumerable state, unsupported prototypes, or other values rejected by the existing canonicalizer MUST fail validation rather than be normalized differently by this subsystem.

The canonicalization algorithm is therefore an existing repository dependency of the contract. Changing that algorithm later requires an explicit schema/contract compatibility decision; silently changing Host Profile digest semantics is not permitted.

## 8. Stable `axiom-host` skill

The canonical `axiom-host` skill is intentionally small. Its job is to teach agents how to interpret the Host Profile and find the official AXIOM way to perform common host operations.

It SHOULD cover:

- how to locate and validate the Host Profile;
- how to determine which components exist;
- how to find component-specific skills and documentation;
- how to detect stale/incompatible guidance;
- how AXIOM expects installation, configuration, update, rollback, recovery, and verification workflows to be approached;
- which operations are descriptive/read-only versus consequential;
- the requirement to use governing authority mechanisms for consequential effects.

It MUST NOT embed credentials, grants, user-specific authority, or static claims about components that belong in the generated profile.

Its frontmatter/metadata MUST make the non-authority boundary machine-readable.

## 9. Component skill contract

Components MAY provide skills such as:

- `axiom-one`
- `axiom-verify`
- `axiom-circles`
- `axiom-ed`
- `axiom-gov`

A component skill is valid for projection only when:

1. the component is present according to the approved installed-state source;
2. the component/skill compatibility contract is `CURRENT`;
3. the canonical skill artifact passes integrity validation;
4. the projection target is an approved adapter/fixture.

Component skill presence means only that knowledge is available. It MUST NOT create user role, administrator status, data access, policy authority, merge authority, deployment authority, or runtime capability.

## 10. Canonical skill store and projection manager

AXIOM SHOULD maintain one canonical skill store and explicit projection adapters.

Conceptually:

```text
Canonical AXIOM skills
       |
       v
Projection manifest
       |
       +--> codex adapter
       +--> claude adapter
       +--> hermes adapter
       +--> pi adapter
       +--> gemini/antigravity adapter
       +--> generic agent-skills adapter
```

The initial implementation MUST project only into disposable fixture directories under test control.

A projection adapter defines location/shape only. It does not modify skill semantics, authority metadata, or canonical content.

All projections MUST be derivable from canonical inputs and verifiable against a digest or equivalent deterministic artifact identity.

## 11. Lifecycle semantics

### Install

```text
component becomes installed
-> installed-state source changes
-> Host Profile regenerates
-> compatible component skill becomes eligible for projection
-> fixture projections verify
```

### Upgrade

```text
component version changes
-> profile regenerates
-> compatibility is re-evaluated
-> CURRENT guidance may project
-> INCOMPATIBLE/UNKNOWN guidance does not masquerade as current
```

### Uninstall

```text
component becomes absent
-> profile regenerates
-> active projection disappears
-> user-owned state retention follows the component's separate data policy
```

The knowledge subsystem MUST NOT delete user-owned application data simply because a descriptive skill projection is removed.

### Rollback

```text
software rolls back
-> profile reflects restored version
-> compatible guidance is re-selected
-> stale newer guidance is not retained as current
```

## 12. Source-of-truth boundary

The generator MUST consume explicit, reviewed installed-state inputs. It MUST NOT determine installation or authority by asking an LLM to infer state from prose, shell history, path guesses, network reachability, or previous successful commands.

For S0/S1, installed state is represented by deterministic fixtures only.

A later host-integrated stage must independently specify the approved local installed-state source before real projection is permitted.

## 13. Privacy and disclosure boundary

The Host Profile is intentionally minimized.

It MUST reject or omit:

- credentials/tokens/secrets;
- personal files or content;
- prompts/conversation history;
- raw account identifiers;
- stable analytics identifiers;
- exact private network topology unless a separately reviewed use case proves it necessary;
- hardware serial numbers or device IDs not required for compatibility;
- private Grid objects;
- authority grants or consent records.

Where machine characteristics matter, prefer coarse capability description over uniquely identifying hardware detail.

## 14. Failure handling

Generation and projection are fail-closed for correctness, but they MUST NOT make the sovereign host unusable merely because agent discovery is unavailable.

Required failure behavior:

- malformed source state -> no current profile;
- unsupported schema -> explicit incompatibility;
- profile digest mismatch -> reject artifact;
- canonical skill digest mismatch -> reject projection;
- absent component -> remove/withhold active projection;
- unknown version compatibility -> `UNKNOWN`, not `CURRENT`;
- projection path ambiguity -> fail rather than write to an unintended location;
- fixture target outside approved disposable root -> reject;
- private/forbidden field in generated profile -> validation failure;
- unavailable discovery subsystem -> host remains operable through non-agent mechanisms.

## 15. S0 and S1 test contract

Before any real host integration, the following fixtures are required.

1. **Fresh install** — deterministic installed-state fixture generates the expected Host Profile and eligible projected skills.
2. **Absent component** — an absent component does not receive an active projected skill.
3. **Version drift** — incompatible skill/component combinations are explicitly `INCOMPATIBLE`; unknown combinations are `UNKNOWN`.
4. **Stale guidance** — old guidance cannot be marked current merely because it is parseable or previously valid.
5. **Tampering** — changed profile or canonical skill content fails digest/integrity validation.
6. **Multi-harness parity** — all supported fixture adapters project semantically identical canonical content.
7. **Uninstall** — a previously projected component skill disappears when installed state becomes absent.
8. **Rollback** — restored component version selects the matching compatible guidance and does not retain newer incompatible guidance as current.
9. **Sensitive-data rejection** — forbidden fields or representative secret material fail schema/policy validation.
10. **Projection containment** — fixture projection cannot escape the approved disposable test root by absolute paths, traversal, symlink tricks, or malformed adapter configuration.
11. **Negative authority test** — skill/profile presence, valid digest, successful discovery, and successful fixture command resolution each remain insufficient to satisfy an AXIOM authorization predicate.
12. **Revocation/currentness race** — a profile/skill generated before a component-state or authority-relevant change cannot renew or extend consequential permission.
13. **Digest determinism** — semantically identical validated source objects with different object key insertion order produce identical source/profile digests; profile self-digesting is impossible by contract.

## 16. Staged delivery

### S0 — contracts and pure evaluators

Allowed scope after a separate implementation plan is approved:

- JSON schemas;
- canonicalization rules using the existing canonical library;
- deterministic profile evaluator/generator over fixtures;
- compatibility evaluator;
- closed decision enums;
- digest calculation;
- negative authority tests;
- documentation bindings.

No filesystem projection outside fixture roots.

### S1 — disposable projection laboratory

- projection manifest;
- harness adapters;
- temporary/disposable directories only;
- parity, traversal, tamper, uninstall, and rollback tests;
- no real `$HOME` writes.

### S2 — sovereign-host integration

Requires a new implementation authorization under this Stage 5B design plus exact specification of the real installed-state source and lifecycle hooks.

Potential scope:

- host-local profile generation;
- real lifecycle integration;
- reviewed projection targets;
- rollback/recovery integration.

S2 MUST NOT be inferred as approved merely because S0/S1 succeed.

### S3 — component participation

Components publish reviewed descriptive manifests/skills under the same contract.

### S4 — optional live self-description

A live Gateway or other runtime query surface is out of scope unless evidence from earlier stages shows generated static state is insufficient. Any such surface requires its own authority/threat-model review.

## 17. Relationship to issue #1578

Issue #1578 remains the instruction/context optimization tracking surface. This design contributes a concrete architecture for automatic environment knowledge without re-expanding root prompts.

The implementation SHOULD keep universal invariants small and stable while making environment-specific and component-specific knowledge discoverable only when relevant.

This does not weaken repository-required checks, exact-head evidence, protected CI, merge separation, or production-promotion gates.

## 18. Acceptance criteria for this design

The design is ready to move to implementation planning when review confirms all of the following:

- the subsystem reuses the existing Agent Skills/discovery architecture rather than introducing a parallel authority plane;
- canonical skill content and generated host state are clearly separated;
- installed component state controls descriptive projection eligibility;
- version/currentness outcomes are explicit and fail closed;
- profile/source digests reuse the repository canonical JSON implementation and avoid self-hashing ambiguity;
- real harness/home-directory writes are excluded from S0/S1;
- secrets and personal data are excluded from the profile contract;
- negative authority semantics are testable;
- uninstall and rollback semantics are defined;
- S2 remains separately gated;
- no live self-description API is required for the initial programme.

## 19. Non-claims

This design does not claim:

- compatibility with any external agent harness beyond planned fixture adapters;
- that a skill format is a security boundary;
- that hashes/signatures grant authority;
- that current agent models will always follow skills correctly;
- that generated profiles eliminate the need for runtime policy enforcement;
- that any production sovereign-host installation or projection exists;
- that a real `$HOME` or third-party runtime configuration has been modified.

## 20. Governing principle

Two statements govern the subsystem:

> **The host describes itself once; compatible intelligences discover that description automatically.**

> **Knowledge of an environment is not authority over the environment.**

The first is a usability goal. The second is a security invariant. Neither may be implemented by weakening the other.
