# Pilot Deployment Dossier Verification

**Build:** `0.12.0-dev.2`

**Status:** implemented evidence-intake control; no live pilot or production
promotion is claimed

**Updated:** 2026-07-29

This runbook defines the supported way to submit deployment-specific evidence
for the controlled AXIOM-MESH pilot. The verifier in
`mesh/src/pilot-dossier.mjs` accepts one authority-signed review policy, one
exact pilot dossier, and the policy authority's independently distributed
Ed25519 public key. It rejects incomplete, stale, altered, cross-build, or
secret-bearing input.

Verification is an intake decision. A successful result is
`accepted-for-promotion-review` and always includes
`production_promoted: false`. It does not deploy AXIOM-MESH, inspect a remote
platform, retrieve evidence artifacts, approve an exception, publish a
release, or change the readiness decision. The accountable promotion body
must still inspect the referenced artifacts and record a separate decision.

## Current-build boundary

The command and schemas in this document apply only to the supported
`0.12.0-dev.2` development line. A policy pins:

- the exact semantic kernel version;
- one 40-character source revision;
- one immutable `sha256:` container image digest;
- a validity period no longer than 120 days;
- the current SLO, recovery, custody, evidence, and review requirements;
- five distinct reviewer identities.

The dossier must repeat the exact policy-pinned build tuple. A source revision
or image rebuilt after the policy was signed requires a new policy and a new
dossier. Evidence from `v0.11.0`, an archived source tree, another image, or a
dirty local build cannot be mixed into a current dossier.

The policy schema is `axiom-pilot-review-policy.v1`. The submitted dossier
schema is `axiom-pilot-deployment-dossier.v1`. Individual approvals sign
`axiom-pilot-dossier-approval.v1` payloads. CI produces only
`axiom-pilot-dossier-verifier-conformance-evidence.v1`, which exercises the
parser, signatures, and rejection paths with synthetic identities. That
conformance artifact is never admissible as live-pilot evidence.

## Trust and signature model

Trust starts outside the dossier. The promotion authority creates an Ed25519
policy-authority key using the organization's approved custody system. Its
public key is distributed separately from the policy and dossier. The
authority signs the canonical policy object after all reviewer public keys,
requirements, dates, and build identifiers are fixed.

The policy names these roles in this exact order:

1. `release_manager`;
2. `platform_operator`;
3. `security_reviewer`;
4. `data_recovery_reviewer`;
5. `independent_reviewer`.

Every role must have a distinct reviewer identifier, Ed25519 public key, and
key identifier. A reviewer key cannot be reused by another role or by the
policy authority. The verifier derives the public-key fingerprint and rejects
a key identifier that does not match it.

The five reviewers sign the same dossier digest, but each signature also binds
the reviewer's role, reviewer identifier, decision, and timestamp. Approval is
therefore not transferable between roles. Removing or changing a measurement,
custody receipt, evidence digest, deployment flag, build identity, or other
dossier field after review invalidates every approval.

The authority public key, reviewer public keys, signed policy, and dossier may
be retained with the evidence package. Private keys, API tokens, provider
responses containing secret values, data-protection keys, passwords, and
unencrypted user data must not be present. The verifier rejects private-key
PEM data, bearer material, and direct secret-bearing fields before evaluating
the submission.

## Review policy requirements

The signed policy contains the following minimums. It may be stricter, but it
cannot weaken them:

| Requirement | Current minimum or maximum |
|---|---|
| Continuous observation | at least 720 hours |
| Gateway availability and submitted intent success ratio | each at least 99.5 percent |
| Successful low-risk intents | at least 1,000 |
| Low-risk intent latency | p95 no more than 2,000 milliseconds |
| Evidence loss after an acknowledged mutation | exactly zero |
| Backup recovery point | no more than 1,440 minutes |
| Restore recovery time | no more than 240 minutes |
| Critical alert acknowledgement | no more than 30 minutes |
| Deprecated-history dispositions | exactly 32 entries |
| Dossier age after the observation ends | no more than 30 days |

The 720-hour window is the current 30-day pilot target. Short protected-CI
load tests and disposable recovery drills remain useful candidate controls,
but they do not satisfy this window. Measurements must come from the
policy-pinned pilot deployment and declared traffic profile.

The policy must be issued before it is used, must not be expired, and may not
be backdated beyond its allowed duration. Reviewers must sign after the
observation ends and no later than dossier generation. Dossier generation
must occur after the observation and within the policy's evidence-age limit.

## Deployment declaration

