# AXIOM-MESH Production Readiness Tracker

**Updated:** 2026-07-28

**Release candidate:** 0.11.0

**Overall decision:** **Not production-promoted**

This tracker records evidence, not aspiration. A gate is `Pass` only when its
artifact is reproducible and tied to the release commit or image digest.

## Current gate status

| Gate | Status | Evidence | Remaining action |
|---|---|---|---|
| Source integrity | Pass | Verified clean-room tree, source checksum, SBOM, and provenance | Maintain for every release |
| Capability claims | Pass | Registry, generated status, claim-marker checks | Maintain on every change |
| Kernel tests | Pass | Protected kernel suite in the [Clean Kernel workflow](https://github.com/Zoverions/AXIOM-MESH/actions/workflows/kernel.yml) | Require on protected `main` |
| Host production drill | Pass | Real four-process supervisor test in the same run | Preserve on every runtime change |
| Container source policy | Pass | Dockerfile/Compose static release gate | Maintain digest pin |
| Container image build | Pass | Digest-pinned build in [GitHub run 30376178779](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30376178779) | Publish immutable image digest before pilot |
| Composed container drill | Pass | Readiness, authenticated operations, and teardown in the same run | Repeat for future release commits |
| Dependency audit | Pass | Root and kernel lock audits in the same run | Maintain required check |
| Backup and restore | Pass | Protected CI provisions a disposable production workspace, exercises encrypted backup, tamper/live-lock/exact-digest rejection, restore and rollback, and uploads signed evidence | Repeat on every runtime change; add scheduled pilot-media restoration |
| Observability | Implemented locally | Bounded metrics and authenticated operations tests | Integrate external collector |
| SLO and capacity | Pending | No controlled load baseline | Define profile and measure |
| Credential rotation | Pending | Provisioning is implemented | Run trust-update and rollback drill |
| Independent security review | Pending | Internal evidence only | Commission scoped review |
| Incident response | Partial | Security and rollback policies exist | Run tabletop exercise |
| Release governance | Pass | Protected `main`, release verifier, and [v0.11.0 dossier](https://github.com/Zoverions/AXIOM-MESH/releases/tag/v0.11.0) | Maintain for every release |

## Promotion blockers

The following block production promotion:

1. no measured load, latency, saturation, or restart baseline;
2. no deployment-host credential-rotation drill or scheduled pilot-media restore;
3. no independent review of the supported kernel and deployment policy;
4. no host- or orchestrator-enforced deny-egress evidence;
5. no documented revocation inventory for credentials exposed in deprecated
   history.

## Gate owners

| Area | Accountable role | Required reviewer |
|---|---|---|
| Release and repository | Release manager | Security reviewer |
| Runtime and reliability | Platform operator | Independent operator |
| Security and credentials | Security owner | Maintainer not authoring the change |
| Data and recovery | Grid/data owner | Platform operator |
| Documentation and claims | Documentation owner | Release manager |

Names may change; roles and independent review requirements do not.

## Evidence retention

Promotion evidence must identify:

- source commit and clean/dirty state;
- container image digest and base-image digest;
- capability-registry, policy, operator-surface, and documentation digests;
- test and workflow identifiers;
- deployment configuration without secret values;
- backup/restore, rotation, and incident-drill timestamps;
- approvers, exceptions, and exception expiries.

Secret values, private keys, production tokens, and unencrypted user data must
never enter the evidence package.

## Reassessment rule

Any change to authentication, policy, grants, Sandbox authority, Grid schema,
encryption, backup, service topology, container base, secret handling, or
release gates reopens the relevant gate. Production promotion is not permanent
evidence for later commits.
