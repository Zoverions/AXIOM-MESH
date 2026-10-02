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
- exact host-plan digest;
- the host-fact provenance class used by that plan;
- exact release-manifest digest;
- the sorted artifact SHA-256 set and evidence references;
- request timestamp;
- maximum installed-state observation age;
- hard-zero mutation/authority/network/runtime effects.

Only a candidate whose host plan was derived from `live-local-observation` can reach an install/repair/upgrade/recovery review result. Supplied or synthetic facts remain useful for testing/planning, but fail closed for a live session.

This still does not prove the host plan itself is valid; a future privileged composition must validate and bind the actual upstream plan object.

Likewise, `release_manifest_digest`, `artifact_sha256s`, and `artifact_evidence_refs` are bound identities only: this layer does not call `verifyInstallReleaseManifest` or `verifyInstallReleaseArtifact`. The current unbound byte check returns `manifest_bound: false`. A future privileged composition must not gate on it, and must instead require the manifest-bound artifact verification from #1914 (`manifest_bound: true` with a matching `manifest_digest`).

## Installed-state observation

`axiom-installed-state-observation.v0` records bounded evidence about what is already present:

- install record: absent / complete / partial / failed / unknown;
- exact installed profile/release/source/plan/manifest identities where available;
- relation to desired release: absent / same / ancestor / descendant / diverged / unknown;
- relation evidence for nontrivial lineage claims;
- secret state;
- data state;
- service state;
- readiness state;
- bounded evidence references;
- self-digest;
- hard-zero mutation/authority/runtime effects.

The observation carries no secret values, tokens, key bytes, environment dump, raw service configuration, or artifact bytes. For a live session it must also be captured **at or after** the candidate request and remain within the candidate's bounded observation-age window; pre-request, stale, future, or unknown state fails closed.

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

Only when the installed release is externally evidenced as an **ancestor** of the desired release and the profile matches.

This is not automatic update permission.

### RECOVERY_REVIEW

Used when retained state exists without an install record, or an incomplete/failed install cannot safely be treated as exact repair.

Recovery decisions must preserve newer revocation/consent/authority history and remain separately authorized.

### Hard stops

- `STOP_NONLIVE_PLAN`: synthetic/supplied plan facts cannot enter live install review.
- `STOP_PARTIAL_SECRET_STATE`: partial secret state is never auto-repaired.
- `STOP_NEWER_PRESENT`: no automatic downgrade.
- `STOP_DIVERGED`: no hidden branch/fork replacement.
- `STOP_CONFLICT`: inconsistent identity/runtime evidence.
- `STOP_UNCERTAIN`: stale/future/unknown state.

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