The dossier describes one `isolated-non-public-pilot` deployment using the
`independent-service-units` topology. The service inventory is exactly
Gateway, Grid, Hypervisor, and Sandbox. It also asserts all of the following:

- no public ingress;
- enforced deny-egress policy;
- enforced CPU and memory resource limits;
- pilot-owned telemetry and alert receivers;
- the pilot's actual provider adapter rather than the repository reference
  adapter;
- scheduled restore from pilot-owned media.

The platform and region identifiers must be non-secret operational labels.
The deployment time must precede the measurement window. If a topology,
provider adapter, resource policy, public boundary, or image changes during
the window, close that observation and start a new policy-bound observation.
Do not merge separate deployment generations into one availability result.

These fields are reviewer-attested declarations, not remote discovery. The
verifier cannot determine whether a cloud firewall, container runtime, host
route table, HSM policy, receiver retention rule, or resource limit was
actually enforced. Reviewers must validate those facts against the hashed
source artifacts before signing.

## Required evidence inventory

The dossier contains these 13 entries in exact order:

| Type | Required schema | Purpose |
|---|---|---|
| `deployment_manifest` | `axiom-pilot-deployment-manifest.v2` | Immutable topology, platform policy, and non-secret configuration |
| `image_provenance` | `axiom-pilot-image-provenance.v2` | Source, image, SBOM, and build provenance |
| `availability_observation` | `axiom-pilot-availability-evidence.v2` | Continuous 30-day availability calculation |
| `capacity_measurement` | `axiom-pilot-capacity-evidence.v2` | Declared traffic, resource enforcement, throughput, errors, and latency |
| `external_telemetry` | `axiom-pilot-telemetry-evidence.v2` | Pilot-owned collection, retention, alert delivery, and acknowledgement |
| `provider_assessment` | `axiom-pilot-provider-assessment.v2` | Actual adapter, workload identity, backend authorization, rotation, and rollback |
| `custody_assessment` | `axiom-pilot-custody-assessment.v2` | External key custody and non-exportability review |
| `scheduled_restore` | `axiom-pilot-scheduled-restore-evidence.v2` | Restore from pilot-owned media with measured RPO and RTO |
| `credential_rotation` | `axiom-pilot-credential-rotation-evidence.v2` | Pilot-custody service and operator credential lifecycle |
| `data_key_rotation` | `axiom-pilot-data-key-rotation-evidence.v2` | Pilot secret-manager re-encryption, rollback, and retirement |
| `credential_history_attestations` | `axiom-pilot-credential-history-attestations.v2` | Disposition of all 32 deprecated-history candidates |
| `incident_tabletop` | `axiom-pilot-incident-tabletop-evidence.v2` | Facilitated named-roster exercise and deployment notification decisions |
| `independent_security_review` | `axiom-pilot-independent-security-review.v2` | Independent review scope, findings, dispositions, and residual risks |

Each entry records a stable reference, unique SHA-256 digest, observation
timestamp, exact source revision, exact image digest, `passed` disposition,
and `independently_verified: true`. References may point to an approved
evidence store during metadata preflight; they must not embed credentials.
The dossier-only verifier checks metadata, uniqueness, build binding,
chronology, inventory, and reviewer signatures. It does not download or parse
the referenced artifact. Authentic promotion intake must use the offline
package verifier below, which requires local canonical evidence files and
checks their exact bytes and signatures.

Before signing, reviewers must retrieve every artifact from the authoritative
store, recompute its SHA-256 digest, validate its own schema and signature
where applicable, and compare it with the deployment. An inaccessible
artifact, unexplained redaction, unresolved finding, altered digest, or
unknown signer is not `passed`.

The existing protected-CI artifacts can support provenance and show how the
candidate controls behave. They cannot replace deployment-specific
availability, capacity, provider, custody, telemetry, scheduled recovery,
credential-history, facilitated incident, or independent-review evidence.

## Offline exact-inventory package verification

The supported offline package removes network retrieval and mutable-reference
risk from final intake. The signed dossier is the package manifest; there is no
second inventory that could disagree with it. The package directory is exact:

```text
pilot-evidence-package/
|-- policy.json
|-- dossier.json
`-- evidence/
    |-- deployment_manifest.json
    |-- image_provenance.json
    |-- availability_observation.json
    |-- capacity_measurement.json
    |-- external_telemetry.json
    |-- provider_assessment.json
    |-- custody_assessment.json
    |-- scheduled_restore.json
    |-- credential_rotation.json
    |-- data_key_rotation.json
    |-- credential_history_attestations.json
    |-- incident_tabletop.json
    `-- independent_security_review.json
```

