# AXIOM Project-State Consolidation Map

**Status:** point-in-time, non-authoritative repository observation  
**Observed:** 2026-08-31  
**Repository:** [`Zoverions/AXIOM-MESH`](https://github.com/Zoverions/AXIOM-MESH)  
**Protected-main snapshot:** `403f678e8e35b7ae7a08ff37a8c86631337b5cd6`  
**Active build at snapshot:** `0.12.0-dev.3`  
**Authority effect:** none

> This document preserves the August 31 observation. The active convergence policy is
> [Project-State Consolidation Map Design](./2026-08-31-project-state-consolidation-map-design.md),
> and its current executable queue is the
> [Project-State Consolidation Map Plan](../plans/2026-08-31-project-state-consolidation-map.md).
> Later counts and dispositions belong there; the facts below remain point-in-time provenance.

## Purpose

This document is the first manual output of the proposed AXIOM Steward. It answers “where is the project now?” without pretending that branch names, pull-request prose, CI badges, or provider mergeability are truth.

It records authenticated GitHub observations and repository facts against one exact protected-main revision. Open fronts remain candidates. Human review and protected repository policy remain authoritative.

## Snapshot summary

| Measure | Observed value | Interpretation |
|---|---:|---|
| Branches | 345 | Includes main, stacked fronts, reconciliation branches, research, and historical working branches |
| Open GitHub issues | 63 | Excludes pull requests |
| Open pull requests | 48 | 46 draft; 2 marked ready |
| Combined open issue/PR count | 111 | GitHub repository `open_issues_count` combines the two classes |
| PRs based on exact snapshot main | 1 | #1383; every other open PR has a historical or stacked base SHA |
| PRs GitHub currently reports not mergeable | 6 | #1373, #1338, #1100, #1064, #1054, #1052 |
| Capability entries | 50 | Authoritative registry count at the snapshot |
| Implemented | 31 | Registry state, not a universal production-readiness claim |
| Adapter required | 9 | Available only through missing or external adapter work |
| Disabled | 4 | Includes `research.autonomy` and `workforce.embodied` |
| Experimental | 4 | Not production promotion |
| Specified | 2 | Contract/design state only |

The `111` repository count must not be reported as “111 issues plus 48 PRs.” It is `63 + 48 = 111`.

GitHub's `mergeable` field is a transient provider observation. “Mergeable” does not mean correct, current, reviewed, complete, or safe to merge.

## Branch distribution

The 345 branches group by first path segment as follows:

| Prefix | Count | Prefix | Count |
|---|---:|---|---:|
| `agent` | 118 | `architecture` | 16 |
| `audit-remediation-2026-08-30` | 1 | `axiom-one` | 1 |
| `chore` | 3 | `ci` | 11 |
| `claude` | 1 | `codex` | 20 |
| `community` | 1 | `copilot` | 1 |
| `deprecated` | 1 | `design` | 4 |
| `docs` | 22 | `feat` | 18 |
| `feature` | 33 | `fix` | 11 |
| `hardening` | 1 | `integration` | 17 |
| `main` | 1 | `maintenance` | 1 |
| `noop` | 1 | `noop2` | 1 |
| `perf` | 1 | `product` | 3 |
| `productization` | 1 | `reconcile` | 29 |
| `research` | 4 | `runtime` | 1 |
| `security` | 15 | `social` | 1 |
| `spec` | 1 | `test` | 5 |

A branch count is not a work count. Several branches form stacks, several pursue overlapping outcomes, and preserved historical branches may remain valuable evidence. No branch is deletion-eligible from naming or age alone.

## Authoritative current state

At this snapshot, only the exact protected-main tree defines the current repository build and supported documentation boundary.

The following foundations are already present on main and should be reused:

- Assurance Graph A0 with exact base/head digests, dependency and supersession edges, provider observations, evidence classes, and explicit lifecycle states;
- Measurement Source Envelopes binding recorder, method, implementation, configuration, environment, clock uncertainty, source artifact, normalized result, and reproduction status;
- Path Observation Evidence;
- Agent Commons and finite human-sponsored machine-principal boundaries;
- runtime adapter and connector-fabric contracts;
- extensible provider substrate and cognitive topology documents;
- sovereign composition, continuity, and intelligence-selection designs;
- repository-effect outbox and docs-only repository operator;
- AXIOM Host and Compute Node Profile boundaries;
- the invariant `Gateway -> Hypervisor -> Sandbox -> Grid`.

The repository operator may prepare a docs-only draft pull request. It does not gain merge, close, deletion, promotion, policy, capability, credential, deployment, or runtime-effect authority.

## Open pull-request fronts

This table records every open pull request observed in the snapshot. Head and base SHAs are exact provider observations. “Historical/stack base” is descriptive; it does not itself prove stale semantics because the base may be an intentional dependency.

| PR | Title | Working domain | Review state | Exact head SHA | Exact base SHA | Base relation | Provider mergeability |
|---:|---|---|---|---|---|---|---|
| [#1383](https://github.com/Zoverions/AXIOM-MESH/pull/1383) | docs: define Cognitive Continuity & Learning Economics | Cognition / continuity / assurance | draft | `1185537989fb8e1e63c37552179e1a69e2f6fa0c` | `403f678e8e35b7ae7a08ff37a8c86631337b5cd6` | exact current main | GitHub reports mergeable |
| [#1379](https://github.com/Zoverions/AXIOM-MESH/pull/1379) | feat: govern cognitive selection authorization | Cognition / continuity / assurance | draft | `05f38a2a69a7cb200635dfb59a5f3085c8ba7c88` | `bb089bfe999cdadc3a14f4369c0c4c6001d99c2f` | historical/stack base | GitHub reports mergeable |
| [#1373](https://github.com/Zoverions/AXIOM-MESH/pull/1373) | Add cognitive recovery observability v0 | Cognition / continuity / assurance | draft | `f6dd13083931595b73ac7820fbcf69814290c591` | `f73fdf29ee87f998f6a1fe567712e7c34cb081c9` | historical/stack base | GitHub reports not mergeable |
| [#1372](https://github.com/Zoverions/AXIOM-MESH/pull/1372) | Harden collective authority and communication invariants | Collective authority / security | ready | `fd76e723fd3d9655dc08b3e8e91c988b8711ee7c` | `f73fdf29ee87f998f6a1fe567712e7c34cb081c9` | historical/stack base | GitHub reports mergeable |
| [#1367](https://github.com/Zoverions/AXIOM-MESH/pull/1367) | Security: close residual query and export-read hardening | Collective authority / security | draft | `583d51325657b0c64a35e942924bc859b0bdb78c` | `a7ab996b6c91312a25a1871f08f498fb4d30eb52` | historical/stack base | GitHub reports mergeable |
| [#1364](https://github.com/Zoverions/AXIOM-MESH/pull/1364) | Add durable external replay state v0 | Collective authority / security | draft | `4d637e8f71ed7edd86dec5149997c39d57a886f7` | `56a0aa055a6af5b9db49072ad9c57d1d3bb22e3b` | historical/stack base | GitHub reports mergeable |
| [#1362](https://github.com/Zoverions/AXIOM-MESH/pull/1362) | feat: normalize Beacon observations into Entity Assurance evidence | Cognition / continuity / assurance | draft | `dc3bba40d865ff66789dc42f03d60c5bf5649c76` | `87b8dc239ebfbbfe60eb7f97b01540d580cf502c` | historical/stack base | GitHub reports mergeable |
| [#1234](https://github.com/Zoverions/AXIOM-MESH/pull/1234) | [RECONCILIATION REQUIRED] Add inert Circle charter lifecycle and historical resolution | Circle / Social | ready | `4c11df15f412a5c704442f0c818a267e6d73be33` | `40c8cc1f4becfcecbc1a5bf32a0d8dce17241a30` | historical/stack base | GitHub reports mergeable |
| [#1348](https://github.com/Zoverions/AXIOM-MESH/pull/1348) | docs: harden persistent-agent objective containment | Cognition / continuity / assurance | draft | `fa49af593bbfac5cc554ac7df50beedc88d651bd` | `e2d494d68f5949b6ab55ffe77296d2d6c8b21598` | historical/stack base | GitHub reports mergeable |
| [#1338](https://github.com/Zoverions/AXIOM-MESH/pull/1338) | Add chain-neutral read-only blockchain boundary | Blockchain boundary | draft | `6e05fb34f09b21b2a2e6ad84e448abd5b04d9045` | `4790fbdb51bf0e7e0af1d369e24932050ba1f724` | historical/stack base | GitHub reports not mergeable |
| [#1336](https://github.com/Zoverions/AXIOM-MESH/pull/1336) | feat: add read-only delegation inspector | Collective authority / security | draft | `d995a60659879b665b6edc7ed13d401f83ab8945` | `64c2d8def8ff98db24675a15dd8eafbac533f92a` | historical/stack base | GitHub reports mergeable |
| [#1315](https://github.com/Zoverions/AXIOM-MESH/pull/1315) | Add fixed consumed-handoff read-system-facts admission | Agent effect path | draft | `c4c13d01c35ca6e173f61fd698b65adaa67d3f5f` | `e816136db24196cd82f34ee1e0e8291af1ea155f` | historical/stack base | GitHub reports mergeable |
| [#1311](https://github.com/Zoverions/AXIOM-MESH/pull/1311) | Add current-architecture one-time effect consumption gate | Agent effect path | draft | `5a0a51c4319bd8982fe234e060845e877e7328e2` | `e816136db24196cd82f34ee1e0e8291af1ea155f` | historical/stack base | GitHub reports mergeable |
| [#1137](https://github.com/Zoverions/AXIOM-MESH/pull/1137) | Add plan-bound read-system-facts effect laboratory | Agent effect path | draft | `4a9b4428cd8def4f44142ad4559570ede6b83a2a` | `5a936719e7e33777ea3f82540ed351430feb1636` | historical/stack base | GitHub reports mergeable |
| [#1293](https://github.com/Zoverions/AXIOM-MESH/pull/1293) | Bound Grid startup cost with truthful restart evidence | Grid scale | draft | `f0b80f0c2c06baaed539239fcd284d58b149117e` | `e816136db24196cd82f34ee1e0e8291af1ea155f` | historical/stack base | GitHub reports mergeable |
| [#1289](https://github.com/Zoverions/AXIOM-MESH/pull/1289) | Seal Circle store writes behind possession-bound admission | Circle / Social | draft | `df4fcdc17787095e6820e86e4d0d3a45fbaffc45` | `caaf181c27b781cc8f663576d46a1d836b129fff` | historical/stack base | GitHub reports mergeable |
| [#1287](https://github.com/Zoverions/AXIOM-MESH/pull/1287) | Compose accepted Social with lifecycle-guarded Circle storage | Circle / Social | draft | `caaf181c27b781cc8f663576d46a1d836b129fff` | `563291fc4193e38278918bc8efec54ffdf0e623c` | historical/stack base | GitHub reports mergeable |
| [#1284](https://github.com/Zoverions/AXIOM-MESH/pull/1284) | Bind verified release inputs to a non-authorizing install admission | Install / runtime | draft | `e012f7c82895afdf8f114bb52d3c7d687609a49c` | `863d3c6232baa2fca31df05ea71b5c484e6e1c82` | historical/stack base | GitHub reports mergeable |
| [#1282](https://github.com/Zoverions/AXIOM-MESH/pull/1282) | Add signed release/install manifest verification | Install / runtime | draft | `863d3c6232baa2fca31df05ea71b5c484e6e1c82` | `2d7b7a594c83814740eec67c214148323d27fb3f` | historical/stack base | GitHub reports mergeable |
| [#1281](https://github.com/Zoverions/AXIOM-MESH/pull/1281) | Add non-mutating Linux install planning and documentation impact policy | Install / runtime | draft | `2d7b7a594c83814740eec67c214148323d27fb3f` | `e816136db24196cd82f34ee1e0e8291af1ea155f` | historical/stack base | GitHub reports mergeable |
| [#1264](https://github.com/Zoverions/AXIOM-MESH/pull/1264) | Bound Hermes RUNTIME-002 identity probe | Install / runtime | draft | `e3033783cfc0a3abd2451ba1355c742366352ec5` | `1e7636c39de913a90c5ede24f3f4b4f4fba4bba4` | historical/stack base | GitHub reports mergeable |
| [#1251](https://github.com/Zoverions/AXIOM-MESH/pull/1251) | Authorize self-protective Circle lifecycle contractions | Circle / Social | draft | `563291fc4193e38278918bc8efec54ffdf0e623c` | `40c8cc1f4becfcecbc1a5bf32a0d8dce17241a30` | historical/stack base | GitHub reports mergeable |
| [#1233](https://github.com/Zoverions/AXIOM-MESH/pull/1233) | Add inert Circle membership credential lifecycle | Circle / Social | draft | `52b325ba00233a0f6d29e58261e738932e9fbd48` | `17c75f6c0fc1c1f509927df493a22af8d20c9d97` | historical/stack base | GitHub reports mergeable |
| [#1231](https://github.com/Zoverions/AXIOM-MESH/pull/1231) | Add inert multi-principal Circle simulation | Circle / Social | draft | `8ff2da00159ba0b1063001565736f5fb9591be1d` | `17c75f6c0fc1c1f509927df493a22af8d20c9d97` | historical/stack base | GitHub reports mergeable |
| [#1230](https://github.com/Zoverions/AXIOM-MESH/pull/1230) | Add user-sovereign social feed and curation contracts | Circle / Social | draft | `ef9161ed1a8befee8095f158b4ee67d17c65ed92` | `eb3614b3f8ccdd6c7f6367ceaaec5cc43c306534` | historical/stack base | GitHub reports mergeable |
| [#1228](https://github.com/Zoverions/AXIOM-MESH/pull/1228) | Add inert ActivityPub interoperability mapping contract | Circle / Social | draft | `269c33d69b8c2f2379026886b664374dff773b11` | `eb3614b3f8ccdd6c7f6367ceaaec5cc43c306534` | historical/stack base | GitHub reports mergeable |
| [#1176](https://github.com/Zoverions/AXIOM-MESH/pull/1176) | Compose accepted social storage with converged semantic memory | Circle / Social | draft | `8987e2b494aa21781a426834998eba12b0bda17d` | `29963f1792401062e301c6ee4d8851c368fc92f3` | historical/stack base | GitHub reports mergeable |
| [#1167](https://github.com/Zoverions/AXIOM-MESH/pull/1167) | Document semantic contagion and durable memory authority boundaries | Semantic memory | draft | `4bd0c12f16d6d9d00747bb74745ee6c2fdbb77e6` | `5753262e94cf797634cf9426f055de6f87a01bcb` | historical/stack base | GitHub reports mergeable |
| [#1146](https://github.com/Zoverions/AXIOM-MESH/pull/1146) | Add plan-bound sanitized-log effect laboratory | Agent effect path | draft | `e8837502205a07e98d1479e16935c9cc8bfc452d` | `4a9b4428cd8def4f44142ad4559570ede6b83a2a` | historical/stack base | GitHub reports mergeable |
| [#1131](https://github.com/Zoverions/AXIOM-MESH/pull/1131) | Add Linux isolation adapter conformance laboratory | Agent effect path | draft | `5a936719e7e33777ea3f82540ed351430feb1636` | `eaab4da57986f7abea111dd1fb5ef35ef63fa8ad` | historical/stack base | GitHub reports mergeable |
| [#1156](https://github.com/Zoverions/AXIOM-MESH/pull/1156) | Add plan-bound synthetic benchmark effect laboratory | Agent effect path | draft | `49aab64103f470508ad3cf15ad5bfee6bb323927` | `e8837502205a07e98d1479e16935c9cc8bfc452d` | historical/stack base | GitHub reports mergeable |
| [#1159](https://github.com/Zoverions/AXIOM-MESH/pull/1159) | Bind semantic memory ingestion to completed owner intent | Semantic memory | draft | `7766127dd92925fa99717d9c8c934049c7a8b176` | `188acd4566a9f1c22f75d75e10f8faaa5df7fa5c` | historical/stack base | GitHub reports mergeable |
| [#1149](https://github.com/Zoverions/AXIOM-MESH/pull/1149) | Invalidate stale semantic memory and derivation state | Semantic memory | draft | `188acd4566a9f1c22f75d75e10f8faaa5df7fa5c` | `b177a01415473422937a5522a5bf3edfd9877b92` | historical/stack base | GitHub reports mergeable |
| [#1154](https://github.com/Zoverions/AXIOM-MESH/pull/1154) | Add machine delegation policy candidate laboratory | Agent effect path | draft | `0c49542fe2a527f030758f7da1317fbddcd66da8` | `953314b4a3f736861a83492ac110be630fd3727e` | historical/stack base | GitHub reports mergeable |
| [#1140](https://github.com/Zoverions/AXIOM-MESH/pull/1140) | Add semantic memory provenance authority laboratory | Semantic memory | draft | `9ce93d109d8f99f52657f212db28e1183ab9c5f6` | `953314b4a3f736861a83492ac110be630fd3727e` | historical/stack base | GitHub reports mergeable |
| [#1147](https://github.com/Zoverions/AXIOM-MESH/pull/1147) | Separate semantic memory data from owner-instruction context | Semantic memory | draft | `b177a01415473422937a5522a5bf3edfd9877b92` | `d0177871b23c0da5e87bb52db71338a1f45566d2` | historical/stack base | GitHub reports mergeable |
| [#1144](https://github.com/Zoverions/AXIOM-MESH/pull/1144) | Bind semantic memory review to completed Grid evidence | Semantic memory | draft | `d0177871b23c0da5e87bb52db71338a1f45566d2` | `f1c24e3b13faa3dbb03a2688839ccd47be219b14` | historical/stack base | GitHub reports mergeable |
| [#1126](https://github.com/Zoverions/AXIOM-MESH/pull/1126) | Add platform-specific executor isolation profile laboratory | Agent effect path | draft | `eaab4da57986f7abea111dd1fb5ef35ef63fa8ad` | `d3a70b727ef7a882ea4710f02487258c1568b5e3` | historical/stack base | GitHub reports mergeable |
| [#1123](https://github.com/Zoverions/AXIOM-MESH/pull/1123) | Add durable atomic executor lifecycle state laboratory | Agent effect path | draft | `d3a70b727ef7a882ea4710f02487258c1568b5e3` | `d3c940de949379e53f536ea5dd448741cac46654` | historical/stack base | GitHub reports mergeable |
| [#1120](https://github.com/Zoverions/AXIOM-MESH/pull/1120) | Add virtual executor conformance sandbox laboratory | Agent effect path | draft | `d3c940de949379e53f536ea5dd448741cac46654` | `111d821cdfea66307e07c3e8026e75b4c23cf177` | historical/stack base | GitHub reports mergeable |
| [#1117](https://github.com/Zoverions/AXIOM-MESH/pull/1117) | Add pre-executor dry-run policy compiler and threat model | Agent effect path | draft | `111d821cdfea66307e07c3e8026e75b4c23cf177` | `eadb4a4e9f49a7106cd340d6ca9cff91d329b0e7` | historical/stack base | GitHub reports mergeable |
| [#1114](https://github.com/Zoverions/AXIOM-MESH/pull/1114) | Add test-session lifecycle ledger and executor-independent receipts | Agent effect path | draft | `eadb4a4e9f49a7106cd340d6ca9cff91d329b0e7` | `47bff25780c41da19d4f6cb7b7c94f93b7e2937d` | historical/stack base | GitHub reports mergeable |
| [#1110](https://github.com/Zoverions/AXIOM-MESH/pull/1110) | Add device attestation and ephemeral test-session authorization | Agent effect path | draft | `47bff25780c41da19d4f6cb7b7c94f93b7e2937d` | `9576400e47165763b1e49221ef103ba9e924e62f` | historical/stack base | GitHub reports mergeable |
| [#1100](https://github.com/Zoverions/AXIOM-MESH/pull/1100) | Social S3G7B2b: exact Hypervisor-to-Grid admission finalizer | Circle / Social | draft | `a1fd5f4150a5e76ec5f07fe9ef8a677bc60d66d4` | `fa160f380314249f82789d0bdf8f4f3c03025e39` | historical/stack base | GitHub reports not mergeable |
| [#1064](https://github.com/Zoverions/AXIOM-MESH/pull/1064) | Health Mesh foundation architecture and safety contracts | Health | draft | `775864bcb5496ecd873d6670fe7edde19f2a9ded` | `0b41429bb1bbb716089874b70cc57a5bb68ea527` | historical/stack base | GitHub reports not mergeable |
| [#1054](https://github.com/Zoverions/AXIOM-MESH/pull/1054) | Lab: build the first AXIOM Host VM appliance | Host / storage | draft | `2a3bd716763a1ba00622ccc0240254e3b0aa905c` | `4d3ddbbe1b9baded8d57d8115a11dee3a1d8e26c` | historical/stack base | GitHub reports not mergeable |
| [#1052](https://github.com/Zoverions/AXIOM-MESH/pull/1052) | Architecture: define AXIOM Host operating environment | Host / storage | draft | `5f8defd99618690d1eeaeb6b082e7fda7c899f67` | `4d3ddbbe1b9baded8d57d8115a11dee3a1d8e26c` | historical/stack base | GitHub reports not mergeable |
| [#1048](https://github.com/Zoverions/AXIOM-MESH/pull/1048) | Research: define agent worktree storage plane | Host / storage | draft | `5278fa6945b3cff9f88b6e9ab13a4ded5e8ea363` | `4d3ddbbe1b9baded8d57d8115a11dee3a1d8e26c` | historical/stack base | GitHub reports mergeable |

### Immediate conflict findings

1. **Circle charter reconciliation is explicitly unresolved.** #1234 and cumulative #1251 are not safely interchangeable. Issue #1351 records stronger late charter behavior in #1234 that the cumulative candidate does not carry. Neither front should be closed as superseded until exact behavior is reconciled and retested.
2. **Most candidates do not start from current main.** Forty-seven of forty-eight open PRs use a historical or stacked base. This is not automatic rejection, but exact currentness and dependency evidence are required before merge consideration.
3. **Open stacks need explicit graph edges.** Install (#1281 -> #1282 -> #1284), Circle/Social (#1251 -> #1287 -> #1289), executor laboratories (#1110 through later effect labs), and semantic-memory fronts encode important head/base relationships that prose alone cannot safely preserve.
4. **Provider mergeability is insufficient.** Six fronts currently report non-mergeable; the other forty-two still require semantic, security, currentness, and evidence review.
5. **PR status prose can drift.** Prior repository observations have shown a PR description saying draft/unmerged while exact main already contained the work. The Assurance Graph and protected-main tree must outrank stale narrative.
6. **Currentness is temporal.** CI evidence tied to a former head, former base, or former policy remains historical evidence and must not be labeled current for a moved front.

## Open-issue landscape

The 63 non-PR issues divide into a few load-bearing programs:

### Project convergence

- #1042 — repository convergence DAG and completeness fixed point;
- #1056 — machine-verifiable assurance dependencies and active fronts;
- #1058 — rebuild assurance, actor-state, and context fronts on hardened current main;
- #1351 — reconcile Circle charter hardening.

The Steward directly advances this program by projecting exact observations into the merged Assurance Graph rather than inventing a parallel tracker.

### Scale and stability

- #894 — Grid startup proportional to unapplied suffix;
- #895 — bounded and pooled internal signed request path;
- #896 — pagination and streamed Grid artifacts;
- #897 — cardinality, concurrency, soak, and restart evidence;
- #899 — consensus and verifiable-governance compatibility;
- #1215 — restart replay window;
- #1200 and #1347 — timing and macOS portability;
- #1293 candidate — bounded startup evidence.

These issues are evidence that mesh scaling cannot be treated as a solved property.

### Agent Commons and bounded effects

- #1101, #1106, #1109, #1112, #1116, #1119, #1122, #1125;
- #1130, #1135, #1138, #1141, #1142, #1155;
- #1171, #1172, #1185, #1196, #1199, #1204;
- #1310, #1312, #1316.

This is the strongest existing lineage for participant roles, device evidence, independent receipts, isolation, one-operation effects, and external verification.

### Product and domain programs

- Social and publication: #999, #1065, #1071, #1075, #1081, #1091, #1093, #1096, #1226, #1227;
- Host and storage: #1048 candidate, #1051, #1052 candidate, #1053, #1054 candidate, #1063;
- Community Testnet: #1221;
- Health: #1064 candidate;
- identity/runtime probe: #1264 candidate;
- maintenance: #1350;
- governance, state, recovery, and cryptographic agility: #991, #992, #993, #997, #998, #1001, #1004, #1012;
- specialist-model research: #1040.

A candidate implementation must declare which program it composes and which it leaves untouched.

## Consolidation classification

Every active front should receive exactly one primary lifecycle plus explicit edges.

| Lifecycle | Use |
|---|---|
| `current-main` | Exact protected-main state |
| `active` | Current candidate with a distinct supported outcome |
| `stack-child` | Candidate whose base is another candidate dependency |
| `research` | Inert study, benchmark, or planning work |
| `evidence-only` | Preserved observation without promotion intent |
| `superseded` | Outcome fully represented by a named successor with verified preservation |
| `rebuild-required` | Valuable intent cannot safely merge from its present base/content |
| `promotion-candidate` | Implementation and evidence are complete enough for explicit promotion review |

The following rules are mandatory:

- `superseded` requires a named successor and exact preservation evidence; similarity is not enough.
- `rebuild-required` preserves the source branch and records the stronger semantics to forward-port.
- `stack-child` records exact dependency head and base, not merely a PR-number sentence.
- a provider observation cannot assign `promotion-candidate` on its own.
- a front may have many secondary tags, but only one primary lifecycle at a snapshot.
- a moved head creates a new observation; previous CI evidence stays historical.
- conflicting candidates remain separate until a reviewer records the chosen outcome and preservation evidence.

## Recommended consolidation order

### P0 — establish the Steward snapshot contract

1. Define the provider-observation shape for repositories, PRs, branches, CI conclusions, and exact tree/file digests.
2. Project this snapshot into candidate Assurance Graph records.
3. Add deterministic findings for moved base/head, stale CI, missing dependency, duplicate outcome, and missing supersession.
4. Preserve this document as a human-readable view generated from or checked against the machine snapshot.

This is read-only and does not change any candidate's lifecycle in GitHub.

### P1 — reconcile existing high-value fronts

Review in dependency groups, not update order:

1. Circle charter conflict: #1234, #1251, #1287, #1289, issue #1351.
2. Agent effect path: #1110 through #1156, then #1311 and #1315 against current architecture.
3. Semantic memory: #1140, #1144, #1147, #1149, #1159, #1167, #1176.
4. Install: #1281, #1282, #1284.
5. Current cognition and assurance: #1362, #1373, #1379, #1383.
6. Host, storage, health, and Social fronts as separate programs.

The output is a preservation/rebuild decision for each front, not a bulk merge.

### P2 — add Participant Manifest v0

After written design review, add an inert schema and validator that reference existing identity, provider, host, and evidence contracts. No enrollment or authority change.

### P3 — implement the read-only Steward

Operate first on checked-in fixtures, then authenticated provider observations. Any draft PR preparation remains a separately authorized docs-only repository effect.

### P4 — run one bounded Research Verification Cell

Use governed cognitive selection and provider profiles. Produce a terminal research receipt. Do not enable `research.autonomy`.

### P5 — evaluate Linux participant and leaf laboratories

Only after P0-P4 evidence exists should the project propose Participant Runtime, Leaf SDK, network scale, or embodied-device work.

## Canonical current-system map

| Layer | Current source of truth | Candidate extension |
|---|---|---|
| Governance and authority | Constitution, policy, capability registry, Gateway/Hypervisor/Sandbox/Grid | No change in this design |
| Identity and principals | Current identity, actor, machine-principal, and Agent Commons contracts | Participant Manifest references them |
| Runtime and providers | Runtime adapters, connector catalog, cognitive/provider profiles | Participant role and receipt bindings |
| Host and compute | Generic supported hosts plus Compute Node Profile; AXIOM Host remains candidate/reference work | Participant device tiers |
| Evidence | Grid receipts, Assurance Graph, source/path envelopes | Research and participant receipts |
| Repository coordination | Protected main, authenticated GitHub observations, docs-only operator | Read-only Steward projection |
| Networking | Existing service-network policy and bounded current runtime | Future selective subject federation, separately proved |
| Embodiment | Disabled `workforce.embodied` and local-safety architecture work | Future simulator and skill-capsule laboratory |
| Autonomous research | Disabled `research.autonomy` | Operator-initiated bounded cell only |

## First Steward acceptance test

Given an immutable fixture containing this snapshot, the first Steward implementation succeeds only if it deterministically:

- reports 345 branches, 63 issues, and 48 pull requests without double-counting;
- binds main to `403f678e8e35b7ae7a08ff37a8c86631337b5cd6`;
- records all 48 exact PR head/base pairs;
- identifies #1383 as the sole PR based on the exact snapshot main;
- identifies the six provider-reported non-mergeable PRs without calling the other forty-two safe;
- surfaces #1234/#1251 as an unresolved preservation conflict;
- detects the install, Circle, executor, and semantic-memory stack relationships;
- marks provider observations non-authoritative;
- produces no repository write, merge recommendation, capability promotion, or runtime effect;
- emits the same canonical digest when given the same normalized fixture.

A live GitHub adapter is accepted only after the fixture path passes and the adapter preserves pagination, rate-limit, partial-result, currentness, and authentication metadata.

## Risks and controls

| Risk | Control |
|---|---|
| Snapshot becomes stale | Exact timestamp/SHA, expiry, refreshed provider observations |
| Automated classification hides nuance | Preserve source prose, emit evidence and conflicts, require human decision |
| Branch cleanup destroys provenance | No deletion authority; require named successor and preservation evidence |
| Current-main bias erases valuable research | Separate “not current” from “not valuable” |
| PR-count optimization encourages unsafe closure | Measure resolved outcomes and preservation, not lower counts |
| GitHub outage becomes project outage | Cache signed snapshots and maintain provider-independent source continuity |
| Steward output is mistaken for authority | Hard non-authority constants and draft-only effect boundary |
| Sensitive branch data leaks | Scope observations, minimize payloads, honor repository visibility |

## Snapshot refresh and validity

This map is valid only for the named main SHA and observation date. A refresh creates a new snapshot; it does not silently edit historical facts.

A later Steward should compute:

- source observation digest;
- normalized snapshot digest;
- prior snapshot reference;
- added, moved, merged, closed, reopened, and missing fronts;
- capability and policy deltas;
- evidence-currentness deltas;
- unresolved conflicts carried forward.

The refresh remains a proposal until reviewed.

## Non-claims

This map does not claim:

- that any open PR is correct, current, complete, safe, or unsafe to merge;
- that “GitHub reports mergeable” is an AXIOM verification result;
- that old-base work lacks value;
- that the listed domain grouping is an authoritative ownership or dependency assignment;
- that all 345 branches are active or should be deleted;
- that 31 implemented capabilities are globally production-ready;
- that current scaling, federation, research autonomy, or embodied work is enabled;
- that a consolidation decision has been made for any front;
- that repository observations grant authority.
