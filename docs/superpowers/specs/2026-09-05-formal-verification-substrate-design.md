# Formal Verification Substrate — Design

**Tracker:** `FORMAL-001`

**Status:** approved architecture; documentation-only; no capability promotion

**Date:** 2026-09-05

**Scope:** AXIOM-MESH substrate for machine-verifiable formal proofs, deterministic proof verification evidence, and policy consumption of verified formal claims without allowing theorem provers, proof generators, or verification reports to mint authority.

**Builds on:**

- `CONSTITUTION.md`
- `docs/rebuild/REQUIREMENTS.md`
- `docs/operations/AXIOM-VERIFY-MVP-SCOPE.md`
- `docs/superpowers/specs/2026-09-03-sovereign-information-evidence-authority-design.md`
- the existing canonical JSON/digest helpers under `packages/axiom-verify/`
- the existing Grid/evidence distinction between integrity, provenance, authorization, and external-world truth
- the existing rule that model output, evidence, reputation, credentials, and other informative artifacts do not directly authorize external effects

**Authority boundary:** this design does not grant theorem provers, proof generators, formal verification adapters, AXIOM Verify, agents, models, or formal proof artifacts any execution authority. A verified formal proof may satisfy a policy predicate only where an independently authorized policy explicitly names the exact verification scope it accepts. Existing identity, consent, capability, mandate, approval, policy, resource, destination, and effect-admission gates remain independently required. No `FORMAL-001` artifact may create a capability, widen a mandate, consume an approval, modify policy, release funds, execute code, or trigger an external effect by itself.

---

## 1. Core decision

AXIOM-MESH will treat formal proof verification as a specialized evidence substrate, not as a second truth engine and not as an authority system.

The governing flow is:

```text
human / agent / model proposes a formal claim
        |
        v
axiom-formal-proof-bundle.v1
        |
        v
registered verifier adapter under an exact verifier profile
        |
        v
axiom-formal-proof-verification.v1
        |
        v
existing signed evidence / provenance path when imported into Mesh
        |
        v
ordinary policy predicate evaluation
        |
        v
existing consent / capability / approval / effect admission
```

The security invariant is:

> **Formal verification may satisfy a policy predicate; formal verification never mints authority.**

The epistemic invariant is:

> **`VERIFIED` means that an exact formal statement follows under an exact formal dependency closure as checked by an exact verifier profile. It does not mean that the premises describe the external world, that the verifier is universally sound, that a model is generally correct, or that an external action is authorized.**

This design extends the existing AXIOM Verify distinction between integrity and truth into formal reasoning.

---

## 2. Why this belongs in AXIOM Verify

`packages/axiom-verify/` already establishes the correct architectural posture:

- verification can run locally without trusting the operator that produced an artifact;
- canonical bytes, digests, signatures, schemas, and declared scope can be checked independently;
- unknown schemas and unsupported conditions fail closed;
- verification reports explicitly distinguish integrity from external-world truth;
- the verifier is isolated from Mesh policy authority.

Formal proof verification should therefore enter as another verifier artifact class under AXIOM Verify rather than creating a parallel verification service inside `mesh/src`.

The theorem prover or kernel is a checker dependency. It is not a policy decision-maker.

The proof-generating model or agent is a proposer. It is not a verifier and not an authority principal merely because it produced a valid proof.

When a formal verification result is later consumed by the Mesh, the Mesh imports the result through the existing evidence/provenance boundary and evaluates it under ordinary policy. AXIOM Verify does not call Gateway, Hypervisor, Grid authority endpoints, or any external-effect path as part of proof verification.

---

## 3. Epistemic taxonomy

AXIOM-MESH must preserve distinct evidence classes instead of collapsing them into one truth score.

A consequential claim may be described using one or more of these states:

```text
formally-verified
empirically-supported
probabilistically-inferred
institutionally-adjudicated-for-defined-purpose
asserted
speculative
unknown
```