No other file, directory, symbolic link, alternate filename, archive wrapper,
or extra nested filesystem entry is accepted. `policy.json` and `dossier.json`
are bounded to 4 MiB each; each evidence envelope is bounded to 8 MiB; the
complete package is bounded to 64 MiB.

All 15 JSON files must be the exact UTF-8 result of canonical JSON encoding:
sorted object keys and no byte-order mark, indentation, comments, trailing
newline, duplicate-key representation, or other noncanonical bytes. The
dossier reference for each entry must be exactly
`evidence/<evidence_type>.json`, and its `sha256:` value must match the raw
canonical file bytes.

Each evidence envelope uses its evidence-specific schema and this exact common
shape:

```json
{
  "attestation": {},
  "deployment_id": "pilot_identifier",
  "details": {},
  "evidence_type": "deployment_manifest",
  "observed_at": "2026-07-29T00:00:00.000Z",
  "producer": {
    "reviewer_id": "named_reviewer",
    "role": "platform_operator"
  },
  "schema": "axiom-pilot-deployment-manifest.v2",
  "signer": {
    "key_id": "pilot-platform-operator:0123456789abcdef"
  },
  "source": {
    "image_digest": "sha256:<64 lowercase hexadecimal characters>",
    "kernel_version": "0.12.0-dev.2",
    "source_revision": "<40 lowercase hexadecimal characters>"
  },
  "status": "passed",
  "summary": "A concise secret-free result for independent review.",
  "version": 2
}
```

The example shows common structure, not valid evidence or signatures.
`details` is governed by the exact type-specific v2 contract below. Unknown,
missing, mistyped, reordered-inventory, threshold-drifted, or contradictory
detail fields fail before signature acceptance. The complete envelope,
including `details`, is secret-scanned and signed canonically.

The policy assigns evidence signing responsibility:

| Evidence | Required policy-pinned producer |
|---|---|
| Deployment manifest | Platform operator |
| Image provenance | Release manager |
| Availability, capacity, and external telemetry | Platform operator |
| Provider and custody assessments | Security reviewer |
| Scheduled restore, credential rotation, and data-key rotation | Data/recovery reviewer |
| Deprecated credential-history attestations | Security reviewer |
| Facilitated incident tabletop | Independent reviewer |
| Independent security review | Independent reviewer |

An envelope signed by another valid reviewer is still rejected. Its schema,
type, deployment identifier, version, status, observation time, kernel
version, source revision, image digest, producer identifier, signer key, and
signature must all agree with the policy and dossier.

### Exact v2 detail contracts

Every `details` object has an exact field inventory. These contracts bind
human-reviewed claims to the dossier instead of accepting an arbitrary signed
object:

| Evidence | Enforced detail relationship |
|---|---|
| Deployment manifest | Environment, platform, region, topology, four service units, network boundary, resource limits, receivers, provider, and restore declarations equal the dossier deployment |
| Image provenance | Exact source revision and image digest plus four distinct SHA-256 source/SBOM/provenance/container records; reproducibility and image signature are verified |
| Availability observation | Observation timestamps, duration, continuity, availability, intent counts, and zero acknowledged evidence loss equal the dossier |
| Capacity measurement | Profile is identified and peak concurrency is positive; intent counts, p95 latency, and resource enforcement equal the dossier; overload, dependency recovery, and saturation checks pass |
| External telemetry | Named owner and retention policy, authenticated metrics and alert transport, fixed vocabulary, secret omission, dossier-bound acknowledgement time, and delivery receipts |
| Provider assessment | Identified digest-pinned adapter, dossier-custodied backend and workload identity, least privilege, pinned signer, nonce freshness, rotation, rollback, and private-generation cleanup |
| Custody assessment | All five custody controls exactly repeat the dossier backend, custodian, workload identity, exportability, rotation, and receipt digests; non-exportability and duty separation pass |
| Scheduled restore | Identified pilot-owned media and backup digest, exact observation timestamp, dossier-bound RPO/RTO, wrong-key rejection, restored-state integrity, and rollback |
| Credential rotation | Dossier-custodied identity backend, exact four service identities, operator and telemetry token rotation, retired-credential rejection, signer lineage, rollback, and secret omission |
| Data-key rotation | Dossier-custodied data-key backend; live state, retained backups, and recovery copies are re-encrypted; wrong-key rejection, restore, interruption recovery, rollback, and old-key retirement pass |
| Credential-history attestations | The policy-pinned 32 entries are all verified or independently not-applicable, none remain pending or reintroduced, and the external disposition ledger is complete |
| Incident tabletop | Facilitated exercise, at least two unique named responders, policy-pinned independent reviewer, notification decisions, evidence, containment, recovery, communications, closure, and zero unresolved critical/high findings |
| Independent security review | Policy-pinned reviewer and organization, exact review scope, report digest, finding counts, zero unresolved critical/high findings, remediation ownership, and documented residual risk |

