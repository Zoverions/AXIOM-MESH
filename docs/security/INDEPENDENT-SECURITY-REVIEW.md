# AXIOM-MESH Independent Security Review Intake

**Build:** `0.12.0-dev.0`

**Status:** implemented review-intake contract; authentic independent review
pending

**Updated:** 2026-07-29

This procedure defines how an accountable external reviewer submits the
current build's threat-model and configuration findings. The repository
verifies the package; it does not perform or simulate the independent review.
SEC-002 stays pending until real source, configuration, and deployment inputs
are reviewed and an authentic signed ledger passes this command.

## Review policy and trust model

The intake has three public signing identities:

1. **Policy authority.** Selects one source revision, immutable image digest,
   exact reviewed artifacts, scope, independent reviewer, and exception
   approver. The verifier receives this public key as a separate file through a
   trusted channel; it is never accepted from the policy it authorizes.
2. **Independent reviewer.** Signs the completed findings ledger and verifies
   the remediation evidence for every closed finding. The authority-pinned
   record includes reviewer identity, organization, engagement reference,
   public key, and an explicit independence declaration.
3. **Exception approver.** Represents the accountable deployment/release risk
   owner. This identity is separate from the reviewer and signs every accepted
   lesser-risk exception. A reviewer cannot approve the residual risk that the
   same reviewer assessed.

All three keys must be distinct Ed25519 public keys. Key identifiers end with
the first 16 hexadecimal characters of the SHA-256 digest of the canonical
SPKI PEM. The policy authority signature covers every policy field. Changing
the build, reviewer, thresholds, artifacts, or scope invalidates it.

The policy schema is
`axiom-independent-security-review-policy.v1`. It is exact-field,
secret-free, valid for at most 120 days, unexpired at intake, and pins the
current package version `0.12.0-dev.0` with:

- a 40-character lowercase source revision;
- an immutable `sha256:<64 lowercase hexadecimal>` image digest;
- review evidence no more than 30 days old;
- exceptions no longer than 90 days;
- exceptions permitted only for `medium` and `low` findings.

The exact review scope, in order, is:

1. `authentication-authorization`;
2. `container-policy`;
3. `credential-trust`;
4. `evidence-integrity`;
5. `kernel`;
6. `provider-boundary`;
7. `recovery-rotation`;
8. `release-governance`.

The policy also pins eight ordered review artifacts. Each entry has exactly
`type`, `reference`, and `sha256`. Digests must be valid and unique:

| Type | Required current-build input |
|---|---|
| `capability_registry` | `mesh/config/capabilities.json`, including the generated registry marker relationship |
| `container_policy` | Dockerfile, compact/unit Compose policy, and deny-egress enforcement material composed as the engagement's immutable artifact |
| `deployment_policy` | current production configuration and platform-specific pilot manifest, excluding secret values |
| `kernel_source` | exact supported `mesh/` source tree for the pinned revision |
| `pilot_evidence_contract` | dossier, v2 detail-contract, and exact-package verifier source plus current runbook |
| `release_verifier` | release, registry, status, documentation, workflow, and supply-chain gate sources |
| `security_policy` | root/GitHub security policy and current incident/credential procedures |
| `threat_model` | [`CURRENT-BUILD-THREAT-MODEL.md`](CURRENT-BUILD-THREAT-MODEL.md) at the pinned revision |

For a multi-file type, the engagement owner must create an immutable,
deterministically enumerated archive or manifest and pin its digest. A
reference cannot silently point to mutable “latest” bytes. The authority
should independently reproduce every digest before signing. References may
identify controlled offline evidence storage, but must not contain embedded
credentials, query secrets, fragments, or newlines.

## Review execution

The independent reviewer must retrieve the pinned artifacts without relying
only on a repository maintainer's summary. At minimum, the engagement must:

- review production-path source and all configuration that can change the
  effective trust boundary;
