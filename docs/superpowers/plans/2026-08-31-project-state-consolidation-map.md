# Project-State Consolidation Map

**Status:** active execution queue  
**Policy:** [Project-State Consolidation Map Design](../specs/2026-08-31-project-state-consolidation-map-design.md)  
**Observed:** 2026-09-02T21:52:16Z  
**Authority effect:** none

## Live baseline

| Measure | Live observation | Consequence |
|---|---:|---|
| Protected `main` | `1c7ced824e909be28dd3dd45a7fd3648b1849f90` | unchanged since 2026-08-31; current verification is red |
| Remote branches | 407 | excludes the local symbolic `origin` alias |
| Open pull requests | 102 | the earlier 100-PR baseline grew with #1469 and #1470 |
| Draft pull requests | 70 | draft state remains an observation, not a completeness proof |
| Non-draft pull requests | 32 | includes the two new non-draft PRs |
| Open non-PR issues | 90 | includes new issues #1468 and #1471 |
| Active build | `0.12.0-dev.3` | capability and readiness claims remain registry-bound |

The historical August 31 snapshot remains in [AXIOM Project-State Consolidation Map](../specs/2026-08-31-axiom-project-state-consolidation-map.md). Its old counts are not overwritten here.

## Immediate verification repair

The clean-kernel failure had two independent causes:

1. `main` added the selective-interposition design without registering it in `CANONICAL_DOCUMENTS`;
2. nine live agent-trust fixture families used a machine-principal expiry of `2026-09-01T00:00:00.000Z` and began failing after that wall-clock boundary.

PR #1470 is now the narrow current-main repair at head `2eae30667a66896bb699c982e3d43acf1970fe3a`. It registers the document and moves all nine live fixtures beyond the current wall clock while preserving the explicit credential-outlives-principal negative test. Local evidence is 86 focused tests passing and the documentation boundary passing with 104 documents and 298 links. Exact-head GitHub checks are the remaining landing gate.

PR #1458 carries the same complete fixture repair at head `51b3844a93b5b6545b9139273be30262e76d7d83`. Its previous GitHub run proved that the first two fixture edits were insufficient by exposing the remaining seven fixture families. After #1470 lands, #1458 must be compared/rebased so duplicate baseline repair changes disappear from its effective diff, then its exact programme head must pass.

## Disposition counts

| Disposition | Count |
|---|---:|
| `LAND` | 17 |
| `REFRESH` | 32 |
| `STACK` | 32 |
| `RED-ONLY` | 3 |
| `BLOCKED` | 3 |
| `PROVENANCE` | 15 |
| `SUPERSEDED` | 0 |
| **Total** | **102** |

No pull request is marked `SUPERSEDED` in this refresh. Conceptual overlap is extensive, but exact preservation proof has not yet been recorded. This is deliberate.

## Pull-request disposition ledger

