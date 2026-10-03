# Install Session v0 — inert state classification before privilege

**Status:** IN-PROGRESS, inert/evidence-only  
**Tracking:** #1901  
**Authority:** none. This layer cannot mutate a host, install a package, create credentials, start a service, enroll a node, or authorize a later effect.

## Why this exists

A safe installer cannot treat every rerun as a fresh install.

The same command may encounter:

- a truly clean machine;
- the exact desired release already healthy;
- the same release installed but not ready;
- an older compatible lineage;
- a newer release that must never be downgraded automatically;
- a divergent install;
- retained data or secrets after runtime removal;
- a partial/failed install;
- an ambiguous or stale observation.

Install Session v0 makes that classification explicit **before** any future privileged executor exists.

It composes the #1901 sequence:

```text
non-mutating host plan
      +
signed release verification
      +
artifact-byte evidence
      +
installed-state observation
      |
      v
inert install-session decision
      |
      +--> INSTALL_REVIEW
      +--> VERIFY_NOOP
      +--> REPAIR_REVIEW
      +--> UPGRADE_REVIEW
      +--> RECOVERY_REVIEW
      +--> STOP_*
```

Every output is review/evidence only. There is no `EXECUTE` result.

## Candidate

`axiom-install-session-candidate.v0` binds:

- one session ID;
- exact install profile;
- exact runtime strategy;
- desired release ID and source revision;
- desired kernel version, the signed `minimum_compatible_kernel` and `rollback_mode`;
- whether the host plan has no blockers (`host_candidate_compatible`);
- exact host-plan digest;
- the host-fact provenance class used by that plan;
- exact release-manifest digest;
- the sorted artifact SHA-256 set and evidence references;
- request timestamp;
- maximum installed-state observation age;
- hard-zero mutation/authority/network/runtime effects.

Only a candidate whose host plan was derived from `live-local-observation` can reach an install/repair/upgrade/recovery review result. Supplied or synthetic facts remain useful for testing/planning, but fail closed for a live session.

`validateInstallSessionCandidate` and `assessInstallSession` are structural: on their own they do not prove the host plan, the release, or the artifact bytes. Use the verified-input constructor below to derive a candidate from original evidence.

## Verified-input constructor

