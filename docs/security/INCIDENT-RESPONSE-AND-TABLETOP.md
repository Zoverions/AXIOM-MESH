# Incident Response and Automated Tabletop

**Status date:** 2026-07-28

**Scope:** AXIOM-MESH 0.11 production candidate and its protected CI

**Deployment claim:** automated candidate exercise only; no live incident,
named on-call roster, external notification, or pilot-platform exercise is
claimed

AXIOM-MESH treats incident response as a coordinated evidence system rather
than a document-only gate. The machine-readable policy in
[`mesh/config/incident-response.json`](../../mesh/config/incident-response.json)
defines deterministic severity, response targets, independent roles,
authority-reducing actions, and closure conditions. Protected CI composes the
existing recovery, backup, restart, resilience, credential-rotation, and
transport, data-key-rotation drills into one signed tabletop record tied to
the same source revision.

This model follows the risk-management integration described by
[NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final) and the
standardized identification, coordination, remediation, recovery, and
tracking practices described by
[CISA's incident and vulnerability response playbooks](https://www.cisa.gov/topics/cybersecurity-best-practices/executive-order-improving-nations-cybersecurity).
Those references guide the lifecycle; AXIOM-MESH response targets and
authority rules remain project policy.

## Severity and activation

Classification is fail-closed and signal based. Each supported signal belongs
to exactly one severity, and the classifier selects the highest-impact
matching signal. Multiple lower-impact signals cannot average down a critical
integrity or containment failure.

| Severity | Example candidate signals | Activation | Containment target | Update cadence |
|---|---|---:|---:|---:|
| SEV-1 Critical | confirmed service-identity compromise, evidence-integrity failure, Sandbox boundary failure, unauthorized high-risk effect | 15 minutes | 60 minutes | 30 minutes |
| SEV-2 High | suspected credential exposure, data-key exposure, supply-chain compromise, failed verified backup, sustained candidate outage | 30 minutes | 4 hours | 60 minutes |
| SEV-3 Moderate | dependency unavailability, failed rotation, resource exhaustion, single-service degradation | 4 hours | 8 hours | 4 hours |
| SEV-4 Low | rejected attack, policy near miss, documentation gap | 24 hours | 5 days | 24 hours |

Unknown signals are not silently assigned a low severity. The policy must be
updated and reviewed before the classifier accepts them.

These are candidate operational objectives, not legal notification
deadlines. Deployment owners must separately determine contractual,
regulatory, insurer, law-enforcement, and affected-person obligations for
their jurisdiction and data.

## Command roles and independence

Every exercise or incident record assigns all six roles:

- **Incident commander** — owns declaration, priorities, decision log, and
  handoffs.
- **Security lead** — owns credential, identity, policy, trust, and
  containment decisions.
- **Operations lead** — owns service isolation, rollback, restore, and
  readiness verification.
- **Communications lead** — owns approved internal and stakeholder updates
  without exposing investigative or secret material.
- **Evidence custodian** — preserves immutable source artifacts, timestamps,
  manifests, custody changes, and digests before remediation.
- **Independent reviewer** — cannot be the incident commander; verifies
  closure criteria and owns retrospective challenge.

The automated exercise uses distinct role placeholders so CI proves the
separation rule without inventing people. A pilot must replace them with a
maintained primary/deputy roster, contact paths, availability expectations,
and an approved external-notification decision tree.

## Containment authority

Policy actions are typed as `reduce`, `preserve`, `recover`, `communicate`, or
`review`. No incident action may expand capability, bypass policy, generate
new credentials inside the runtime, or waive an existing production gate.

Supported actions include:

- declare the incident and freeze unrelated change;
- disable Gateway ingress;
- revoke API principals;
- rotate all four service identities and their trust records;
- preserve forensic state before changes;
- restore a verified encrypted backup;
- rotate the data-protection key when its custody may be affected;
- quarantine a node or roll back to a compatible signed release;
- issue bounded stakeholder updates;
- schedule an independently reviewed retrospective.

Emergency governance remains authority reducing, expiring, logged, and
reviewed. It does not substitute for incident command, credential
revocation, recovery verification, or communications.

## Automated tabletop scenario

Protected CI runs the scenario **Suspected operator credential exposure with
Grid integrity alarm**. The integrity alarm makes the incident SEV-1 even
though the credential signal alone is SEV-2.

The exercise must prove:

1. acknowledgement and classification within the SEV-1 activation target;
2. independent assignment of every required command role;
3. selection of every SEV-1 action with no authority-expanding effect;
4. forensic evidence preservation before containment begins;
5. verified containment within the declared target;
6. initial, status, and resolution communications within cadence;
7. recovery verification before closure;
8. a retrospective due after closure and within seven days;
9. every closure condition recorded as true;
10. seven independently signed control artifacts verify and match the same
    source revision.

The linked controls are:

| Control evidence | Incident-response use |
|---|---|
| Recovery drill | exact-digest encrypted restore, tamper rejection, replacement preservation, rollback |
| Backup lifecycle drill | verified retained media, recoverable quarantine, restore from retained backup |
| SLO/restart drill | controlled stop, restart, readiness, and post-restart service verification |
| Resilience drill | bounded request pressure, dependency degradation, fail-closed process loss, restart, and state preservation |
| Transport lifecycle drill | mutual TLS peer identity, retired-leaf rejection, rotation, runtime verification, and exact rollback |
| Credential-rotation drill | service-identity and operator-token replacement, retired-token rejection, rollback |
| Data-key-rotation drill | protected-state re-encryption, wrong-key rejection, restore, interruption recovery, rollback |

The tabletop artifact stores only each companion artifact's schema, SHA-256
digest, source revision, and expected artifact name. It does not embed
credentials, payloads, private keys, host paths, or the full companion
records.

## Signed evidence and CI gate

`mesh/src/incident-tabletop-drill.mjs` cryptographically verifies all seven
companion artifacts before evaluating the tabletop. A disposable Grid
Ed25519 identity signs
`axiom-incident-tabletop-evidence.v1`. Verification recomputes the severity,
timeline, response targets, role separation, action authority, communication
cadence, linked-control bindings, and closure checks before validating the
signature.

Protected CI uploads
`axiom-incident-tabletop-evidence-<commit>` for 90 days. The release verifier
requires the policy, workflow command, artifact name, canonical runbook, and
operator documentation. Policy drift, a stale companion revision, a missing
role, a delayed response, a missing action, an expanding action, a failed
closure condition, or a modified signed record fails the gate.

## Live response procedure

For a suspected live incident:

1. Preserve the alert, time source, source revision, running image digest,
   relevant signed evidence, and current configuration digests.
2. Declare an incident identifier and assign the six roles. Avoid placing
   secrets or sensitive investigative facts in broadly visible channels.
3. Classify using the machine-readable signals. If the signal is unknown,
   hold at the more restrictive plausible severity until reviewed.
4. Freeze unrelated changes. Preserve state before rotation, rollback,
   restore, or deletion.
5. Apply the minimum authority-reducing containment actions. Record operator,
   time, reason, input digest, result, and rollback path.
6. Rotate affected credentials or keys through supported offline workflows.
   Do not restore retired credentials as a convenience.
7. Recover only from verified, compatible, encrypted media or a signed
   release. Preserve replaced state as an incident artifact.
8. Verify readiness, authorization rejection, evidence integrity, and data
   reconciliation before reopening ingress.
9. Communicate at the selected cadence and record the deployment owner's
   notification determination.
10. Close only after every policy condition passes and the independent
    reviewer accepts the evidence package.

If containment or recovery cannot be verified, remain closed or degraded. A
deadline does not justify unsafe reopening.

## Closure and improvement

Closure requires verified containment, verified recovery, an evidence
manifest, communication records, a scheduled retrospective, and independent
review. The retrospective records:

- detection source and earliest supported occurrence;
- scope, impact, trust boundaries, and data classes;
- decisions, alternative actions, and elapsed response times;
- evidence custody and unresolved uncertainty;
- root and contributing causes;
- controls that worked or failed;
- corrective owners, deadlines, and release-gate effects;
- whether playbooks, alerts, tests, policy, or training must change.

Corrective actions remain open work until independently verified. A completed
meeting is not evidence that remediation succeeded.

## Residual limitations and pilot repetition

The current artifact is an automated candidate-host tabletop. It does not
prove that named humans can be reached, that external communications are
approved, that legal determinations are correct, or that recovery works under
pilot infrastructure and custody. It also does not commission the independent
security review.

Before production promotion, pilot operators must conduct a facilitated
exercise using the live roster and deployment-specific notification tree,
repeat the linked controls under pilot secret and backup custody, record
lessons and corrective owners, and retain an independently reviewed exercise
package tied to the deployed image digest.