| PR | Disposition | Relationship or reason | Next gate |
|---:|---|---|---|
| #1470 | `LAND` | narrow current-main verification repair | exact-head required checks green, then human protected-main landing |
| #1469 | `LAND` | independent community follow-through policy | refresh after #1470, verify, review, land |
| #1458 | `LAND` | sovereign-host programme design anchor | #1470 lands; remove effective duplicate repair; exact-head checks; review |
| #1456 | `STACK` | first Host Guardian implementation under #1458 programme | rebase after #1458 and bind to #1457/#1463 acceptance gates |
| #1455 | `RED-ONLY` | intentionally incomplete child of #1451 | retain RED evidence; implement before any ready/landing transition |
| #1454 | `STACK` | plural-authority conformance child of #1453 | land after #1453, then rebase and verify |
| #1453 | `STACK` | plural-authority pilot child of #1452 | land after #1452, then rebase and verify |
| #1452 | `STACK` | plural-authority explanation child of #1449 | land after #1449, then rebase and verify |
| #1451 | `LAND` | recursive-agent authoritative root candidate | compare/carry unique #1450/#1432/#1433 artifacts; exact-head checks |
| #1450 | `REFRESH` | alternate recursive-agent design lineage | inventory against #1451 before any successor decision |
| #1449 | `LAND` | plural-authority policy-conflict root | exact-head checks and root review |
| #1448 | `STACK` | assurance child of #1441 | rebase only after #1441 lands |
| #1446 | `STACK` | machine-currentness lifecycle child/alternate from #1420 | order against #1435/#1440/#1444 after root review |
| #1444 | `STACK` | machine-currentness child of #1440 | rebase only after #1440 lands |
| #1441 | `STACK` | assurance child of #1438 | rebase after #1438, verify, land |
| #1440 | `STACK` | machine-currentness child of #1435 | rebase only after #1435 lands |
| #1438 | `LAND` | assurance authoritative root | compare overlap with #1409, then exact-head checks |
| #1437 | `STACK` | interop-recognition child of #1434 | rebase only after #1434 lands |
| #1435 | `STACK` | machine-currentness child of #1420 | rebase after #1420, verify, land |
| #1434 | `STACK` | interop-recognition child of #1430 | rebase only after #1430 lands |
| #1433 | `REFRESH` | subagent-budget root material used by recursive lineage | artifact comparison into #1451 before closure decision |
| #1432 | `REFRESH` | delegation-semantics root material used by recursive lineage | artifact comparison into #1451 before closure decision |
| #1430 | `STACK` | interop-recognition child of #1429 | rebase after #1429, verify, land |
| #1429 | `LAND` | interop-recognition authoritative root | exact-head checks and root review |
| #1428 | `LAND` | institutional-transparency independent root | refresh after #1470, verify, review |
| #1426 | `REFRESH` | identity-separation root with overlapping current work | compare contracts and current-main implementation |
| #1424 | `REFRESH` | expiry hotfix lineage | prove whether #1420/currentness chain preserves every fix |
| #1420 | `LAND` | machine-currentness authoritative root | absorb baseline repair, exact-head checks, root review |
| #1419 | `STACK` | portable-trust terminal child of #1416 chain | rebase after predecessor chain lands |
| #1417 | `REFRESH` | alternate currentness-fixture work | compare with #1470 and #1420; retain unique tests |
| #1416 | `STACK` | portable-trust child of #1415 | rebase only after #1415 lands |
| #1415 | `STACK` | portable-trust child of #1414 | rebase only after #1414 lands |
| #1414 | `STACK` | portable-trust child of #1413 | rebase only after #1413 lands |
| #1413 | `STACK` | portable-trust child of #1412 | rebase only after #1412 lands |
| #1412 | `STACK` | portable-trust child of #1411 | rebase only after #1411 lands |
| #1411 | `STACK` | portable-trust child of #1410 | rebase after #1410, verify, land |
| #1410 | `LAND` | portable-trust authoritative root | exact-head checks and root review |
| #1409 | `REFRESH` | adaptive-assurance alternate root | semantic comparison against #1438 chain |
| #1408 | `LAND` | Studio boundary independent root | refresh after #1470, verify, review |
| #1407 | `LAND` | research gate independent root | refresh after #1470, verify, review |
| #1406 | `LAND` | immune-system independent root | refresh after #1470, verify, review |
| #1405 | `LAND` | institutional-kit independent root | refresh after #1470, verify, review |
| #1404 | `LAND` | causal-authority independent root | refresh after #1470, verify, review |
| #1403 | `LAND` | identity/currency/authority test root | refresh after #1470, verify, review |
| #1402 | `REFRESH` | entity-fabric root with broad integration surface | reconstruct on current main and align with #1458/#1460 |
| #1400 | `RED-ONLY` | deliberate verification work | retain as failing contract until named implementation consumes it |
| #1399 | `REFRESH` | stale documentation root | compare against current canonical corpus |
| #1396 | `RED-ONLY` | deliberate verification work | retain as failing contract until named implementation consumes it |
| #1395 | `STACK` | child of #1393 | hold until #1393/#1383 lineage is refreshed |
| #1393 | `STACK` | child of #1383 | refresh root first, then rebase |
| #1392 | `REFRESH` | stale Circle/local-runtime root | compare with current Circle and host architecture |
| #1391 | `REFRESH` | stale social catch-up root | reconstruct against current remote-social boundary |
| #1389 | `REFRESH` | stale discovery-fabric root | compare with current discovery contracts and registry |
| #1384 | `LAND` | canonical steward/consolidation lineage | land refreshed map after #1470 and exact-head checks |
| #1383 | `REFRESH` | cognitive-continuity root under two dependent PRs | inventory and reconstruct on current main |
| #1379 | `REFRESH` | older cognitive-selection lineage | compare with current selection/continuity implementation |
| #1373 | `BLOCKED` | known merge/conflict state in cognitive recovery | resolve design lineage before code conflict work |
| #1372 | `REFRESH` | collective-authority invariant root | compare against plural-authority chain |
| #1367 | `REFRESH` | old security-residue root | current-main threat and patch inventory |
| #1364 | `REFRESH` | old durable-replay root | compare against current durable evidence implementation |
| #1362 | `REFRESH` | old Beacon-normalization root | align with #1429 interop-recognition lineage |
| #1348 | `REFRESH` | old persistent-objective documentation | compare with current objective and continuity surfaces |
| #1338 | `BLOCKED` | known blockchain-boundary conflict | resolve authority design before reconstruction |
| #1336 | `REFRESH` | old delegation-inspector root | compare with #1432/#1451 current delegation work |
| #1315 | `REFRESH` | old one-operation fact-admission root | inventory against current admission path |
| #1311 | `REFRESH` | old effect-consumption root | inventory against current Grid/effect completion path |
| #1293 | `REFRESH` | old Grid-startup root | current-main startup and migration comparison |
| #1289 | `STACK` | Circle child of #1287/#1251 lineage | refresh root then rebase in order |
| #1287 | `STACK` | Circle child of #1251 lineage | refresh root then rebase in order |
| #1284 | `STACK` | installation child of #1282/#1281 lineage | refresh root then rebase in order |
| #1282 | `STACK` | installation child of #1281 | refresh root then rebase in order |
| #1281 | `REFRESH` | installation root | reconstruct under #1458 Launchpad/host programme |
| #1264 | `REFRESH` | old Hermes probe | compare with current interop/provider evidence boundary |
| #1251 | `REFRESH` | Circle root for #1287/#1289 | reconcile with plural authority and shared-device #1465 |
| #1234 | `BLOCKED` | explicit Circle charter reconciliation required | resolve charter/authority conflict before code work |
| #1233 | `REFRESH` | old Circle branch | compare with #1251 and current plural authority |
| #1231 | `REFRESH` | old Circle branch | compare with #1251 and current plural authority |
| #1230 | `REFRESH` | old social/ActivityPub branch | reconstruct against current remote-social threat boundary |
| #1228 | `REFRESH` | old social/ActivityPub branch | reconstruct against current remote-social threat boundary |
| #1176 | `STACK` | semantic-memory child of #1167 chain | rebuild only after root/base reconstruction |
| #1167 | `STACK` | semantic-memory child of #1159 | rebuild only after predecessor reconstruction |
| #1159 | `STACK` | semantic-memory child of #1149 | rebuild only after predecessor reconstruction |
| #1156 | `PROVENANCE` | historical Agent Commons executor laboratory | retain evidence; map exact current successor before closure |
| #1154 | `PROVENANCE` | historical machine-delegation policy laboratory | retain evidence; compare with #1432/#1451 |
| #1149 | `STACK` | semantic-memory child of #1147 | rebuild only after predecessor reconstruction |
| #1147 | `STACK` | semantic-memory child of #1144 | rebuild only after base reconstruction |
| #1146 | `PROVENANCE` | historical Agent Commons executor laboratory | retain evidence; map exact current successor before closure |
| #1144 | `STACK` | semantic-memory child with a non-open base | recover the missing base relationship before refresh |
| #1140 | `REFRESH` | semantic-memory root lineage | select current root and preserve stack artifacts |
| #1137 | `PROVENANCE` | historical Agent Commons executor laboratory | retain evidence; map exact current successor before closure |
| #1131 | `PROVENANCE` | historical Agent Commons executor laboratory | retain evidence; map exact current successor before closure |
| #1126 | `PROVENANCE` | historical Agent Commons executor laboratory | retain evidence; map exact current successor before closure |
| #1123 | `PROVENANCE` | historical Agent Commons executor laboratory | retain evidence; map exact current successor before closure |
| #1120 | `PROVENANCE` | historical Agent Commons executor laboratory | retain evidence; map exact current successor before closure |
| #1117 | `PROVENANCE` | historical Agent Commons executor laboratory | retain evidence; map exact current successor before closure |
| #1114 | `PROVENANCE` | historical Agent Commons executor laboratory | retain evidence; map exact current successor before closure |
| #1110 | `PROVENANCE` | historical Agent Commons executor laboratory | retain evidence; map exact current successor before closure |
| #1100 | `PROVENANCE` | historical social remote-admission laboratory | retain evidence; compare with current remote-social path |
| #1064 | `REFRESH` | old health/readiness root | reconstruct against current operations and readiness contracts |
| #1054 | `PROVENANCE` | historical host H-series implementation | preserve image/update/recovery artifacts for #1456/#1463 reconstruction |
| #1052 | `PROVENANCE` | historical host H-series stack | preserve image/update/recovery artifacts for #1456/#1463 reconstruction |
| #1048 | `PROVENANCE` | historical host/storage research root | preserve evidence for #1458/#1463; do not merge wholesale |

