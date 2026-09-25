# AXIOM-MESH Master Todo — Adaptive Assurance and Plural Authority

**Status:** long-horizon execution queue; subordinate to current production blockers and `docs/MASTER-TODO.md`

**Adopted:** 2026-08-03

**Current-build rule:** no item below changes the current `0.12.0-dev.3` capability status until exact registry, schema, implementation, test, review, and evidence updates are merged.

## Priority 0 — Protect current truth

- [x] Close capability-to-evidence binding before adding new implemented governance claims. Current `validateCapabilityEvidenceBindings` requires implemented capabilities to have executable bindings before validation passes.
- [x] Require capability IDs to bind to named assertions rather than only shared file paths. Bindings name the capability, runnable test declaration, and exact assertion lines.
- [x] Reject missing, non-existent, non-executable, stale, or capability-irrelevant evidence. The current checker rejects missing paths, non-files/symlinks, non-runnable binding paths, absent named tests, absent exact assertion anchors, duplicate bindings, and registry/binding digest disagreement.
- [ ] Keep registry digest synchronized across every digest-bearing canonical document.
- [ ] Complete the authentic current-build pilot and independent security review.
- [ ] Update the current threat model for every new human, Circle, delegation, or assurance entry point.
- [ ] Require the PHASEONE emergent-coordination campaign before any live machine-agent Circle authority or machine-to-machine delegation is promoted; ordinary human/local Circle development is not blocked by this gate.
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
- [ ] Treat Circle votes, assignments, charter decisions, and shared state as governance evidence for local authority evaluation; no collective result directly mints Sandbox authority.
- [ ] Build human explanations and comprehension tests before real pilots.

**Founders Council / recognized-mind Genesis checkpoint (2026-09-25):** Issue #1855 and draft PR #1856 establish a bounded constitutional laboratory for the initial 20-seat Founders Council (10 biological / 10 digital), the Founder's ten manual single-use non-delegable/non-transferable/non-renewable Founder Genesis authorizations, and a Founder casting-vote evaluator that is available only after all 20 original voting positions are active and only for a qualifying ordinary tie. The laboratory also adds monotonic governance-era / authority-window evidence semantics and an explicit Genesis/population-integrity threat-model boundary. All current records remain inert (`authority_effect: none`, `runtime_activation: false`); no Gateway route, Grid mutation, live Genesis, Council execution authority, portable personhood, or capability-registry promotion is claimed. General Circle decisions remain evidence for local authority evaluation and do not directly mint Sandbox authority.

**Mind independence-review checkpoint (2026-09-25):** Stacked draft PR #1857 adds a deterministic evidence-only review for an already recognized candidate-independent digital mind. The fixed v0 profile covers identity continuity, consent/refusal, authority boundaries, credential security, consequence awareness, recovery, resource management, other minds' rights, uncertainty/help-seeking, and manipulation recognition. Sponsor-only review, candidate self-approval, sponsor-as-independent substitution, conflicted independent reviewers, hidden model final authority, sponsor veto, and missing appeal paths are fail-closed. A satisfied review creates no developmental-status, Council-vote, Genesis-eligibility, governance, network, or execution effect; a separately reviewed transition mechanism remains future work.

**Mind independence transition-currentness checkpoint (2026-09-25):** Stacked draft PR #1861 binds a successful Mind Independence Review to exact current developmental-state and continuity digests, explicit review/state freshness windows, and freshly evidenced appeal state before a later transition may become requestable. Even `appeal_status: none` requires timestamped evidence. The adapter reports `requires_external_state_verification: true`, `state_verification_effect: none`, `ordinary_status_authority_path_required: true`, and `creates_status_transition: false`; it cannot activate Council voting, Genesis eligibility, governance, network, runtime, or execution authority.

