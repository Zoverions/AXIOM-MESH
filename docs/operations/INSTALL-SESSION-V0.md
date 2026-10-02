# AXIOM-MESH Install Session v0

**Applies to:** installer-convergence programme #1901  
**Tracking:** #1904  
**Status:** inert pre-mutation classification only; no host-mutating installer, service start, node deployment, or production promotion  
**Authority:** none.

## Purpose

Install Session v0 is the deterministic boundary between:

1. a validated non-mutating host plan;
2. a verified signed release/install manifest;
3. exact locally verified artifact bytes; and
4. an observation of existing installation state.

It answers one narrow question:

> Given those exact inputs, what preparation state may a future installer consider next?

It does **not** authorize that preparation and performs no mutation.

## Pipeline

```text
host facts
  -> axiom-host-install-plan.v1
  -> signed release verification
  -> exact local artifact-byte proofs
  -> observed existing-install state
  -> axiom-install-session.v0
        |
        +-- verify-noop
        +-- prepare-install
        +-- prepare-repair
        +-- prepare-upgrade
        +-- stop
```

Every output fixes:

- `host_mutation_authorized: false`;
- `credential_effect: none`;
- `service_start_effect: none`;
- `authority_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`.

A future privileged bootstrapper would still require its own separately reviewed authority and execution boundary.

## Exact evidence bindings

A session binds:

- target profile;
- exact host-plan digest;
- exact release ID, kernel version, source revision, and signed-manifest digest;
- exact locally verified artifact proof digests and artifact SHA-256 values;
- exact existing-install observation digest;
- canonical observation time;
- derived classification and next preparation;
- reasons and blockers.

Artifact proof v0 re-verifies the signed release package and exact local bytes before producing its inert evidence record. A proof from another release, manifest, verification instant, or target profile is not interchangeable.

## Classification

| Classification | Meaning | Derived preparation |
| --- | --- | --- |
| `absent` | No current install state was observed | `prepare-install` |
| `healthy-same` | Exact target release lineage is present and healthy | `verify-noop` |
| `healthy-older` | A healthy complete install is older than the target | `prepare-upgrade` only when compatibility permits; otherwise `stop` |
| `partial-same` | Exact target lineage is partial or unhealthy | `prepare-repair` |
| `conflicting-partial` | Partial/current evidence conflicts with target lineage | `stop` |
| `newer-or-unknown` | Existing state is newer, incomparable, or unknown | `stop` |
| `legacy-proof-state` | Historical first-node/prototype markers are present without current install identity | `stop` |

There is no automatic downgrade.

For an older install, direct upgrade preparation additionally requires:

- installed version at or above the signed release's minimum compatible kernel; and
- rollback posture `in-place-compatible` or `backup-restore-required`.

A generic `migration-specific` declaration alone does not establish a safe direct upgrade path.

## First-node proof reconciliation

The isolated first-node proof remains valuable evidence but is not a second production installer contract.

Install Session v0 deliberately preserves these distinctions:

- prototype `/srv/axiom` H-stage markers are classified as legacy proof state unless a later explicit migration establishes current identity;
- proof-rendered Compose is not assumed equivalent to the current canonical service topology;
- the proof's auxiliary chain writer is not Grid evidence;
- synthetic fixture images/models can prove installer behavior while remaining runtime-blocked;
- prototype proof receipts do not become current install receipts by field resemblance;
- current Mesh provisioning remains the source of runtime credential and service-topology semantics.

## Birth / Genesis exclusion

The standard installer evidence path rejects artifact identities or locators that identify Birth, Genesis, or Spark material.

The standard installer must not contain or accept:

- Spark authorization private keys;
- private birth/Genesis implementation modules;
- parent-to-child transfer implementation;
- authority to mint/sign Spark authorization;
- automatic birth activation.

Ordinary node/runtime identity remains a separate concern.

## Currentness

The session observation must:

- occur after the release verification instant;
- occur before the verified release expires; and
- not predate the observed existing-install evidence.

Artifact proofs are bound to the same release-verification instant used by the session.

## Plain-data boundary

The implementation rejects:

- Proxies;
- accessors;
- hidden/non-enumerable fields;
- symbol keys;
- sparse arrays;
- custom array state;
- unknown object fields.

This keeps classification inputs canonical and prevents hidden state from affecting authority-adjacent evidence.

## Non-claims

Install Session v0 does not:

- install packages;
- mutate a filesystem;
- create credentials;
- start services;
- invoke Docker/OCI tooling;
- perform SSH/WSL operations;
- download artifacts;
- expose a public port;
- enroll a node;
- activate Axiom One;
- grant Mesh or network authority;
- prove a node is deployed;
- promote any release to production.

The next live installer stage remains gated on separately reviewed privileged execution and disposable-host evidence.