`deriveInstallSessionCandidate(input)` and `createInstallSession(input)` (#1913 re-scope) build the candidate from original evidence, never from reports:

```text
{ sessionId, hostPlan, releasePackage, expectedReleaseManifestDigest,
  trustedSigners, artifactBytes, requestedAt, evaluatedAt,
  maxObservationAgeSeconds }            // + observedInstall for createInstallSession
```

- Every input is snapshotted once with `snapshotDelegationPlainData`, and only the snapshot is read. No getter, Proxy trap or `toString` runs. Byte views are copied from their actual window through the intrinsic typed-array getters, and shared or detached storage is rejected. Unknown fields fail with `ValidationError`, including `releaseVerification`, `artifactProofs` and any other pre-computed report.
- The host plan is checked by main's `validateHostInstallPlan` (pure; host-fact collection is never reached).
- The constructor itself calls `verifyInstallReleaseManifest` on the original signed package, with repository policy defaults only, and uses only that result object. A verified result produced by other code is never accepted as evidence.
- **Trust-root gate.** `trustedSigners` is caller-supplied, and a caller can register its own key under the real `key_id`, so `release_id` and `signer_key_id` are labels and comparing them binds nothing. The gate therefore requires the verified `manifest_digest` to equal `expectedReleaseManifestDigest`, an independently trusted digest pinned by the operator outside the package. Main has no repository-pinned release signer set (signer custody is external), so this is the only available trust-root binding. A caller that supplies both the signers and the expected digest from the same untrusted source has bound nothing.
- Every artifact that the verified manifest requires for the plan's profile must have bytes, and no other bytes are accepted. Each one is checked only through the manifest-bound `verifyInstallReleaseArtifact(verified, artifact_id, bytes)` (#1914). The proof must carry `manifest_bound: true` and the expected `manifest_digest`; its `release_id` is checked only for consistency. The unbound 2-argument form is never used.
- Artifact IDs or locators containing Birth, Genesis or Spark tokens are rejected: the standard install inventory never carries that material.

`deriveInstallSessionCandidate` returns the frozen candidate and its `candidate_digest`, which the installed-state observer must embed (see below). `createInstallSession` derives the candidate again from the same evidence, classifies the observation with `assessInstallSession`, and returns an `axiom-install-session.v0` envelope (`mesh/config/verified-install-session-v0.schema.json`) with the candidate, decision, sorted artifact proofs, a `session_digest`, and zero credential, service, host, authority, network and runtime effect.

`validateVerifiedInstallSession` checks that envelope's structure and digests only. It proves integrity, not origin (`origin_verified: false`). A later step must re-run `createInstallSession` on original evidence rather than trust a supplied session.

## Installed-state observation

`axiom-installed-state-observation.v0` records bounded evidence about what is already present:

- install record: absent / complete / partial / failed / unknown;
- exact installed profile/release/source/plan/manifest identities where available;
- relation to desired release: absent / same / ancestor / descendant / diverged / unknown;
- relation evidence for nontrivial lineage claims;
- the bound `candidate_digest`, the `observation_source`, the installed kernel version (`installed_kernel_version`, required for a complete record, null when absent) and `legacy_proof_state_detected`;
- secret state;
- data state;
- service state;
- readiness state;
- bounded evidence references;
- self-digest;
- hard-zero mutation/authority/runtime effects.

The observation carries no secret values, tokens, key bytes, environment dump, raw service configuration, or artifact bytes. For a live session it must also be captured **at or after** the candidate request and remain within the candidate's bounded observation-age window; pre-request, stale, future, or unknown state fails closed.

**T3: candidate binding.** The observation must carry the `candidate_digest` of the exact candidate it describes. A missing, malformed or mismatched digest is a `ValidationError`, never a decision. So is a replayed one, bound to another session, request time or observation window. **T4: live-local source.** The observation's `observation_source` must be `live-local-observation`. Supplied, synthetic, remote, unknown or missing sources are a `ValidationError`, not a stop decision. Both rules hold in `assessInstallSession` as well as in the constructor.

The observation's origin is still caller-asserted: `observation_source` is a declared label, not an attestation. Decisions therefore keep `observation_bound: false`, and no later privileged step may gate on a decision until the observation's provenance is authenticated.

`validateInstallSessionDecision` proves integrity, not origin: a relabelled decision with a recomputed digest still validates, so any later step must re-run `assessInstallSession` on the candidate and observation rather than trust a supplied decision.

An observation that claims an **ancestor** relation while reporting the desired release id or desired source revision is contradictory and yields `STOP_CONFLICT` (`ancestor-claim-matches-desired-identity`), never `UPGRADE_REVIEW`.

## Decision semantics

### INSTALL_REVIEW

Only when the install record, secrets, data and running services are all proven absent (or services stopped/absent) and the host plan is live-local.

This means “a later installer may continue admission review.” It does not authorize mutation.

### VERIFY_NOOP

Only when the complete installed state exactly matches:

- profile;
- release ID;
- source revision;
- host plan digest;
- release-manifest digest;

and readiness is already `ready`.

A rerun should verify rather than reinstall.

### REPAIR_REVIEW

Used for the exact desired install when identity matches but readiness is not established, or the exact same release has a partial/failed install record with no partial-secret hard stop.

A future repair path must still be separately admitted.

### UPGRADE_REVIEW

Only when the installed release is caller-asserted, with an evidence reference, as an **ancestor** of the desired release; the profile matches; the installed kernel is provably older than the desired kernel and at least the signed `minimum_compatible_kernel`; the rollback mode is not `migration-specific`; and the installed release is `ready` and `running`. Otherwise the result is `STOP_UPGRADE_UNPROVEN`.

This is not automatic update permission.

### RECOVERY_REVIEW

Used when retained state exists without an install record, or an incomplete/failed install cannot safely be treated as exact repair.

Recovery decisions must preserve newer revocation/consent/authority history and remain separately authorized.

### Hard stops

- `STOP_NONLIVE_PLAN`: synthetic/supplied plan facts cannot enter live install review.
- `STOP_HOST_BLOCKED`: the host plan has blockers.
- `STOP_LEGACY_PROOF_STATE`: legacy proof state is not current install identity.
- `STOP_UPGRADE_UNPROVEN`: an ancestor claim without proven kernel order, minimum compatibility, bounded rollback posture or health.
- `STOP_PARTIAL_SECRET_STATE`: partial secret state is never auto-repaired, including when a `complete` install record (historical evidence) now observes only part of its secret set. A complete record with absent secrets or data is rejected as invalid evidence, and a `ready` claim requires complete secrets and present data.
- `STOP_NEWER_PRESENT`: no automatic downgrade. This also applies when the observed installed kernel is newer than the desired kernel, even if the observation declares an ancestor relation.
- `STOP_DIVERGED`: no hidden branch/fork replacement.
- `STOP_CONFLICT`: inconsistent identity/runtime evidence.
- `STOP_UNCERTAIN`: stale/future/unknown state.

### Kernel version order

Kernel versions use exact semver syntax with no build metadata and no leading zeros in numeric identifiers (`0.11.0-01` is rejected as ambiguous). The MAJOR.MINOR.PATCH order comes from `mesh/src/lib/node-runtime-version.mjs`; no second comparator is added. Pre-release identifiers are compared for equality only. When two versions have the same core but different pre-releases (including a release versus a pre-release), their order is treated as not established: the result is never `UPGRADE_REVIEW`, and a `same` claim on a complete record becomes `STOP_CONFLICT`.

## First-node proof relationship

The isolated first-node fixture demonstrates an important separation: structural installer completion is not runtime readiness.

Install Session v0 therefore does not infer `ready` from an install record. Readiness is a separate observed state. A later integration pass also must not rewrite historical installer evidence.

Likewise, retained data or a complete secret set without an install record is not “absent.” It routes to recovery review.

## Non-claims

This slice does not implement:

- privileged host mutation;
- user/package/runtime installation;
- Docker/WSL2 setup;
- credential generation;
- service startup;
- update or rollback execution;
- runtime readiness probing;
- release-lineage discovery;
- automatic repair;
- node admission;
- network exposure;
- Windows support;
- production promotion;
- birth/Spark capability.

It exists so those later effects cannot silently collapse into “just rerun the installer.”