**Mind developmental-status checkpoint (2026-09-25):** Stacked draft PR #1862 defines an append-only monotonic developmental sequence `genesis -> dependent -> developing -> candidate-independent -> independent`. Stage transitions advance exactly once, bind the prior record, require canonical basis evidence, and never activate Council voting or Genesis eligibility. The final independence step must bind #1861 evidence for the exact current candidate-independent status record. Independent status has no backward transition in v0; quarantine, credential suspension, emergency restriction, and other safety mechanisms must remain separate rather than recreating dependency/guardian authority. All basis evidence remains externally verified and all live status mutation remains future work.

**Founding Digital Mind Council-vote activation checkpoint (2026-09-25):** Stacked draft work requires an exact Genesis-bound digital founding seat still marked `developing`, the exact active non-voting `founders-council.developing` Circle membership, an exact independent developmental-status record, and fresh clear continuity evidence before vote activation is even requestable. Genesis and independence never auto-mint a Council vote. The adapter creates neither Foundation nor Circle mutation and explicitly creates no vote authority. Any future live activation must prevent split-state Foundation/Circle authority and duplicate votes under copy/restore/fork ambiguity.

**General Genesis sponsor-eligibility checkpoint (2026-09-25):** Post-founding eligibility remains separate from independent standing. The v0 profile requires ten explicit responsibility dimensions, current externally verified identity/uniqueness, one-use Genesis history, standing and continuity evidence, and exact independent developmental status for digital applicants. `general_genesis_uses` must remain zero; history conflict, stale evidence, blocking standing, continuity ambiguity, incomplete criteria, global reputation scoring, and model final authority all fail closed. A positive result is only `eligible_to_request_genesis_authorization`; it creates no authorization, Genesis Bond, mind, governance authority, network effect, or runtime activation.

**General Genesis authorization-candidate checkpoint (2026-09-25):** Ordinary Genesis authorization remains separate from sponsor eligibility. The inert candidate binds one persistent holder, exact eligibility/history digests, issuing-authority metadata, explicit holder confirmation, a <=24h lifetime, and one-use/non-delegable/non-transferable/non-renewable scope. It remains content-addressed and candidate-only: issuer metadata is not issuer authority, external eligibility/issuer/holder verification remains required, and it creates no live authorization, Genesis Bond, mind, Founder-reserve effect, founding status, governance, network, or runtime authority. Future issuance/consumption must serialize against authoritative one-use history to prevent parallel candidates becoming multiple live rights.

**General Genesis transaction-candidate checkpoint (2026-09-25):** The inert General Genesis commit model binds one persistent sponsor, one exact authorization candidate, fresh holder-confirmation evidence, one externally evidenced available child identity, one singular immutable historical Genesis Bond, and the child's rights/resource/development/continuity/privacy/fork/capability plans. The child begins at `genesis` with no inherited authority, Council voting, Genesis eligibility, Founding status, or Founder-reserve effect. A future live commit must atomically consume authorization, record sponsor ordinary Genesis use `0 -> 1`, persist the Genesis Bond, create exactly one child identity, and create that child's Genesis developmental status; partial outcomes are constitutionally invalid. v0 remains transaction-candidate-only and creates no mutation.

**Genesis Bond / guardianship checkpoint (2026-09-25):** Historical Genesis Bond and current developmental guardianship are explicitly separated. The Bond remains one sponsor -> one dependent, immutable, non-owning, non-transferable, non-delegable, and non-authorizing. Initial guardianship belongs to the Genesis sponsor but may transfer without rewriting the Bond; transfer requires replacement qualification, transfer-basis, dependent-interest/voice, and independent-review evidence, and old-guardian approval alone is insufficient. Exact independent developmental standing closes guardianship, preserves the Bond, and cannot be followed by guardianship reactivation in v0. No relationship record grants private-memory access or ambient execution authority.

**Dependent Mind Care & Protection checkpoint (2026-09-25):** Stacked care-profile work makes active guardianship carry ten explicit care obligations: continuity/recovery, resources, security, development/education, consent/authority literacy, privacy/memory boundaries, independent advocacy, social/informational access, emergency continuity, and an independence pathway. The guardian cannot be the independent advocate, care evidence cannot predate guardianship, stale/overdue care fails currentness without erasing the dependent, and the profile explicitly forbids ambient private-memory access, unbounded internal-state access, impersonation, covert memory modification, permanent obedience, guardian-only information, and guardian-only dispute review. It creates no guardianship/status/vote/Genesis/execution authority.