For current-build authentic evidence, `report_sha256` is the
`ledger_sha256` returned after successful verification of the canonical signed
findings ledger. The envelope finding counts and unresolved fields must match
that ledger. The authoritative ledger, review policy, separately obtained
policy-authority key, remediation/verification evidence, and exceptions remain
outside the exact 13-file pilot package under the engagement's controlled
retention. See the
[current-build threat model](../security/CURRENT-BUILD-THREAT-MODEL.md) and
[independent security review intake](../security/INDEPENDENT-SECURITY-REVIEW.md).

Run final offline package verification with the authority public key obtained
through the separate trusted channel:

```bash
npm run pilot:package:verify -- \
  /secure-review/pilot-evidence-package \
  /separate-trust/pilot-policy-authority-public.pem
```

A successful result reports two canonical control files, 13 canonical evidence
files, detail-contract version 2, the byte count, producer-role distribution,
the exact build, the `axiom-pilot-evidence-package-verification.v2` result
schema, and `production_promoted: false`. Package verification does not remove
the need for reviewers to understand whether each signed `details` object
actually supports its disposition. It makes the bytes they reviewed immutable,
self-contained, role-authenticated, and machine-bound to the approved dossier.

## Custody and trust-root inventory

The dossier names four distinct public trust-root digests:

- Grid;
- transport CA;
- secret-provider signer;
- policy-provider signer.

It also requires five custody controls:

- data-protection key;
- transport CA;
- service identities;
- secret-provider signer;
- policy-provider signer.

Each custody item identifies the approved backend, accountable custodian,
workload identity, rotation observation, and a unique receipt reference and
digest. `exportable` must be `false`, and `rotation_observed` must be `true`.
Receipt timestamps must fall within the observation and review interval.

The provider secret and policy signers remain separate trust identities. The
inventory of four trust roots must use unique digests. If a backend permits
plaintext export, if one identity can impersonate two reviewer or provider
roles, if custody depends on a repository file adapter, or if rotation was not
observed against the pilot, the dossier is not admissible.

Custody receipts should describe key generation location, authorization
policy, workload-identity binding, version/rotation event, recovery or escrow
decision, audit-retention location, and retirement disposition without
revealing key material.

## Authoring and verification procedure

Use a controlled evidence workspace outside the repository and outside the
runtime's mounted secret directories.

1. The release manager fixes the source revision and immutable image digest.
2. The policy authority records current thresholds and five reviewer public
   identities, signs the policy, and distributes the authority public key
   through a separate trusted channel.
3. The platform operator deploys only the pinned image to the isolated,
   non-public pilot and records the manifest digest.
4. Operators collect the 30-day observation and all deployment-specific
   evidence. Restarted observations are not joined across a material build or
   policy change.
5. The release manager composes only hashes, references, measurements, public
   trust-root digests, and non-secret declarations into the dossier. For final
   intake, references use the exact local `evidence/<type>.json` paths.
6. Each reviewer independently retrieves and validates the applicable source
   artifacts, then signs the shared dossier digest.
7. A verifier obtains the policy authority key separately, first runs the
   dossier-only command if a metadata preflight is useful, then runs the exact
   offline package command for authentic intake.

From the repository root:

```bash
npm run pilot:dossier:verify -- \
  /secure-review/pilot-dossier.json \
  /secure-review/pilot-review-policy.json \
  /secure-review/pilot-policy-authority-public.pem
```

From `mesh/`, the equivalent command is:

```bash
node src/pilot-dossier.mjs verify \
  /secure-review/pilot-dossier.json \
  /secure-review/pilot-review-policy.json \
  /secure-review/pilot-policy-authority-public.pem
```

A valid dossier-only result identifies the dossier, policy, source revision, image digest,
13 evidence entries, five approvals, and the
`accepted-for-promotion-review` intake status. Archive the command output with
the input objects and referenced evidence. Do not modify the signed files to
add notes; record review minutes and the eventual promotion decision as
separate artifacts.

The dossier-only command accepts approved external references and remains a
preflight tool. The package command is the stronger final-intake path because
it also verifies exact local files, canonical encoding, raw hashes, common
envelope fields, responsible producer roles, and each envelope signature.