- use automated analysis appropriate to Node.js, container/deployment policy,
  credentials, dependencies, and workflow configuration;
- manually trace abuse cases and privileged data/effect flows;
- examine negative-path tests and determine whether they exercise the claimed
  fail-closed conditions;
- compare the capability registry, release claims, security policy, threat
  model, and deployment behavior for contradictions;
- record material limitations rather than treating inaccessible systems or
  excluded testing as passed.

The exact methodology flags are `source_reviewed`,
`configuration_reviewed`, `automated_analysis`, `manual_abuse_cases`, and
`negative_path_tests_reviewed`; all must be `true`. `limitations` must contain
at least one explicit bounded statement. “No limitations” may be a statement
only if that assertion is factually supportable; an unavailable pilot host,
provider backend, custodian, or external receiver is a limitation.

The engagement should test the abuse cases and invariants in the current-build
threat model. Review of the repository candidate does not establish the
security of a pilot orchestrator, secret manager, receiver, storage medium, or
independently operated host that was not included in the pinned artifacts.

## Findings and disposition contract

The signed ledger schema is
`axiom-independent-security-review-findings.v1`. It claims only
`independent-security-review-submitted`, identifies the policy and review,
copies the exact current build, reviewer, scope, and artifact inventory,
records the methodology, and includes ordered findings, a recomputed summary,
residual risk, and the reviewer attestation.

Findings are ordered by identifiers such as `sec-0001`. Every finding contains
exactly:

- `finding_id`;
- severity: `critical`, `high`, `medium`, or `low`;
- a bounded title and category;
- one or more sorted affected-component identifiers;
- status: `closed` or `approved_exception`;
- a named remediation/risk `owner`;
- canonical `opened_at`;
- a status-specific `disposition`.

There is no informational finding class that can evade ownership. If the
reviewer wants to retain an observation in the ledger, it must receive an
explicit severity, owner, and disposition. Duplicate or unordered identifiers
fail.

### Closed findings

A closed finding uses disposition type `remediated` and must record:

- immutable remediation reference and digest;
- `verified_by` equal to the policy-authorized independent reviewer;
- verification time between finding opening and review completion;
- a separate immutable verification reference and digest.

The remediation and verification digests must differ. A maintainer's assertion
that a change was made is not verification. Critical and high findings can be
admitted only through this closed, independently reverified path.

### Approved exceptions

Only medium and low findings may use status `approved_exception`. Its
disposition type is `approved-exception` and records a substantive rationale,
containment, future expiry, and exception approval. The exception:

- retains a named finding owner;
- is signed by the separately policy-pinned exception approver;
- binds policy, review, build, finding identity/context, severity, owner,
  rationale, containment, approval time, and expiry;
- is signed after the finding opens and no later than review completion;
- remains unexpired at verification;
- expires after review completion and within the policy's maximum 90-day
  interval.

An expired exception, a non-expiring exception, a reviewer-signed exception,
or a modified rationale/containment fails. The policy cannot allow exceptions
for critical/high findings.

### Summary and residual risk

The verifier independently recomputes total findings, the count for each
severity, closed findings, approved exceptions, and unresolved critical/high
counts. Submitted counts must match exactly. Both unresolved critical and
unresolved high must be zero.

Residual risk must be explicitly documented. The ordered
`accepted_exception_ids` list must exactly equal the findings using approved
exceptions. This prevents an exception from existing in findings while being
omitted from the signed residual-risk statement.

The reviewer signs the entire ledger after all exception attestations are
present. Any later change to scope, inputs, finding text, owner, disposition,
summary, or risk invalidates that signature.

## Fail-closed verification

The final policy and ledger JSON files must contain canonical JSON bytes
exactly, with no added whitespace or trailing newline. They must be regular,
non-symbolic-link files no larger than 2 MiB. The separately obtained
authority public key must be a bounded regular file.

From the repository root:

