# Project-State Consolidation Map Design

**Status:** active convergence design  
**Originally identified:** 2026-08-31  
**Refreshed:** 2026-09-02  
**Authority effect:** none  
**Companion execution plan:** [Project-State Consolidation Map](../plans/2026-08-31-project-state-consolidation-map.md)

## Purpose

This design defines how AXIOM-MESH converges a large branch and pull-request graph without deleting useful history, mistaking provider metadata for truth, or merging stale implementations wholesale.

The [August 31 project-state observation](./2026-08-31-axiom-project-state-consolidation-map.md) remains an immutable historical snapshot. This document is the stable policy surface. The companion plan is the refreshable execution surface containing current counts, dispositions, order, and gates.

Neither document grants repository, runtime, governance, deployment, or production authority. Protected-main policy and human review remain authoritative.

## Problem statement

The repository contains independent roots, deliberate stacks, RED verification branches, historical laboratories, supersession candidates, and branches whose useful concepts have outlived their implementations. Branch age, draft state, mergeability, and CI color are observations, not sufficient disposition rules.

Convergence therefore requires two different operations:

1. identify which lineage is authoritative for each current outcome; and
2. preserve or extract unique evidence from all other lineages before closure or pruning.

A smaller branch count is a result of convergence, not its primary objective.

## Source model

Each refresh binds observations to:

- the exact protected-main commit;
- an authenticated provider observation time;
- remote branch refs and pull-request head/base commits;
- repository-native capability, requirement, readiness, security, and contribution rules;
- CI runs for the exact head under consideration; and
- explicit ancestry, patch, file, and semantic comparisons where succession is proposed.

Provider fields such as `mergeable`, `draft`, labels, and check summaries remain observations. They cannot override repository evidence or protected-branch policy.

## Disposition vocabulary

Every open pull request receives exactly one primary disposition in the execution plan.

| Disposition | Meaning | Exit condition |
|---|---|---|
| `LAND` | Selected authoritative root or independent slice intended to land after its listed gates pass | exact-head checks green, review complete, and protected-main landing decision made |
| `REFRESH` | Potentially useful root whose code, base, metadata, or relationship must be reconstructed or compared before landing | refreshed current-main candidate or a stronger evidence-backed disposition |
| `STACK` | Dependent work that must follow a named root or predecessor, whether or not the provider base field currently expresses that dependency | predecessor lands, then child is rebased and verified in order |
| `RED-ONLY` | Deliberately failing contract or verification evidence, not a merge candidate | implementation successor is linked and the RED evidence is retained |
| `BLOCKED` | A known conflict, missing prerequisite, or authority decision prevents safe progress | blocker and resolution evidence are explicit |
| `SUPERSEDED` | Every useful change is proven present in a named successor or current main | successor is recorded, preservation checks pass, then closure is allowed |
| `PROVENANCE` | Historical or experimental work is retained as evidence and is not a wholesale landing candidate | unique artifacts are cited or extracted; closure is a separate decision |

`LAND` does not mean “merge immediately.” It means the pull request is on an authoritative landing path and must still satisfy every gate. `PROVENANCE` does not mean deletion-eligible. `SUPERSEDED` requires stronger proof than recency or conceptual overlap.

## Convergence invariants

1. Repair the current-main verification baseline before interpreting downstream CI.
2. Refresh root pull requests before their dependent stacks.
3. Rebase a stack in predecessor order; do not independently patch every child against `main`.
4. Carry forward useful work from stale branches; do not merge stale branches wholesale.
5. Resolve duplicate implementations by contract lineage, security boundary, and verification evidence, not date alone.
6. Keep draft/ready metadata aligned with actual completeness after the exact-head checks run.
7. Close a superseded pull request only after naming its successor and recording preservation evidence.
8. Keep branch refs until reachability and successor checks prove no unique work would be lost.
9. Prune branches last and in a separately reviewed operation.
10. Preserve RED tests and historical laboratories as provenance until a successor consumes them explicitly.
11. Run the repository-required complete checks for each landing chain before advancing `main`.
12. Treat every refresh as a point-in-time observation; never rewrite historical snapshot facts into apparent current truth.

## Root-and-stack procedure

For each active programme:

1. Select one root whose contract best represents the current intended outcome.
2. Compare alternate roots for unique files, tests, schemas, threat models, decisions, and negative results.
3. Move missing useful material into the selected lineage with provenance in commit and pull-request text.
4. Make the root current with protected `main` and run exact-head verification.
5. Land the root through normal review.
6. Rebase the first child onto the landed root, verify it, and repeat down the stack.

Parallel roots may proceed concurrently only when they do not modify the same authority, schema, registry, migration, or operational boundary. Apparent file independence is insufficient when semantics overlap.

## Supersession proof

A pull request may become `SUPERSEDED` only when the record includes:

- the exact successor pull request or protected-main commit;
- an ancestry or patch comparison;
- a changed-file and artifact inventory comparison;
- explicit treatment of tests, schemas, threat models, and documentation;
- confirmation that no stronger security or authority constraint was dropped; and
- a human-reviewable explanation of intentional omissions.

If any item is missing, use `REFRESH`, `BLOCKED`, or `PROVENANCE` instead.

## Branch-pruning proof

Branch deletion is permitted only after the associated pull request is merged or deliberately closed and one of these conditions is recorded:

- the branch head is reachable from protected `main`;
- every unique patch is present in a named retained successor; or
- every unique artifact was deliberately preserved elsewhere and the branch is retained through immutable pull-request or commit references.

The pruning operation must re-fetch remote refs, produce the exact deletion set, exclude `main` and every open-pull-request head, and receive separate review. No wildcard or age-only deletion is allowed.

## Refresh record

The execution plan must include:

- observation timestamp and exact main SHA;
- branch, open-PR, draft/ready, and non-PR issue counts;
- one primary disposition for every open pull request;
- root/stack and successor relationships;
- current blockers and exact check evidence;
- the next executable sequence; and
- a refresh trigger.

Refresh is required after any protected-main advance, root-head change, PR state change, or completed supersession comparison that affects the queue.

## Acceptance criteria

Convergence is complete for a cycle when:

- current `main` passes the required checks;
- every open pull request has one disposition and an explicit next gate;
- authoritative roots and stack order are unambiguous;
- ready/draft metadata matches implementation state;
- closures name successors or provenance records;
- no branch is pruned without preservation proof; and
- the next implementation work is represented by bounded issues or ordered pull requests rather than competing roadmap documents.

## Nonclaims

This map does not certify production readiness, make provider observations authoritative, grant merge permission, activate capabilities, or authorize branch deletion. It is an evidence-bound coordination mechanism under the repository's existing authority model.