## Fail-closed verification sequence

The verifier performs these checks in order:

1. exact policy fields, schema, identifiers, dates, and current validity;
2. build tuple and thresholds that do not weaken current promotion gates;
3. exact ordered reviewer roster with distinct reviewer and public-key
   identities;
4. reviewer public-key fingerprints and separately supplied authority key;
5. authority signature over the complete policy;
6. secret-material rejection and exact dossier fields;
7. exact policy, claim, build, generation, deployment, and observation
   binding;
8. SLO, recovery, alert, evidence-loss, and credential-history measurements;
9. unique trust-root inventory and non-exportable rotated custody receipts;
10. exact 13-item evidence inventory, schema, unique hash, build, time, and
    independent-verification declarations;
11. exact five-role approval inventory and Ed25519 signature over the common
    dossier digest;
12. explicit non-promotion output.

Unknown or extra fields fail instead of being ignored. This prevents a
producer and reviewer from assigning different meanings to an extension.
Schemas must be revised deliberately if the contract changes.

No exception switch, warning-only mode, synthetic-success fallback, embedded
default authority, or self-authorizing reviewer exists. Operational urgency
does not bypass missing evidence, bad chronology, expired policy, inadequate
measurements, or a signature failure.

## Conformance drill and protected CI

Run the repository-owned conformance exercise with:

```bash
npm run pilot:dossier:drill \
  > /tmp/axiom-pilot-dossier-verifier-conformance-evidence.json
```

The drill creates ephemeral synthetic identities and synthetic metadata in
memory. It proves that an internally consistent fixture verifies and that a
wrong image, altered approval, missing evidence entry, and forbidden secret
field fail closed. It signs a secret-free result declaring:

- `synthetic_fixture: true`;
- `live_pilot_observed: false`;
- `production_promotion_claimed: false`.

Protected CI retains
`axiom-pilot-dossier-verifier-conformance-evidence-<commit>` for 90 days. This
artifact establishes that the verifier behaves consistently at the commit. It
is not one of the 13 pilot evidence entries, cannot satisfy the 720-hour
window, and must not be relabeled as deployment evidence.

Protected CI also runs:

```bash
npm run pilot:package:drill \
  > /tmp/axiom-pilot-evidence-package-verifier-conformance-evidence.json
```

That drill constructs an exact synthetic package and proves rejection of an
unexpected file, missing evidence file, noncanonical JSON, wrong producer
role, dossier-inconsistent v2 detail contract, and secret-bearing detail. The
signed artifact
`axiom-pilot-evidence-package-verifier-conformance-evidence-<commit>` uses
`axiom-pilot-evidence-package-verifier-conformance-evidence.v2` and declares a
synthetic fixture, no live pilot observation, and no production promotion. It
is verifier evidence, not one of the 13 admissible pilot files.

Protected CI separately runs `npm run security-review:drill`. That signed
synthetic artifact exercises the authoritative findings-ledger intake used to
produce `report_sha256`; it explicitly states that no independent security
review was performed and cannot satisfy the pilot evidence entry.

## Reassessment and retention

Any change to authentication, layered policy, grants, Sandbox authority, Grid
schema, encryption, backups, transport trust, provider protocol, service
topology, container base, secret handling, evidence schemas, SLO thresholds,
or release gates invalidates the affected policy and reopens review. A prior
dossier never promotes a later source revision or image.

Retain the signed policy, separately distributed authority public key,
dossier, five reviewer public keys, verifier output, all referenced artifacts,
hash-verification logs, review minutes, findings, exceptions, and final
decision under the organization's evidence-retention and access policy. The
repository's 90-day CI retention is not a default for pilot or audit records.

If evidence must be redacted, hash and review the preserved authoritative
artifact, then publish a separately identified redacted derivative. Do not
replace the artifact behind an existing reference or reuse its digest.

## Pilot repetition and non-claims

This implementation closes the repository-owned metadata and offline-package
evidence-intake gaps. It gives operators a strict, signed, build-bound package
for the pilot work already required by the readiness tracker.

It does not claim that the pilot exists, that any external provider or receiver
has been configured, that 720 hours have elapsed, that 32 external credential
dispositions are complete, that a restore or facilitated incident exercise
occurred, that an independent reviewer approved the system, or that production
promotion is warranted. Those facts can be supplied only by accountable
operators and reviewers using the actual deployment and external systems.

Until an authentic dossier and exact offline evidence package pass technical
intake and the separate promotion decision, the project remains **not
production-promoted**.
