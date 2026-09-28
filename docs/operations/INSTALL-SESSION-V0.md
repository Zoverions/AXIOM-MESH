# Install Session v0 — converged, verified-input, inert classification

**Status:** LAB-GRADE candidate; not a host installer or production promotion.  
**Tracking:** #1901, #1905, #1909, #1913.  
**Authority:** none. Every result remains a report for review, never permission.

## Why this exists

There is one state-classification engine: `assessInstallSession` in
`mesh/src/lib/install-session.mjs`. It retains #1905's exact-state, readiness,
retained-state, partial-secret and live-versus-synthetic distinctions. The
`createInstallSession` constructor brings the useful #1909 verification,
legacy-proof and bounded-upgrade requirements into that same engine.

The dependency order is host planning, signed release admission, exact local
artifact verification, installed-state classification, and a future separately
reviewed privileged executor. These are separate claims, even when an inert
constructor composes their checks.

## Verified-input constructor

`createInstallSession` requires exactly these fields:

```javascript
createInstallSession({
  sessionId,
  hostPlan,
  releasePackage,
  trustedSigners,
  artifactBytes,
  observedInstall,
  requestedAt,
  evaluatedAt,
  maxObservationAgeSeconds
});
```

`releasePackage` is the original signed package, not a report that says a
signature was valid. `trustedSigners` is the external active Ed25519 signer
inventory with the exact `release-installer-authority` role. Signer custody is
outside the package. `artifactBytes` is a plain record from artifact ID to
Buffer or Uint8Array, not locators, digest assertions, or saved proof records.

The constructor:

1. Takes descriptor-safe snapshots of plain input data and copies the actual
   bounded byte windows. It rejects proxies, accessors, cyclic/custom data and
   shared byte storage; it does not invoke a caller-supplied verifier callback.
2. Validates the original host plan against current repository policy.
3. Re-verifies the original signed release against the external signer inventory,
   the evaluation time, current control-plane digests, toolchain and migrations.
   Caller overrides of those current-policy defaults are not accepted here.
4. Derives every artifact required for the selected profile from that verified
   manifest. The byte inventory must match exactly: no omitted required artifact,
   foreign profile substitution, duplicate identity, or extra artifact.
5. Verifies exact byte length and SHA-256 for each required artifact before
   deriving candidate evidence and calling the single state-classification engine.
6. Returns a frozen metadata-only session report with zero mutation, credential,
   service-start, authority, network and runtime effects.

Birth/Genesis/Spark identity or locator tokens are rejected in the standard
signed inventory. This preserves the naming boundary; it is not a claim that a
filename filter can detect arbitrary semantic content in a payload.

A serialized `releaseVerification`, `artifactProofs`, self-digest, positive
verification flag, or caller-selected policy cannot substitute for these inputs.
The constructor neither fetches artifacts nor probes the host.

## Reports and structural helpers are not credentials

`assessInstallSession`, candidate/observation/decision validators, and their
self-digests remain deterministic structural policy helpers. They do not
independently authenticate a release, artifact, observer or transport.

The constructor's returned `axiom-install-session.v0` object records checks
performed during this invocation. Its self-digest detects content drift; it is
not a signed or unforgeable portable admission credential. A later consumer must
not accept a copied report as proof that this constructor ran. Reconstruct from
original inputs, or use a separately reviewed authenticated evidence boundary.
No privileged consumer is added by this change.

The external signer inventory must come from trusted custody. Observation source
labels must come from a trusted collector. Accepting an input that says
`live-local-observation` does not itself establish observation truth or hardware
attestation. Unit tests use synthetic fixtures, including declared-live labels;
they are not fresh-host scans or evidence of installed runtime readiness.

## Candidate

`axiom-install-session-candidate.v0` binds the session, profile, runtime strategy,
desired release/source/kernel, exact host-plan and release-manifest digests,
host-fact provenance, host compatibility, required artifact digests/references,
request time and maximum observation age. The constructor derives the minimum
compatible kernel and rollback mode from the now-verified signed manifest.

The candidate, observation and decision schemas remain closed. This is a
convergence of unmerged v0 proposals, not backward compatibility with both
competing draft shapes. Callers must migrate to the required fields; omitted
provenance, kernel or legacy-proof information is not defaulted to a safe value.

## Installed-state observation

`axiom-installed-state-observation.v0` records an explicit observation source,
legacy-proof flag, installed kernel version and the existing record, exact
profile/release/source/plan/manifest identity, lineage relation, secrets, data,
services and readiness. It includes a self-digest but no secret contents.

