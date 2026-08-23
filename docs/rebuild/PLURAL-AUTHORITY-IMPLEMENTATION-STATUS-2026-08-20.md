# Plural Authority Implementation Status — 2026-08-20

**Scope:** current implementation reconciliation for `docs/MASTER-TODO-PLURAL-AUTHORITY.md` and `docs/rebuild/ADAPTIVE-ASSURANCE-AND-PLURAL-AUTHORITY.md`.

**Current-build rule:** this document records what has been implemented or prepared on review branches. It does not promote a capability registry status, create Circle runtime authority, or override canonical release claims.

## Closed foundational blocker

The first capability-evidence-binding items in `docs/MASTER-TODO-PLURAL-AUTHORITY.md` are stale as unchecked planning items. Current `mesh/src/check-registry.mjs` already enforces capability-specific evidence bindings using the `axiom-capability-evidence-bindings.v1` contract, including exact registry version/digest, real non-symlink paths, runnable Node tests, named test blocks, and exact assertion lines.

This means the old structural blocker — “implemented capability has a non-empty evidence array but no enforceable assertion binding” — is closed. It does **not** mean any new Circle, social-feed, federation, or sovereign capability is promoted.

## Circle Core v0 — implemented as an inert contract layer

Draft PR #1225 introduces a machine-readable Circle semantic foundation with:

- Circle identity and trust-anchor identifier;
- voluntary/contractual participation model;
- independent member-state ownership;
- raise-only policy floor;
- versioned charter with declared non-executing roles and decision thresholds;
- invitation, acceptance, membership status, proposal, task, decision, appeal, exit/revocation, and export records;
- exact charter binding for invitations, proposals, and decisions;
- one-use invitation replay rejection across the complete membership set;
- role widening rejection;
- cross-Circle and stale-charter substitution rejection;
- explicit prohibition on task/decision/export runtime-authority laundering;
- append-only exit semantics and no portable authority in exports.

The branch remains fixed to:

- `status: inert-contract-laboratory`;
- `runtime_activation: false`;
- `authority_effect: none`;
- `network_effect: none` where applicable.

The following are **not** implemented by Circle Core v0: device membership, live invitation transport, live membership mutation routes, Circle-owned shared storage, causal exchange of Circle records, runtime delegation, real collective finality, public authority, consensus, or federation.

## Multi-principal Circle simulation — prepared, not promoted

Branch `agent/circle-multiprincipal-simulation-20260820` adds the next non-runtime slice over Circle Core v0.

The simulator requires at least two distinct active principals and supports only role-declared:

- deliberation;
- evidence reference;
- simulated vote.

It fails closed on:

- inactive or principal-mismatched memberships;
- duplicate active memberships for one principal, avoiding double-vote ambiguity in v0 simulation;
- undeclared role modes;
- stale charter digest;
- wrong Circle identity;
- closed proposals;
- actions outside the proposal window;
- non-chronological action sequences;
- duplicate action identifiers;
- more than one vote by the same membership on the same proposal;
- unsupported vote choices.

The transcript binds the exact policy, input Circle package, charter, and action sequence by digest. A simulated threshold result can be labelled `accepted`, `rejected`, or `no-quorum`, but always with:

- `finality: simulation-only`;
- `creates_circle_decision: false`;
- `runtime_authority: false`;
- `may_mutate_circle: false`;
- `may_mint_runtime_authority: false`;
- `may_create_grid_event: false`;
- `may_create_gateway_action: false`.

Therefore a simulated accepted outcome is evidence about the simulator and input rules only. It is not a Circle decision and cannot authorize execution.

## User-sovereign social feed — under protected review

Draft PR #1230 defines the non-runtime feed/curation semantics required before ranking or moderation work:

- Curated, Uncurated, and Filtered/Suspected Spam views;
- separate personal mute, actor-pair interaction boundary, curated-lens exclusion, report, and safety/legal quarantine scopes;
- member-preserved access to the broader admissible corpus when a curator excludes material from one lens;
- user-controlled perspective-expansion preference with a 10% default and no hard minimum;
- exact, explainable selection receipts;
- prohibition on hidden political labels and sensitive-trait inference for diversity selection;
- local presentation transforms bound to canonical source digests;
- exact Circle charter/curator-role binding for curated lenses;
- active same-Circle lens binding for local curated-view selection.

This is not a live ranking engine, recommendation engine, moderation service, or blocking system.

## Axiom One Social — read-only review slice

Draft PR #1229 exposes the already-accepted `social.get` and `social_remote_review.get` Gateway reads through Axiom One as separate provenance classes.

It adds no social writes, feed ranking, Circle runtime, ActivityPub transport, or Mastodon account connection. Protected actor/persona state remains excluded from the presentation model.

## ActivityPub / Mastodon interoperability — inert adapter contracts

Draft PR #1228 defines:

- ActivityPub semantic translation boundaries;
- remote-observation staging normalization;
- truthful capability mapping;
- audience/content compatibility;
- stable external ActivityPub object binding for append-only AXIOM supersession;
- a separate least-privilege contract for connecting an existing Mastodon account.

No live federation, WebFinger, inbox/outbox, OAuth token exchange, Mastodon API egress, or public actor hosting is enabled.

## Still open before any Circle runtime claim

The following remain open and should continue to block runtime promotion:

1. Decide whether Circle Core itself should prohibit multiple simultaneous active memberships for one principal, or explicitly model multi-seat/multi-class voting semantics.
2. Define device membership, credential rotation, compromise, and recovery semantics.
3. Define charter amendment/supersession lifecycle rather than only a versioned charter snapshot.
4. Define live invitation issuance/acceptance authority and evidence.
5. Define proposal/vote/appeal mutation records and replay/idempotency behavior in Grid-backed storage.
6. Define exact separation between a Circle decision and any later Sandbox/runtime authority grant.
7. Define selective Circle sharing over causal exchange, including conflict visibility and disclosure classes.
8. Expand the threat model for Sybil membership, quorum manipulation, role capture, compromised devices, coercive participation, and cross-Circle confusion.
9. Add human explanation/accessibility evidence before any real participant pilot.
10. Keep consensus, public-law authority, treasury, payroll, eligibility, enforcement, and coercive decisions out of the first Circle runtime pilot.

## Reconciliation rule

When these branches are merged or superseded, the canonical master todo should be reconciled atomically. Completed contract work may close the corresponding **definition** items, but runtime/pilot checkboxes must remain open until exact implementation, capability-registry evidence, threat-model updates, review, and current public claims all agree.
