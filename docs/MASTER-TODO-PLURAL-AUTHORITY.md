# AXIOM-MESH Master Todo — Adaptive Assurance and Plural Authority

**Status:** long-horizon execution queue; subordinate to current production blockers and `docs/MASTER-TODO.md`

**Adopted:** 2026-08-03

**Current-build rule:** no item below changes the current `0.12.0-dev.3` capability status until exact registry, schema, implementation, test, review, and evidence updates are merged.

## Priority 0 — Protect current truth

- [ ] Close capability-to-evidence binding before adding new implemented governance claims.
- [ ] Require capability IDs to bind to named assertions rather than only shared file paths.
- [ ] Reject missing, non-existent, non-executable, stale, or capability-irrelevant evidence.
- [ ] Keep registry digest synchronized across every digest-bearing canonical document.
- [ ] Complete the authentic current-build pilot and independent security review.
- [ ] Update the current threat model for every new human, Circle, delegation, or assurance entry point.
- [ ] Preserve current non-claims for public federation, consensus, settlement, national infrastructure, and sovereign adoption.

## Priority 1 — Documentation integration

- [x] Define adaptive assurance and plural authority architecture.
- [x] Add the roadmap extension.
- [x] Add the long-horizon capability map.
- [x] Complete architecture and claims review.
- [ ] During the next canonical documentation reconciliation, integrate concise references into:
  - [ ] `README.md`;
  - [ ] `docs/ROADMAP.md`;
  - [ ] `docs/rebuild/PRODUCT-DEFINITION.md`;
  - [ ] `docs/rebuild/REQUIREMENTS.md`;
  - [ ] `CONSTITUTION.md` where appropriate;
  - [ ] `docs/README.md`;
  - [ ] `docs/PROJECT-STATUS-2026.md`;
  - [ ] `docs/PRODUCTION-READINESS-TRACKER.md` only as an explicit future non-claim;
  - [ ] future release notes.
- [ ] Add a documentation check that rejects a future governance capability being described as current without a matching registry status.
- [x] Add this package to the canonical document index and documentation-authority hierarchy.

## Priority 2 — Assurance requirements and terminology

- [ ] Decide final names and semantics for A0–A4 or replacement profiles.
- [ ] Define `required_assurance`, `attempted_assurance`, `achieved_assurance`, `failed_assurance`, and `unknown_assurance`.
- [ ] Define kernel, owner, Circle, institution, adapter, domain, and action-risk assurance floors.
- [ ] Specify deny-dominant assurance composition.
- [ ] Specify whether assurance profiles are ordered, partially ordered, or compositional.
- [ ] Define evidence obligations by profile.
- [ ] Define retention, encryption, disclosure, deletion, and legal-hold behavior by profile.
- [ ] Define degraded and unavailable verifier behavior.
- [ ] Define human-readable assurance and limitation explanations.
- [ ] Prohibit person-level global assurance or reputation scoring in the base architecture.

## Priority 3 — Finality and challenge model

- [ ] Define provisional, accepted, challengeable, stayed, appealed, reversed, superseded, expired, and finalized states.
- [ ] Separate local acceptance from collective finality.
- [ ] Define challenge windows and who may open them.
- [ ] Define what actions may proceed optimistically.
- [ ] Define rollback, compensation, and corrective transaction requirements.
- [ ] Define when irreversible effects require pre-execution assurance.
- [ ] Define visibility of conflicting finality claims across nodes or domains.
- [ ] Add tests proving finality labels do not silently change.

## Priority 4 — Retrospective reassessment

- [ ] Define reassessment record schema.
- [ ] Bind reassessment to original event ID, evidence set, reviewer, method, time, authority, outcome, and limitations.
- [ ] Define corroborated, partial, contradicted, unverifiable, accepted-despite-uncertainty, rejected, superseded, and reopened outcomes.
- [ ] Ensure later review cannot alter `assurance_at_execution`.
- [ ] Preserve reassessment through export, import, backup, restore, and causal exchange.
- [ ] Define competing reassessments and appeals.
- [ ] Add negative tests for retrospective assurance laundering.

## Priority 5 — Performance-oriented assurance mechanisms

- [ ] Specify lightweight receipts for A0/A1-like actions.
- [ ] Specify batched commitments for repetitive low-risk activity.
- [ ] Evaluate Merkle or equivalent aggregation without prematurely changing the evidence chain.
- [ ] Specify sampling policies and sampling evidence.
- [ ] Define anomaly-triggered escalation.
- [ ] Define cost, latency, value, privacy, reversibility, and irreversibility thresholds.
- [ ] Cache immutable executor, model, policy, and binary conformance evidence safely.
- [ ] Measure storage, latency, verification cost, correction rate, and undetected-error risk.
- [ ] Prove that optimization cannot bypass authority or silently downgrade assurance.