## Landing chains

The selected order is:

1. **Restore current main:** #1470.
2. **Refresh the coordination surface:** #1384 with this design and plan.
3. **Establish the sovereign-host anchor:** #1458, then #1456 and executable issues #1459-#1467.
4. **Land current independent roots:** #1469, #1451, #1449, #1438, #1429, #1428, #1420, #1410, and #1408-#1403, ordered further by file/semantic collision checks.
5. **Advance dependent stacks:** predecessor-first within recursive, plural-authority, assurance, interop, machine-currentness, portable-trust, and retained older stacks.
6. **Resolve alternates:** compare every `REFRESH` branch, carrying unique work into the chosen current lineage.
7. **Record succession:** assign `SUPERSEDED` only after exact preservation evidence exists; then close reviewed superseded/RED/provenance PRs as appropriate.
8. **Prune branches last:** perform a new remote-ref observation and separately review the exact deletion set.

## Active issue workstreams

The 90 non-PR issues remain work inputs rather than merge units. The immediate issue lanes are:

- #1423 and #1425: selective-interposition documentation registration, now addressed in #1470;
- #1457 and #1459-#1467: Host Guardian and sovereign-host/deployment/shared-resource/embodiment programme;
- #1427, #1431, #1436, #1442, #1443, #1445, and #1447: retained currentness and lifecycle work;
- #1468: workload-adaptive compute and hardware/software co-design research laboratory;
- #1471: plural-authority execution-mandate and effect-path closure conformance.