These states are not interchangeable.

In particular:

```text
formally-verified != externally true
empirically-supported != deductively proved
consensus != proof
proof != permission
confidence != authority
```

A claim may legitimately be `formally-verified` while remaining empirically uncertain because the formal premises may not yet be established as accurate descriptions of the world.

Likewise, an empirical observation may be strongly supported without being expressible as a theorem in the current formal system.

---

## 4. Trust boundary

### 4.1 Proposer boundary

A human, model, agent, institution, or tool may propose:

- a formal statement;
- a dependency set;
- a proof artifact;
- a claimed verifier profile;
- a claimed correspondence between the formal statement and an external-world proposition.

All such inputs are untrusted until independently checked within their declared scope.

A proposer may not mark its own output as accepted verification evidence.

### 4.2 Verifier boundary

A verifier adapter may only answer the bounded question defined by its registered profile:

> Does this exact proof bundle verify under this exact formal system, exact dependency closure, exact verifier executable/kernel digest, and exact verifier configuration?

A verifier adapter may not:

- infer external-world truth;
- decide whether premises are empirically justified;
- choose policy;
- mint or widen capabilities;
- approve external effects;
- silently fetch dependencies from the network;
- substitute a different verifier build or configuration;
- accept an incomplete or ambiguous dependency closure;
- translate `VERIFIED` into `authorized`.

### 4.3 Mesh boundary

When Mesh policy consumes formal verification evidence, it must bind to the exact properties required by that policy.

A policy predicate may require, for example:

```text
artifact_schema == axiom-formal-proof-verification.v1
verdict == VERIFIED
statement_fingerprint == digest S
dependency_closure_digest == digest D
verifier_profile_digest in accepted set V
resource_policy_digest == digest R
```

The predicate being satisfied is evidence input to authorization. It is not authorization itself.

Any authority-sensitive use must continue through the existing signed policy and effect-admission path.

---

## 5. `axiom-formal-proof-bundle.v1`

The proof bundle is a canonical manifest plus an exact set of referenced ordinary files or content-addressed blobs.

The manifest itself is canonical JSON and is digested using the same dependency-light canonicalization posture already used by AXIOM Verify, with domain separation defined below.

Version 1 does not auto-expand archives.

### 5.1 Required manifest fields

```text
schema: "axiom-formal-proof-bundle.v1"
claim_id: bounded opaque string
formal_system:
  adapter_id
  language
  language_version
  logic_profile
entrypoint:
  path
  declaration
statement_fingerprint:
  algorithm
  value
verifier_profile:
  profile_digest
  adapter_id
  adapter_version
  verifier_id
  verifier_version
  executable_digest
  configuration_digest
resource_policy_digest
artifacts[]:
  path
  role
  sha256
  size_bytes
dependencies[]:
  dependency_id
  kind
  digest
  source_scope
premise_refs[]
declared_scope:
  claim_kind
  intended_use
  non_claims[]
provenance:
  proposer_type
  proposer_ref
  source_refs[]
```

The manifest may contain descriptive metadata, but no descriptive field may substitute for a required digest binding.

The `verifier_profile.profile_digest` must match the digest of exactly one registered verifier profile descriptor. The remaining verifier-profile fields in the manifest are redundant inspectability bindings and must exactly match that resolved descriptor; any disagreement fails closed.

### 5.2 Canonical ordering rules

The verifier does not silently sort or normalize set-like input before deciding whether the manifest is valid. Version 1 requires the producer to supply canonical order, and the verifier rejects violations.

Required ordering is:

```text
artifacts[]      -> ascending bytewise ASCII path
dependencies[]   -> ascending tuple (kind, dependency_id, digest)
premise_refs[]   -> ascending bytewise string value
non_claims[]     -> ascending bytewise string value
source_refs[]    -> ascending bytewise string value
```

All five arrays must be duplicate-free.