## Priority 6 — Circle identity and membership

- [ ] Define Circle identifier and trust-anchor model.
- [ ] Define invitation, acceptance, membership, device, term, expiry, suspension, and revocation records.
- [ ] Define voluntary, contractual, guardian, employment, statutory, and other participation categories without pretending they are equivalent.
- [ ] Define member-owned versus Circle-owned records.
- [ ] Define selective disclosure and visibility classes.
- [ ] Define withdrawal, export, revocation, and continuity behavior.
- [ ] Define cross-Circle membership and conflict semantics.
- [ ] Add Sybil, invitation replay, device theft, and membership-confusion tests.

## Priority 7 — Circle charters and governance

- [ ] Define versioned charter schema.
- [ ] Define amendment proposal, notice, deliberation, vote, approval, timelock, activation, rejection, rollback, and supersession.
- [ ] Define roles, duties, permissions, prohibitions, term, and removal.
- [ ] Define scoped delegation and subdelegation limits.
- [ ] Define quorum, threshold, chamber, veto, abstention, conflict-of-interest, and recusal.
- [ ] Define emergency authority that can reduce risk but not create unbounded permanent authority.
- [ ] Define appeals, stays, reconsideration, remedies, and human review.
- [ ] Define Circle assurance floors and member-level stronger protections.
- [ ] Build human explanations and comprehension tests before real pilots.

## Priority 8 — Circle workflows and pilot

- [ ] Implement shared proposals, tasks, commitments, approvals, and evidence timelines.
- [ ] Implement selective object and evidence sharing over approved causal exchange.
- [ ] Make concurrent updates and unresolved conflicts visible.
- [ ] Implement Circle export, backup, recovery, succession, and shutdown.
- [ ] Choose one low-risk pilot domain.
- [ ] Obtain explicit participant consent and named operator/reviewer roles.
- [ ] Define success, support, accessibility, revocation, comprehension, and harm metrics.
- [ ] Complete security and privacy review.
- [ ] Do not include public authority, payroll, treasury, coercive eligibility, or regulated decisions in the first pilot.

## Priority 9 — Institutional authority model

- [ ] Define institution identity and charter.
- [ ] Define office, appointment, election, term, vacancy, acting authority, succession, removal, and dissolution.
- [ ] Define employment, fiduciary, professional, statutory, and regulated duty declarations.
- [ ] Define separation of duties and multi-party approval.
- [ ] Define board, executive, auditor, ombuds, regulator, trustee, and custodian roles.
- [ ] Define institutional policy hierarchy and conflict.
- [ ] Define institutional continuity independent of individual membership.
- [ ] Define regulated record classes, retention, disclosure, legal hold, and deletion.
- [ ] Define institutional incident and emergency authority with expiry and review.
- [ ] Run synthetic succession, compromise, recovery, and dissolution drills.

## Priority 10 — Governance-pattern packages

- [ ] Define inert governance-pattern package schema.
- [ ] Include provenance, author, version, jurisdiction, assumptions, evidence, limitations, and license.
- [ ] Prove installation grants no runtime authority.
- [ ] Define local adaptation diff.
- [ ] Define synthetic and historical simulation environments.
- [ ] Define adoption through local charter, institutional, constitutional, or legal procedure.
- [ ] Define rollback, sunset, and post-adoption review.
- [ ] Add supply-chain, malicious-policy, deceptive-metric, and hidden-delegation tests.

## Priority 11 — Comparative governance evidence

- [ ] Define metric envelope with source, coverage, missingness, method, uncertainty, incentives, and update cadence.
- [ ] Support process, outcome, equity, accessibility, rights-impact, cost, and resilience dimensions.
- [ ] Prohibit presentation of contested composite scores as objective truth.
- [ ] Support local weighting with visible value choices.
- [ ] Define privacy-preserving aggregation and minimum cohort protections.
- [ ] Define independent replication, challenge, correction, and versioning.
- [ ] Link governance-pattern adoption to later observed outcomes without implying causality automatically.

## Priority 12 — Jurisdiction taxonomy and public-law laboratory

- [ ] Define municipality, province/state, territory, Indigenous government, agency, court, legislature, executive, and sovereign root domain types.
- [ ] Define territorial, population, subject-matter, temporal, and emergency scope.
- [ ] Define asserted versus procedurally verified versus adjudicated authority.
- [ ] Define public notice, reason, hearing, review, appeal, stay, remedy, and enforcement records.
- [ ] Define public and protected record classes.
- [ ] Define constitutional amendment and institutional succession.
- [ ] Use synthetic or historical data only.
- [ ] Commission independent constitutional, administrative-law, privacy, accessibility, security, and human-rights review before any real public authority pilot.