```bash
npm run security-review:verify -- \
  /secure-review/findings.json \
  /secure-review/review-policy.json \
  /separate-trust/review-policy-authority-public.pem
```

The equivalent command from `mesh/` is:

```bash
node src/independent-security-review.mjs verify \
  /secure-review/findings.json \
  /secure-review/review-policy.json \
  /separate-trust/review-policy-authority-public.pem
```

The verifier checks:

1. canonical bounded files and absence of secret fields/material;
2. exact schemas, fields, identifiers, canonical timestamps, current version,
   build revision, and image digest;
3. current policy validity and thresholds that cannot weaken the hard-coded
   promotion gates;
4. complete ordered scope and exact unique policy-pinned artifacts;
5. distinct reviewer, exception-approver, and policy-authority identities;
6. key fingerprints and the authority signature from the separately supplied
   trust anchor;
7. exact ledger reviewer, scope, artifacts, and complete methodology;
8. ordered unique findings, named owners, chronology, and status-specific
   disposition;
9. external remediation verification for every closed finding;
10. independent, current, bounded exception approval for every accepted
    medium/low risk;
11. recomputed severity/disposition summary, zero unresolved critical/high,
    and exact residual-risk exception references;
12. reviewer signature across the final ledger.

A successful result reports the review/policy identifiers, canonical ledger
SHA-256, exact build, finding totals, exception total, verified reviewer
attestation, and `accepted-for-security-promotion-review`. It always reports
`production_promoted: false`.

For the pilot package, the `independent_security_review` v2 evidence detail
`report_sha256` should be the successful result's `ledger_sha256`, and its
summary fields must match the same ledger. The ledger remains a separately
retained authoritative review artifact; the pilot evidence envelope binds its
digest and independent-review summary into the exact 13-file package.

No warning-only mode, default trust anchor, ignored extension, exception
switch, cross-build acceptance, or self-authorizing reviewer exists. A failed
review intake must not be converted into a manual pass by editing the signed
files. Correct the underlying issue, issue a new policy when necessary, and
obtain new signatures.

## Conformance evidence and non-claims

Run the repository-owned verifier exercise with:

```bash
npm run security-review:drill \
  > /tmp/axiom-independent-security-review-verifier-conformance-evidence.json
```

The drill creates ephemeral policy-authority, reviewer, exception-approver,
and conformance keys. Its synthetic ledger includes independently verified
closed critical/high examples and a separately approved, expiring medium
exception. It proves rejection of:

- a different build;
- missing review scope;
- an anonymous remediation owner;
- an unresolved critical finding;
- an expired exception;
- altered exception approval;
- findings-summary drift;
- an altered reviewer attestation;
- a forbidden secret field.

The result is signed as
`axiom-independent-security-review-verifier-conformance-evidence.v1`.
Protected CI retains
`axiom-independent-security-review-verifier-conformance-evidence-<commit>` for
90 days. Its required declarations are:

- `synthetic_fixture: true`;
- `independent_security_review_performed: false`;
- `production_promotion_claimed: false`.

This artifact proves only that the intake contract behaves as tested at that
commit. It does not establish reviewer independence, reviewer competence,
source or deployment security, remediation quality, a live pilot, or
production readiness.

Archive the authentic authority-signed policy, separately distributed
authority key, exact reviewed artifacts/manifests, completed ledger, reviewer
and exception public keys, remediation/verification artifacts, command output,
engagement report, and final promotion decision under the deployment's
retention policy. Do not rely on the repository's 90-day synthetic CI artifact
retention for an external assessment.

Any change to a pinned artifact, build, security-relevant configuration, or
review disposition requires new immutable bytes and signatures. Changes to
authentication, policy, grant semantics, Sandbox authority, Grid/evidence
integrity, encryption, recovery, transport, provider trust, node/sync
authority, container policy, release governance, or review schemas reopen the
affected review scope. A successful intake makes the authentic review eligible
for the separate promotion decision; it never makes that decision itself.