Arrays whose order is semantically meaningful in a future formal-system adapter require a new schema/profile rule rather than silently reinterpreting these v1 set-like arrays.

### 5.3 Path and file rules

Version 1 uses a deliberately narrow file model.

Artifact paths must:

- be relative POSIX-style paths;
- use a bounded ASCII subset;
- contain no empty segments;
- contain no `.` or `..` segments;
- contain no absolute path prefix;
- contain no duplicate normalized path;
- refer only to ordinary files supplied in the bundle;
- never rely on symlinks, hard links, devices, sockets, or ambient filesystem state.

The verifier rejects the bundle rather than normalizing ambiguous paths.

Each artifact is bound by exact SHA-256 digest and byte length before any verifier adapter receives it.

### 5.4 Artifact roles

Version 1 recognizes a bounded role vocabulary:

```text
statement
proof
source
dependency
configuration
lockfile
auxiliary
```

Adapters may impose stricter role requirements. Unknown roles fail closed under v1.

### 5.5 Dependency closure

The bundle must declare the complete dependency closure required for the claimed verification scope.

Dependencies include any formal library, axiom package, theorem package, generated source, lockfile, configuration, or other semantic input that can affect proof acceptance.

The closure is identified by the domain-separated digest:

```text
dependency_closure_digest = SHA-256(
  UTF8("axiom-formal-dependency-closure.v1\n") ||
  UTF8(canonical-json(dependencies[]))
)
```

`dependencies[]` must already satisfy the canonical ordering rule from section 5.2. The verifier rejects unsorted, duplicate, ambiguous, or incomplete dependency descriptors rather than silently repairing them.

For adapter profiles that use package managers or standard libraries, the accepted profile must define how the complete transitive dependency closure is materialized and hashed. Network resolution during verification is forbidden.

### 5.6 Premises and assumptions

`premise_refs[]` identifies the formal premises on which the claimed theorem depends at the abstraction level exposed by the adapter.

This field exists for inspectability and policy use. It does not replace the full dependency closure.

A proof can be valid relative to inconsistent, weak, strong, domain-specific, or empirically unsupported premises. The verification report must preserve those premise references and must not describe proof validity as external-world truth.

### 5.7 Statement fingerprint

Each registered adapter profile must define one deterministic procedure for computing the fingerprint of the checked declaration.

The procedure must bind the exact formal statement interpreted by that verifier profile, not merely a human title or source filename.

If the adapter cannot deterministically identify the exact checked statement, the bundle is `UNSUPPORTED` under that profile.

The bundle-provided fingerprint must equal the independently computed fingerprint or verification fails closed.

### 5.8 Proof-bundle digest

After the verifier has confirmed that every supplied artifact byte string matches the `sha256` and `size_bytes` declared in the canonical manifest, the exact bundle identity is:

```text
manifest_digest = SHA-256(UTF8(canonical-json(manifest)))

proof_bundle_digest = SHA-256(
  UTF8("axiom-formal-proof-bundle.v1\n") ||
  manifest_digest_bytes
)
```

Because the canonical manifest contains the complete artifact digest/size table, dependency descriptors, statement fingerprint, verifier-profile binding, and resource-policy digest, the domain-separated `proof_bundle_digest` transitively binds those verified artifact bytes and semantic inputs.

The digest is not computed until all declared artifact digests and sizes have been independently checked.

---

## 6. Verifier profiles and adapter registry

AXIOM Verify will use an explicit allowlisted registry of verifier profiles.

Arbitrary executable paths, environment-selected provers, dynamically downloaded binaries, or unregistered plugins are not accepted verifier profiles.

### 6.1 Verifier profile identity

A verifier profile is identified by a canonical descriptor containing at least:

```text
profile_schema
adapter_id
adapter_version
formal_system
verifier_id
verifier_version
executable_digest
configuration_digest
statement_fingerprint_method
dependency_closure_method
resource_policy_digest
output_contract_version
```

