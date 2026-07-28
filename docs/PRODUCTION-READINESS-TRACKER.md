# AXIOM-MESH Production Readiness Tracker

**Updated:** 2026-07-28

**Release candidate:** 0.11.0

**Overall decision:** **Not production-promoted**

This tracker records evidence, not aspiration. A gate is `Pass` only when its
artifact is reproducible and tied to the release commit or image digest.

## Current gate status

| Gate | Status | Evidence | Remaining action |
|---|---|---|---|
| Source integrity | Pass | Verified clean-room tree and package checksums | Publish release provenance |
| Capability claims | Pass | Registry, generated status, claim-marker checks | Maintain on every change |
| Kernel tests | Pass | 31-test suite in [GitHub run 30375390450](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30375390450) | Require on protected `main` |
| Host production drill | Pass | Real four-process supervisor test in the same run | Preserve on every runtime change |
| Container source policy | Pass | Dockerfile/Compose static release gate | Maintain digest pin |
| Container image build | Pass | Digest-pinned build in [GitHub run 30375390450](https://github.com/Zoverions/AXIOM-MESH/actions/runs/30375390450) | Record released image digest |
| Composed container drill | Pass | Readiness, authenticated operations, and teardown in the same run | Repeat for release commit |
| Dependency audit | Pass | Root and kernel lock audits in the same run | Maintain required check |
| Backup and restore | Implemented, drill pending | Unit/integration coverage | Run disposable-host exercise |
| Observability | Implemented locally | Bounded metrics and authenticated operations tests | Integrate external collector |
| SLO and capacity | Pending | No controlled load baseline | Define profile and measure |
| Credential rotation | Pending | Provisioning is implemented | Run trust-update and rollback drill |
| Independent security review | Pending | Internal evidence only | Commission scoped review |
| Incident response | Partial | Security and rollback policies exist | Run tabletop exercise |
| Release governance | Partial | `main` is default; legacy line renamed; clean release verifier exists | Protect branch and approve dossier |

## Promotion blockers

The following block production promotion:

1. no measured load, latency, saturation, or restart baseline;
2. no deployment-host backup/restore and credential-rotation drill;
3. no independent review of the supported kernel and deployment policy;
4. no host- or orchestrator-enforced deny-egress evidence;
5. no protected default branch or approved release dossier;
6. no documented revocation inventory for credentials exposed in deprecated
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