The observation must belong to the same session, be captured at or after the
request, not be from the future, and fit the bounded age window of 1–3600 seconds.
Unknown state, unknown provenance and contradictory readiness remain fail closed.
An absent install record cannot carry installed identity or claim readiness.
A complete record needs complete secrets and present data; ready requires running
services. A complete record alone does not establish readiness.

## Decision semantics

| Result | Required meaning |
|---|---|
| `INSTALL_REVIEW` | Record, data and secrets are absent; services absent/stopped; compatible live-labelled host and observation. Still no install permission. |
| `VERIFY_NOOP` | Exact profile/release/source/kernel/plan/manifest identity, complete secrets, present data, running services and observed ready state. |
| `REPAIR_REVIEW` | Exact same release is incomplete, failed or not ready, without a partial-secret stop. No repair is executed. |
| `UPGRADE_REVIEW` | Same profile, evidenced ancestor, strictly older unambiguous version at or above the signed minimum, ready/running state and bounded rollback posture. |
| `RECOVERY_REVIEW` | Retained data/secrets without a record, or incomplete state that cannot qualify as exact repair. No state is overwritten. |
| `STOP_NONLIVE_PLAN` / `STOP_NONLIVE_OBSERVATION` | Supplied or synthetic evidence cannot become a live review path. |
| `STOP_HOST_BLOCKED` | The validated host plan has compatibility blockers. |
| `STOP_LEGACY_PROOF_STATE` | Legacy first-node proof markers are not current installation identity. |
| `STOP_UPGRADE_UNPROVEN` | Upgrade minimum, ordering, health or rollback evidence is insufficient. Migration-specific rollback requires a later reviewed path. |
| `STOP_PARTIAL_SECRET_STATE` | Partial secrets are not automatically repaired or recovered. |
| `STOP_NEWER_PRESENT` | No automatic downgrade; a claimed ancestor relation cannot override a newer installed version. |
| `STOP_DIVERGED` / `STOP_CONFLICT` / `STOP_UNCERTAIN` | Divergence, conflicting identity, invalid session relationship, stale/future or unknown evidence. |

Version ordering handles prereleases and rejects ambiguous leading-zero numeric
components. A rollback declaration does not prove that a backup or restore was
performed. `backup-restore-required` can support review, not update execution.
All decisions preserve the hard-zero effect fields.

## First-node proof relationship

Historical prototype state, including the isolated `/srv/axiom` proof, remains
legacy evidence. It cannot satisfy a current receipt, deployment or ready claim.
The converged observation carries that distinction explicitly. Synthetic proof
artifacts can exercise validation but their non-live provenance stops live
review. Installer completion is never silently rewritten as runtime readiness.

The old #1909 `prepare-install`, `prepare-repair` and `prepare-upgrade` categories
are represented by the single engine's corresponding review results, not a second
executor or permission vocabulary. Its legacy/version/compatibility protections
are retained alongside #1905's more detailed retained-state and secret handling.

## Foundation and packaging boundary

The Ubuntu 24.04 x64/arm64 planner describes a supported host installation
profile. It is not an operating-system or hardware requirement for every mesh
participant. Capability-adaptive device participation remains separate.

Installing or selecting Matrix, presence, or an optional social module does not
confer circle admission, federation/publication permission, principal authority,
agent birth permission, or runtime activation. Membership and authorization
contracts and umbrella module packaging remain Cosmo's lanes. This work adds no
competing membership contract and no second installer.

## Verification

Run under a supported repository Node version:

```sh
node --test --test-reporter=spec mesh/test/install-session.test.mjs mesh/test/install-session-convergence.test.mjs mesh/test/install-session-schema.test.mjs
npm run check
npm run release:verify
```

The focused suite covers positive signed construction, all required bytes,
untrusted/wrong-role/revoked signers, modified/expired/future manifests, exact
profile membership, byte substitution, non-live evidence, legacy state, partial
secrets, currentness, compatible upgrades, no downgrade and zero effects.
Full CI must run on the exact review head using actual repository policies and
migrations. A local unit pass, a draft PR, a signature or a self-digest is not a
protected-CI pass or a production-readiness claim.

## Non-claims

No package acquisition, host mutation, user creation, credentials, service start,
network access, circle admission, principal authority, birth permission, runtime
activation, fresh-host installation, deployment or production promotion is
implemented. Release signing custody, observer authentication, lineage discovery,
backup/restore proof and privileged execution remain separately reviewed gates.
No production deployment or merge is authorized by this candidate.