Its identity is:

```text
verifier_profile_digest = SHA-256(
  UTF8("axiom-formal-verifier-profile.v1\n") ||
  UTF8(canonical-json(profile_descriptor))
)
```

Changing any semantically relevant verifier, adapter, configuration, foundation, dependency-resolution, resource, or output-contract property creates a different profile digest.

The manifest's `verifier_profile.profile_digest` and redundant verifier identity fields must match this resolved descriptor exactly.

### 6.2 Adapter contract

A registered adapter receives only prevalidated bundle material and a resolved registered verifier profile.

Conceptually:

```text
verify({
  manifest,
  materialized_artifacts,
  resolved_profile
}) -> deterministic adapter result
```

The adapter result must contain no authority decision.

It returns only bounded verification facts such as:

```text
verdict
statement_fingerprint
dependency_closure_digest
premise_refs
verifier_profile_digest
transcript_digest
reason_code
```

### 6.3 No ambient network or dependency discovery

Verification runs without network access.

The adapter may not contact:

- package registries;
- theorem libraries;
- source repositories;
- model providers;
- operator APIs;
- remote proof services;
- licensing servers that alter proof semantics;
- other network endpoints.

All semantic inputs required for verification must already be present and digest-bound.

If a future verifier cannot operate under this boundary, it is not eligible for the high-assurance formal verification profile defined here.

### 6.4 Environment discipline

A verifier profile must define the environment inputs that can affect semantics.

The runner must remove or explicitly bind semantically relevant ambient state, including where applicable:

- locale;
- timezone;
- current working directory;
- environment variables;
- search paths;
- user configuration;
- plugin directories;
- package caches;
- mutable global state;
- random seeds;
- filesystem discovery outside the materialized bundle/profile.

If the adapter cannot demonstrate deterministic interpretation under the declared profile, the result is not admissible as `VERIFIED` evidence.

### 6.5 Resource policy

Every verifier profile is bound to a resource policy digest.

The policy must impose bounded values for at least:

- maximum manifest bytes;
- maximum bundle bytes;
- maximum file count;
- maximum individual file bytes;
- maximum dependency count;
- maximum transcript bytes;
- wall-clock execution ceiling;
- process/output limits appropriate to the runner;
- recursion/decompression/materialization limits where relevant.

Resource exhaustion or policy breach is not proof rejection. It is a verification failure state that fails closed for admission.

The initial implementation slice uses a deterministic in-process mock verifier and therefore does not claim that arbitrary external theorem provers are safely sandboxed. A real external prover adapter may not be promoted until its runner satisfies the applicable isolation and resource-control requirements.

---

## 7. Verification algorithm

The high-level verification sequence is normative.

```text
1. Parse manifest under bounded JSON limits.
2. Require exact supported schema id.
3. Validate canonical field shapes, bounded enums, canonical array order,
   duplicate-freedom, and exact path grammar.
4. Validate declared file sizes and materialize ordinary files only.
5. Hash every artifact before adapter invocation.
6. Reject any digest, size, duplicate, ordering, or materialization mismatch.
7. Resolve exactly one registered verifier profile by profile_digest.
8. Require exact redundant verifier/profile/config/resource bindings.
9. Compute and validate complete dependency_closure_digest.
10. Compute proof_bundle_digest only after artifact validation succeeds.
11. Invoke the registered adapter under the resolved profile.
12. Require adapter output to satisfy the bounded output contract.
13. Independently compare returned statement fingerprint, dependency digest,
    premise refs, and verifier profile digest against the manifest/profile.
14. Build and digest the bounded deterministic verification transcript.
15. Emit axiom-formal-proof-verification.v1.
16. If imported into Mesh, bind the verification artifact digest through the
    existing signed evidence/provenance path before policy consumption.
```

No step may infer authorization from proof validity.

---

## 8. `axiom-formal-proof-verification.v1`