Issue closure follows implementation evidence and acceptance criteria; it is not inferred from a related pull request merely existing.

## Branch distribution

This exact 407-branch observation groups remote branches by first path segment:

| Prefix | Count | Prefix | Count |
|---|---:|---|---:|
| `agent` | 118 | `architecture` | 18 |
| `assurance` | 4 | `audit-remediation-2026-08-30` | 1 |
| `axiom-one` | 1 | `chore` | 3 |
| `ci` | 11 | `claude` | 1 |
| `codex` | 20 | `community` | 1 |
| `contracts` | 2 | `copilot` | 1 |
| `deployment` | 2 | `deprecated` | 1 |
| `design` | 6 | `docs` | 27 |
| `feat` | 26 | `feature` | 36 |
| `fix` | 12 | `hardening` | 1 |
| `institutional` | 1 | `integration` | 18 |
| `interop` | 9 | `main` | 1 |
| `maintenance` | 1 | `noop` | 1 |
| `noop2` | 1 | `perf` | 1 |
| `pilot` | 2 | `product` | 3 |
| `productization` | 1 | `reconcile` | 29 |
| `research` | 5 | `runtime` | 1 |
| `security` | 27 | `social` | 1 |
| `spec` | 1 | `test` | 6 |
| `trust` | 1 | `ux` | 1 |
| `verify` | 4 |  |  |

## Per-chain verification gate

Before a root or child is marked ready for landing:

1. confirm its base and head SHAs have not moved;
2. re-run setup/source-policy, registry, documentation, security, compatibility, and full kernel checks required by repository policy;
3. inspect failures rather than retrying blindly;
4. confirm the effective diff contains only the intended current slice;
5. update draft/ready metadata to match reality; and
6. obtain normal human review and protected-main approval.

## Refresh trigger

Refresh this execution plan after #1470 lands, after any selected root changes head, or when an open/closed/draft transition changes the 102-PR ledger. Do not edit the August 31 historical snapshot counts.