## Priority 13 — Sovereign deployment profile

- [ ] Define sovereign trust-anchor ownership, rotation, compromise, and succession.
- [ ] Define independent national operation without AXIOM platform access to plaintext or ambient control.
- [ ] Define constitutional authority graph and version history.
- [ ] Define public office credentials and terms.
- [ ] Define legislative, regulatory, administrative, and judicial lifecycles.
- [ ] Define emergency authority, expiry, renewal, containment, and after-action review.
- [ ] Define rights, due process, contestability, correction, restitution, and independent oversight.
- [ ] Define national data residency and export policy.
- [ ] Define public verification packages and protected secrecy boundaries.
- [ ] Define software and operator migration without loss of institutional continuity.
- [ ] Define nonconforming-deployment detection by independent verifiers.

## Priority 14 — Prohibited early sovereign uses

Do not prototype with real people or live authority in the following areas until separate programmes and reviews exist:

- [ ] population-scale identity correlation;
- [ ] voting or election administration;
- [ ] policing or predictive policing;
- [ ] criminal justice or detention;
- [ ] taxation or asset seizure;
- [ ] immigration enforcement;
- [ ] benefits or essential-service eligibility;
- [ ] health surveillance;
- [ ] child protection or family separation;
- [ ] military, intelligence, or defence command;
- [ ] political scoring or loyalty systems;
- [ ] irreversible public blacklists.

## Priority 15 — Treaty interoperability

- [ ] Define bilateral recognition profile schema.
- [ ] Define parties, trust anchors, purposes, scopes, accepted evidence, assurance floors, and data restrictions.
- [ ] Define explicit denial of automatic transitive trust.
- [ ] Define reservations, exceptions, amendment, expiry, withdrawal, and termination.
- [ ] Define dispute, review, remedy, and arbitration records.
- [ ] Define cross-border revocation and compromise propagation.
- [ ] Define data residency and selective-disclosure enforcement.
- [ ] Begin with low-coercion domains such as education credentials, standards, science, environment, or disaster coordination.
- [ ] Keep finance, immigration, criminal justice, taxation, and defence blocked pending dedicated governance.

## Priority 16 — Collective finality and consensus research

- [ ] Classify records that require common finality versus causal conflict visibility.
- [ ] Define fault, threat, membership, liveness, safety, and recovery models by domain.
- [ ] Define validator, chamber, or participant authority independently of technical key possession.
- [ ] Define quorum, censorship, equivocation, partition, rejoin, and state migration evidence.
- [ ] Define human appeal, emergency halt, and constitutional override semantics.
- [ ] Test protocol amendment and validator succession.
- [ ] Do not couple consensus automatically to tokens, staking, treasury, or settlement.
- [ ] Do not remove human or legal appeal merely because technical finality was reached.

## Priority 17 — Threat model expansion

- [ ] Assurance downgrade and mislabelling.
- [ ] Provisional-result laundering.
- [ ] Retrospective evidence forgery.
- [ ] Charter, constitution, or treaty substitution.
- [ ] Delegation inheritance and privilege escalation.
- [ ] Office succession capture.
- [ ] Quorum manipulation and Sybil membership.
- [ ] Coercive consent and involuntary participation.
- [ ] Discriminatory policy automation.
- [ ] Metric gaming and Goodhart effects.
- [ ] Governance-pattern supply-chain attacks.
- [ ] Trust-anchor and software-update capture.
- [ ] Cross-domain confusion and unintended transitive trust.
- [ ] Censorship, equivocation, and finality capture.
- [ ] State-scale surveillance and correlation.
- [ ] Collusion across identity, policy, execution, evidence, and review roles.

## Priority 18 — Required promotion artifacts

For every future capability promoted beyond planning:

- [ ] capability registry entry;
- [ ] capability-specific executable evidence binding;
- [ ] normative requirements;
- [ ] schemas and migration rules;
- [ ] positive, negative, adversarial, recovery, and compatibility tests;
- [ ] current-build threat model update;
- [ ] security and privacy review;
- [ ] domain legal/governance review where applicable;
- [ ] human explanation and accessibility evidence;
- [ ] operations, rotation, revocation, backup, restore, succession, and rollback runbooks;
- [ ] bounded authentic pilot evidence;
- [ ] current status and readiness updates;
- [ ] release dossier and exact public claims;
- [ ] explicit remaining non-claims.

## Completion rule

No checkbox in this document alone promotes a capability. Promotion occurs only when the capability registry, exact implementation, executable evidence, applicable reviews, and canonical claims all agree.