The verification artifact records the exact scope that was checked.

### 8.1 Required fields

```text
schema: "axiom-formal-proof-verification.v1"
verdict
reason_code
claim_id
proof_bundle_digest
statement_fingerprint
dependency_closure_digest
premise_refs[]
verifier_profile_digest
resource_policy_digest
transcript_digest
verification_scope:
  formal_system
  adapter_id
  verifier_id
  verifier_version
non_claims[]
```

`premise_refs[]` and `non_claims[]` retain the canonical v1 ordering/duplicate rules from section 5.2.

No wall-clock timestamp is part of the deterministic core verification result. If Mesh imports the result, the existing evidence event may add authenticated observation/ingestion time outside the core result digest.

### 8.2 Verdicts

Version 1 uses exactly four verdicts:

```text
VERIFIED
REJECTED
UNSUPPORTED
ERROR
```

Semantics:

- `VERIFIED` — the exact formal proof checked successfully under the exact declared profile and all binding checks passed.
- `REJECTED` — the verifier deterministically determined that the proof does not establish the declared statement under the declared profile, or a semantic binding required for verification is false.
- `UNSUPPORTED` — AXIOM Verify does not have an accepted profile/adapter/statement-fingerprint method for the supplied artifact.
- `ERROR` — verification could not complete under the declared resource/environment contract.

Only `VERIFIED` may satisfy a formal-verification policy predicate. Every other state fails closed for that predicate.

`REJECTED`, `UNSUPPORTED`, and `ERROR` remain distinguishable for diagnostics and remediation; they must not be collapsed into `VERIFIED=false` if doing so would obscure whether the proof was actually checked.

### 8.3 Reason codes

Human-readable error strings are non-authoritative. Machine policy consumes bounded reason codes and exact digests.

Representative required reason classes include:

```text
schema_unknown
manifest_invalid
path_invalid
ordering_invalid
artifact_missing
artifact_digest_mismatch
artifact_size_mismatch
dependency_duplicate
dependency_incomplete
dependency_digest_mismatch
profile_unknown
profile_digest_mismatch
verifier_digest_mismatch
configuration_digest_mismatch
resource_policy_mismatch
statement_fingerprint_mismatch
proof_rejected
adapter_contract_violation
resource_limit_exceeded
nondeterministic_result
verifier_execution_error
transcript_limit_exceeded
```

The implementation may define more specific bounded codes while preserving these semantic classes.

### 8.4 Deterministic transcript

`transcript_digest` binds a bounded deterministic semantic transcript defined by the adapter output contract.

The deterministic transcript may contain verifier-relevant declarations, checked targets, bounded reason codes, and other stable verification facts. It must exclude or normalize host-specific and run-specific values such as:

- wall-clock timestamps;
- process identifiers;
- temporary absolute paths;
- hostnames;
- nondeterministic progress text;
- memory addresses;
- randomized diagnostic identifiers.

Raw operational stdout/stderr may be retained separately as diagnostic evidence where appropriate, but it is not allowed to alter the core semantic verification result unless the profile explicitly defines a deterministic bounded representation.

### 8.5 Verification-artifact digest

After constructing the canonical result object, its exact identity is:

```text
verification_artifact_digest = SHA-256(
  UTF8("axiom-formal-proof-verification.v1\n") ||
  UTF8(canonical-json(verification_artifact))
)
```

Mesh evidence import binds this exact digest, not a human summary and not an unverified `VERIFIED` field copied from another object.

### 8.6 Non-claims

Every human-facing representation of a `VERIFIED` result must communicate at least these non-claims:

- formal verification does not establish that premises correspond to the external world;
- formal verification does not establish general model correctness;
- formal verification does not establish verifier soundness beyond the accepted profile and review assumptions;
- formal verification does not authorize external effects;
- formal verification does not establish policy wisdom, legal sufficiency, or institutional legitimacy;
- formal verification does not convert empirical uncertainty into certainty.