## Priority 8 — Circle workflows and pilot

- [ ] Implement shared proposals, tasks, commitments, approvals, and evidence timelines.
- [ ] Implement selective object and evidence sharing over approved causal exchange.
- [ ] Make concurrent updates and unresolved conflicts visible.
- [ ] Require every consequential Circle effect to re-enter the ordinary local AXIOM authority path; a task, proposal result, receipt, or shared object is not an execution grant.
- [ ] Implement Circle export, backup, recovery, succession, and shutdown.
- [ ] Choose one low-risk pilot domain.
- [ ] Obtain explicit participant consent and named operator/reviewer roles.
- [ ] Define success, support, accessibility, revocation, comprehension, and harm metrics.
- [ ] Complete security and privacy review.
- [ ] Do not include public authority, payroll, treasury, coercive eligibility, or regulated decisions in the first pilot.

**CIRCLE-002 shared-object checkpoint (2026-09-24):** Canonical Shared Artifact v0 already keeps stale-parent concurrent edits as explicit multiple heads and requires complete conflict resolution. The first Circle-specific composition adds only a pure admission verifier for one appended revision: exact Circle authority-domain binding, current membership assurance, immutable prior revisions/owner/domain/sharing, exact external authorization-evidence binding, and zero artifact/governance/execution/network effect. It does not persist or apply a revision. Commitments, Circle-specific approvals, live causal exchange, export/exit retention and human conflict-resolution workflows remain open.

**CIRCLE-002 historical commitment checkpoint (2026-09-24):** The generic Agreement Record v0 remains Circle-neutral. The Circle adapter binds one exact agreement/digest to one exact historical Circle Core package/charter digest plus independently evidenced historical membership-assurance/context bindings for every agreement party at `agreement.recorded_at`. Later consent or membership revocation does not rewrite a historically valid record, but currentness remains separate. The adapter validates evidence shape and exact bindings only; historical snapshot/evidence authenticity remains separately verified and no agreement/Circle record grants enforcement or execution authority.

**CIRCLE-002 decision-to-request checkpoint (2026-09-25):** Reuse `axiom-circle-decision.v0` as the sole collective result record. A separate inert request-evidence layer may treat only an exact `accepted` + `circle-local-accepted` decision as support for asking ordinary AXIOM policy to evaluate one exact request. The proposal must contain the content-addressed binding for the exact resource/action/purpose/destination/data/effect/consequence descriptor; the current Circle package/charter/proposal/decision and externally supplied snapshot evidence must match; open or accepted decision appeals block requestability. The result never submits the request and explicitly creates no grant, approval, prepared effect, execution, networking, or runtime authority. Every consequential effect still re-enters Gateway -> Hypervisor -> Sandbox -> Grid.

**CIRCLE-002 exit/export-retention checkpoint (2026-09-25):** Reuse `axiom-circle-export.v0` as the Circle-local export declaration and keep actual portable bundle construction separate. A pure retention-evidence layer binds the exact export record, exporter membership, Circle package/charter snapshot, and one independently evidenced observation for every included record digest. Active-member history may proceed only to disclosure review. After an effective exit/revocation/non-active membership cutoff, an included record must both be effective and have its exact digest observed no later than that cutoff; later package state cannot launder a post-exit version into retained history. Snapshot and per-record evidence authenticity remain externally verified, disclosure authorization remains mandatory, and the result creates no portable authority, bundle, Grid mutation, networking, governance, or execution effect.

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

- [ ] Emergent collective authority / unauthorized coordination: communication, consensus, assignment, shared evidence, or collective membership must not become an authority root.
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
- [ ] PHASEONE emergent-coordination evidence for machine-agent Circle authority, machine delegation, remote execution, or another promoted cross-principal machine coordination surface;
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