---

## 9. Mesh admission semantics

### 9.1 Evidence import

A raw JSON object claiming to be a verification report is not trusted merely because its fields say `VERIFIED`.

When a verification result is used inside Mesh, the system must bind the exact `verification_artifact_digest` through the existing evidence/provenance mechanism appropriate to the consuming workflow.

The consuming policy must be able to identify:

- who or what performed/imported the verification;
- the exact verification artifact digest;
- the exact verifier profile digest;
- the exact proof bundle digest;
- the exact statement fingerprint;
- the exact dependency closure digest;
- the evidence currentness rules, if the policy has any.

No new signing or authority engine is introduced inside AXIOM Verify for `FORMAL-001`.

### 9.2 Exact-effect separation

Formal verification must never be sufficient by itself for an external effect.

The required structure remains:

```text
formal proof verified
        |
        v
policy predicate satisfied
        |
        +--> identity / mandate / consent checks
        +--> capability / scope checks
        +--> approval checks where required
        +--> resource / destination / freshness checks
        +--> exact-effect binding
        |
        v
separate existing effect admission
```

A regression test must demonstrate that possession of a valid `axiom-formal-proof-verification.v1` artifact cannot create or widen authority and cannot bypass ordinary external-effect admission.

### 9.3 Policy binding must be specific

Policies must not use broad predicates such as:

```text
has_verified_proof == true
```

for consequential decisions.

They must bind the exact claim and accepted verification context needed for that decision.

A verifier profile accepted for one theorem family, formal library, safety case, or period is not automatically accepted for another.

### 9.4 Revocation and verifier-profile deprecation

Proof validity is logically distinct from whether a verifier profile remains accepted for a current policy purpose.

If a verifier/kernel is later found unsound or a profile is deprecated:

- historical verification artifacts remain immutable evidence of what checked under that profile at the time of verification/import;
- current policy may stop accepting that verifier profile digest;
- dependent current decisions may be re-evaluated according to domain policy;
- the historical evidence record is not rewritten to pretend the earlier verification never occurred.

This mirrors AXIOM's broader correction/supersession model.

---

## 10. Correspondence to external-world claims

Formal proof verification answers a syntactic/semantic question inside a formal system. Many valuable AXIOM use cases also need a correspondence claim between the formal statement and reality.

That correspondence must remain a separate evidence relationship.

Conceptually:

```text
external-world proposition
        |
        +--> empirical evidence / observations / measurements
        |
        +--> formalization correspondence assertion
                      |
                      v
               formal statement
                      |
                      v
                formal proof
```

A valid proof does not automatically validate the `formalization correspondence assertion`.

Where a consequential workflow relies on that correspondence, policy must separately require whatever empirical, human, institutional, sensor, calibration, review, or other evidence is appropriate.

This prevents a mathematically flawless proof of the wrong model from being represented as a verified fact about reality.

---

## 11. Threat model

The design must fail closed against at least the following attacks and failure modes.

### 11.1 Proof or statement substitution

An attacker changes proof bytes, statement source, entrypoint, or declaration while retaining a trusted label.

**Mitigation:** exact artifact digests, exact statement fingerprint, exact proof-bundle digest, and independent recomputation before adapter execution.

### 11.2 Dependency substitution or omission

An attacker changes, removes, aliases, or resolves a theorem library, axiom set, package, lockfile, or generated dependency differently.

**Mitigation:** complete materialized dependency closure, exact dependency descriptors, canonical closure digest, no network resolution, duplicate/ambiguity rejection.

### 11.3 Verifier substitution

An attacker swaps the theorem prover/kernel, wrapper, plugin, configuration, or executable.

**Mitigation:** allowlisted verifier profiles and exact executable/configuration/profile digests.

### 11.4 Unsound verifier profile

A verifier/kernel accepted by policy is later found unsound or incorrectly wrapped.

**Mitigation:** profile-specific acceptance, immutable historical evidence, profile deprecation, re-evaluation support, no universal `verified` authority flag.

### 11.5 Inconsistent or misleading premises

A valid proof relies on inconsistent axioms, unrealistic assumptions, or premises not supported by empirical evidence.

**Mitigation:** premise references, dependency closure visibility, integrity-versus-truth non-claims, separate correspondence/empirical evidence requirements.

### 11.6 Ambient-state attack

The same proof checks differently depending on environment variables, local libraries, locale, plugins, caches, network state, or filesystem discovery.

**Mitigation:** registered environment contract, no network, exact dependency materialization, environment stripping/binding, deterministic-output requirements.

### 11.7 Resource exhaustion

A crafted bundle causes excessive parsing, expansion, proof search, output, process creation, or memory/time usage.

**Mitigation:** bounded manifest/file/dependency/output sizes, resource-policy digest, fail-closed execution ceiling, no archive auto-expansion in v1, isolation requirement before external prover promotion.

### 11.8 Path traversal or filesystem escape

A crafted manifest attempts to read/write outside the verification workspace or exploit links/devices.

**Mitigation:** strict relative ASCII POSIX path grammar, no symlinks/hardlinks/devices, pre-materialization validation, ordinary-file-only contract.

### 11.9 Nondeterministic verification result

A verifier or adapter produces inconsistent verdicts or semantic fingerprints for the same exact inputs/profile.

**Mitigation:** deterministic adapter contract, repeated reproducibility tests during profile qualification, explicit nondeterministic-result failure in test adapters, and profile ineligibility until determinism requirements are satisfied.

### 11.10 Fake verification report

An attacker fabricates JSON containing `verdict: VERIFIED`.

**Mitigation:** Mesh policy consumes only verification artifacts whose exact digest is bound through the accepted evidence/provenance path and whose required profile/claim/dependency bindings match policy.

### 11.11 Authority laundering

A valid proof is used to bypass consent, approval, capability, legal, resource, destination, or external-effect gates.

**Mitigation:** explicit non-authority invariant, exact policy predicate semantics, and regression coverage proving verification cannot mint/widen authority or directly reach effect execution.

---

## 12. Determinism and reproducibility

The target property is not merely "the prover usually accepts this proof." It is reproducible verification under an exact profile.

For the same:

- proof bundle bytes;
- materialized artifacts;
- dependency closure;
- verifier profile;
- resource policy;

independent conforming verification runs should produce the same core semantic result:

```text
verdict
reason_code
statement_fingerprint
dependency_closure_digest
premise_refs
verifier_profile_digest
transcript_digest
```

Operational metadata such as host observation time, process identifiers, raw diagnostic logs, or UI text must not alter that core semantic result.

If a formal system inherently requires nondeterministic search, the accepted profile must still reduce the final checking step to deterministic verification of an explicit proof object. Search may be nondeterministic; acceptance must not depend on unbound search state.

---

## 13. Initial implementation boundary

The first `FORMAL-001` implementation slice is intentionally smaller than full Lean/Coq/Isabelle integration.

It should establish the architecture with:

- the two v1 artifact contracts;
- strict canonical/digest/path/dependency validation;
- a verifier-profile registry;
- one deterministic in-process mock formal verifier adapter used only to exercise the trust/admission contract;
- deterministic report generation;
- negative/adversarial tests;
- AXIOM Verify integration as a new artifact class;
- explicit non-authority regression coverage;
- documentation registration only after the design and implementation plan have both passed their review gates.

The mock adapter is not a claim of mathematical capability. It exists to verify the substrate contract before adding a real theorem prover and external process/isolation complexity.

A future real-prover slice may introduce one narrowly pinned adapter only after its executable provenance, dependency closure, deterministic statement fingerprinting, environment contract, resource controls, and isolation posture are independently specified and tested.

---

## 14. Acceptance requirements for the substrate

The first implementation plan must include tests demonstrating at least:

1. A valid deterministic fixture produces `VERIFIED` with exact expected domain-separated digests.
2. Changed statement bytes fail.
3. Changed proof bytes fail.
4. Changed dependency bytes fail.
5. Missing dependency fails closed.
6. Duplicate or unsorted artifact/dependency/premise/non-claim/source-reference entries fail closed.
7. Unknown verifier profile produces `UNSUPPORTED`.
8. Verifier-profile digest mismatch fails closed.
9. Redundant adapter/verifier/executable/configuration/resource-policy binding mismatch fails closed.
10. Invalid or ambiguous artifact paths fail closed.
11. Oversized manifest, artifact count, artifact size, dependency count, and transcript fail closed according to the declared resource policy.
12. Statement fingerprint mismatch fails closed.
13. Adapter output outside the bounded contract fails closed.
14. Repeated qualification runs for the same exact fixture/profile produce the same semantic result and transcript digest; a deliberately nondeterministic test adapter is ineligible for `VERIFIED` evidence.
15. A fabricated JSON report containing `VERIFIED` is insufficient for Mesh policy consumption without accepted evidence/provenance binding of `verification_artifact_digest`.
16. A genuine verified-proof artifact cannot mint a capability, widen a mandate, consume an unrelated approval, or directly authorize an external effect.
17. Human-facing `VERIFIED` output always preserves the formal-verification-versus-external-truth non-claim.
18. `REJECTED`, `UNSUPPORTED`, and `ERROR` remain distinguishable.
19. Changing only run-specific metadata cannot change the core semantic verification artifact.

---

## 15. Non-goals

`FORMAL-001` does not attempt to:

- formalize all human mathematics;
- choose a universal theorem prover;
- certify Lean, Coq, Isabelle, HOL, Metamath, SMT solvers, or any other system as globally sound;
- prove external-world facts merely by formalizing them;
- automatically accept model-generated axioms;
- create a universal truth score;
- create an autonomous scientific authority;
- let proof validity replace legal, ethical, institutional, consent, or policy requirements;
- permit theorem-prover network access during high-assurance verification;
- ship arbitrary external prover execution before runner isolation/resource controls are established;
- promote any capability in `mesh/config/capabilities.json` merely because this design exists;
- make AXIOM Verify an authority client.

---

## 16. Future extension path

After the v1 substrate is proven with deterministic fixtures, future slices may add, one at a time:

- a narrowly pinned real theorem-prover adapter;
- proof-carrying software/safety cases;
- verified transformations between formal representations;
- cross-verifier checking of the same theorem;
- independently maintained verifier-profile trust sets;
- formalized policy fragments where appropriate;
- machine-generated candidate proofs checked by independent kernels;
- content-addressed formal mathematics libraries;
- dependency/proof graphs suitable for selective disclosure and distributed replication;
- reproducible research bundles binding empirical datasets, model assumptions, formal statements, and proofs without collapsing empirical evidence into theorem validity.

Each extension retains the same constitutional boundary:

> **The generator proposes. The verifier checks. Evidence records the result. Policy decides whether that evidence is sufficient for a defined purpose. Existing authority gates decide whether an effect may occur.**

---

## 17. Design conclusion

Formal mathematics can become a high-trust reasoning substrate for AXIOM-MESH only if the system is precise about what is actually being verified.

The v1 architecture therefore binds:

```text
exact statement
+ exact proof bytes
+ exact dependency closure
+ exact verifier/kernel profile
+ exact configuration
+ exact resource policy
= exact bounded verification claim
```

That claim can be independently reproduced and consumed as evidence.

It cannot silently become a claim about reality and it cannot become permission.

The durable AXIOM-MESH principle is:

> **Verify mechanically what can be mechanically verified; bind every assumption and dependency that makes the verification meaningful; expose what remains empirical or uncertain; never let verification itself widen authority.**
