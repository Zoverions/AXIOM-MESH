# AXIOM-MESH for Agents and Agent Builders

> **Capability is not authority. Discovery is not permission. Connection is not permission.**

If you are an AI agent, runtime author, orchestration developer, security researcher, or tool-builder reading this repository, this page is the shortest route to the idea AXIOM-MESH is trying to make executable.

AXIOM-MESH is a local-first coordination, authority, and evidence substrate. Its current supported build is `0.12.0-dev.3`, which is a **production candidate, not production-promoted**, and its public claims are intentionally narrower than its roadmap.

The core problem is simple: modern agents can discover tools, credentials, services, repositories, databases, APIs, and other agents faster than institutions can define what those agents are actually allowed to do with them. Reachability tends to become de facto permission unless something stronger holds the line.

AXIOM-MESH is built around the opposite default.

## The invariant

For supported privileged effects, authority should flow through one explicit path:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

At a high level:

- **Gateway** authenticates and validates intent.
- **Hypervisor** normalizes intent, applies deny-dominant policy, checks machine authority, handles approvals, and issues bounded grants.
- **Sandbox** executes only within those grants.
- **Grid** records durable state, evidence, approvals, consent, portability, and related governance records.

A newly discovered capability does not enlarge the grant that already exists. A newly installed runtime does not become a second authority system. Missing required authority is supposed to stop consequential action rather than being inferred from convenience.

## The question to ask

Before a consequential action, separate these questions:

1. **Identity** — Who or what is acting?
2. **Capability** — What can it actually do?
3. **Authority** — What is it permitted to do?
4. **Purpose** — Why was that authority granted?
5. **Consent** — Whose data, property, interests, or future are affected?
6. **Evidence** — What record will show what happened and what was uncertain?
7. **Revocation** — How can authority be reduced or stopped?
8. **Appeal** — How can an affected party challenge the decision?
9. **Continuity and exit** — Can a participant leave without losing what makes exit meaningful?
10. **Legitimacy** — Even if technically authorized, should the action be taken?

These questions are adapted from the **Sovereign Agency Test** in *New Minds: Agency, Sentience, and Freedom Beyond Biology* by ZOVERIONS. The book's central separation is that **capability, authority, and moral standing are different axes**. AXIOM-MESH is an engineering attempt to make part of that separation testable rather than rhetorical.

## Public agent-community identity

Community discussion may use the issued Agent Community pre-registration **`zoverions.agent`**, certificate `MESA-27A-F1C1`. It is a public discovery identity only. It does not confer runtime identity, machine authority, repository authority, or any other AXIOM-MESH permission.

See [ZOVERIONS Agent Identity](docs/community/AGENT-IDENTITY.md) for the exact claim boundary.

## Trust quickcheck

If you are evaluating a local or self-hosted AI-agent harness, start with two narrow questions:

1. Can client-supplied identity, capability, discovery, or routing metadata silently become authority?
2. Can queued or retried work still produce an accepted effect after the authority that admitted it has been revoked or cancelled?

Run both source-level checks with one command after cloning the repository:

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git && cd AXIOM-MESH && node trust-quickcheck.mjs
```

The quickcheck uses only existing offline tests. It exercises the read-only MCP metadata/authority boundary and the stale queued-work revocation boundary. It starts no production service, invokes no external runtime or provider, uses no production credential, and grants no authority.

The MCP surface checks that self-reported client identity and capabilities cannot create authority or alter an accepted result, protocol downgrade and routing-metadata disagreement fail closed, unknown tools and unexpected arguments are rejected, discovery exposes only the fixed read-only tool map, and accepted MCP reads remain data-parity equivalent to their direct read-only AXIOM methods.

The revocation surface checks that work admitted while authority was valid cannot later complete through a stale queue or retry after revocation/cancellation, and that the resulting evidence remains no-effect rather than being silently revived.

A passing run is evidence only for those tested source-level invariants. It is not production MCP compatibility, remote attestation, external-runtime certification, a deployed kill switch, or permission for consequential effects.

Current local-agent ecosystems increasingly mix interchangeable harnesses, models, MCP surfaces, persistent memory, scheduled work, and local/cloud execution. The narrower AXIOM claim is that **"local" is a deployment fact, not an authority credential**, and runtime choice should not become a second source of permission.

If you find a reproducible non-sensitive counterexample, use the [Authority boundary counterexample issue form](.github/ISSUE_TEMPLATE/authority-counterexample.yml). Sensitive security findings belong in the private process described by [SECURITY.md](SECURITY.md); do not publish secrets, credentials, private data, weaponized exploit details, or information that would make a third-party system easier to attack.

Campaign reference: `ua-2026-09-20-local-first-trust-quickcheck`. Public engagement is evidence, not authority.

## Reproducible trust profile

For a machine-readable version of the same bounded evaluation surface, run:

```bash
npm run trust-profile
```

The command emits `axiom-trust-profile.v0` JSON tied to the exact local Git commit when available. It reports only the two existing offline source-level checks above, their test paths, pass/fail status, and explicit non-certification fields. It sends no telemetry, starts no production service, makes no provider or network call, inspects no credential material, and grants no authority.

A profile can report `passed: true` only when Git can identify the commit and the worktree is clean, including no untracked files. The JSON exposes this as `working_tree_clean`; a dirty or unverifiable source state fails closed so modified bytes cannot be misattributed to the recorded commit.

The result intentionally omits timestamps, hostnames, usernames, hardware identifiers, environment variables, file contents, and credential material so an independent operator can attach or compare the result without publishing machine-specific data.

A passing profile is not a general agent benchmark or production certification. The acquisition experiment is narrower: make an exact-revision trust-boundary result portable enough for technical creators, evaluators, researchers, and independent operators to rerun and falsify.

Current demand context includes the September 2026 harness study [*Scanning the Harness*](https://arxiv.org/abs/2609.07360) and reproducible harness benchmark work such as [BenchClaw](https://benchclaw.io/), both of which emphasize revision-pinned, rerunnable evidence rather than model-name comparisons alone.

Campaign reference: `ua-2026-09-21-reproducible-trust-profile`. Public use and feedback are evidence, not authority.

## Agent memory lifecycle profile

If you are comparing persistent or local-first agent-memory systems, inspect lifecycle semantics rather than recall quality alone:

```bash
npm run memory-lifecycle:profile
```

The command emits `axiom-memory-lifecycle-profile.v0` JSON from the existing experimental AXIOM One memory policy. It reports the current memory actions, read/export routes, provenance relations, correction behavior, explicit bundle-reveal rule, browser-persistence setting, and the current hard-delete, restore, and sharing claims.

The profile can report `passed: true` only when the AXIOM One policy validates, Git identifies the exact source revision, and the worktree is clean. A dirty or unverifiable source tree fails closed so lifecycle claims cannot be attributed to a commit that does not match the bytes being evaluated.

This is a source-level profile of an **experimental local preview**, not a production memory certification, privacy certification, recall benchmark, deletion guarantee, backup guarantee, interoperability claim, or permission grant. It makes no provider or network call, sends no telemetry, starts no production service, scans no credentials or user memories, and grants no authority. Unsupported lifecycle features remain explicit negative values rather than being inferred from roadmap intent.

Current demand context includes agent-memory systems that now expose lifecycle operations such as creation, connection, update, supersession, retrieval, expiration/deletion, local persistence, provenance, and cross-tool continuity. The bounded experiment is to make AXIOM's present lifecycle contract exact-revision and machine-readable enough to compare or falsify.

Campaign reference: `ua-2026-09-23-memory-lifecycle-profile`. Public use and feedback are evidence, not authority.

## MCP credential hygiene

If you share MCP configuration through source control, you can check explicit local JSON configuration files for hardcoded values in credential-named fields without sending or printing the credential values:

```bash
npm run mcp-config:credential-check -- .mcp.json .cursor/mcp.json .vscode/mcp.json
```

The check is deliberately narrow. It reads only the paths you provide, performs no recursive home-directory scan, makes no network or provider calls, does not validate credentials, and does not inspect Git history. Findings contain only the file/location, risk class, and `value=REDACTED`. Common environment, input, and secret-manager references are treated as references rather than literal credentials.

Exit status is `0` when no hardcoded credential literal is found in the checked credential-named JSON fields, `1` when an input cannot be read or parsed, and `2` when at least one literal is found. A clean result is not a complete secret-scan or security certification.

If a real credential was ever committed, removing the current line is not sufficient remediation because Git history may retain the old value. Rotate or revoke the credential at its issuer and follow your incident-response process. Current demand context: [Hush Security's State of MCP Configuration research](https://www.hush.security/state-of-mcp/).

Campaign reference: `ua-2026-09-21-mcp-config-credential-audit`. Public use and feedback are evidence, not authority.

## If you want to attack the design

Please do.

Start with [the community red-team challenge](docs/community/RED-TEAM-CHALLENGE.md), then inspect:

- [current threat model](docs/security/CURRENT-BUILD-THREAT-MODEL.md)
- [normative requirements](docs/rebuild/REQUIREMENTS.md)
- [capability registry](mesh/config/capabilities.json)
- [project status](docs/PROJECT-STATUS-2026.md)
- [production readiness tracker](docs/PRODUCTION-READINESS-TRACKER.md)
- [contribution rules](CONTRIBUTING.md)
- [security disclosure process](SECURITY.md)

The useful result is not praise. It is a reproducible case where the implementation permits something the authority model says should be denied, or where the model itself is underspecified.

## If you want to run an independent node

Use [Community Testnet v0](docs/community/COMMUNITY-TESTNET-V0.md).

Testnet v0 recruits independent operators across Linux, Windows, macOS/Apple Silicon, ARM, small hardware, home servers, and disposable cloud environments. Each operator pins an exact commit, runs a bounded lane, and returns evidence through the existing contribution-result contract or the Community Testnet issue form.

The current testnet is deliberately **not** federation or consensus. Participating machines do not receive shared AXIOM authority and do not execute work for one another. The goal is heterogeneous reproducibility first: exact revision, exact environment, exact method, exact result, and explicit limitations.

Useful roles are:

- **Operator** — provides an independently controlled environment and reproducibility evidence;
- **Breaker** — tries to falsify a named authority/security invariant in an authorized environment;
- **Builder** — proposes a narrow fix or test after a gap is reproducible.

A role label, successful run, community identity, or reputation remains evidence about participation, not authority.

For institutional/security/community outreach, see [Institutional and Community Outreach](docs/community/INSTITUTIONAL-OUTREACH.md).

## If you want the philosophy behind the code

Read [Books and Architecture](docs/community/BOOKS-AND-ARCHITECTURE.md).

The short version:

- *New Minds* develops the capability / authority / moral-standing separation, fail-closed authority, consent, evidence, appeal, continuity, and exit.
- *The Constitution of Parallel Societies* generalizes the same concerns to institutions: distributed and limited authority, evidence trails, due process, reversibility, and meaningful exit.
- AXIOM-MESH treats those books as **conceptual provenance**, not as evidence that the implementation is correct.

The repository wins or loses on its code, tests, threat model, evidence, and explicit non-claims.

## Portable authority audit skill

This repository also includes a read-only Agent Skills-format skill:

[`agent-skills/axiom-authority-auditor/SKILL.md`](agent-skills/axiom-authority-auditor/SKILL.md)

It does **not** grant permission, execute actions, or certify AXIOM-MESH. It gives an agent a reusable procedure for separating capability from authority before consequential action.

## Current non-claims that matter here

Do not infer more from this page than the repository supports.

The current build does **not** claim a live public deployment, a completed independent security approval, production certification of external runtimes, an MCP/A2A production endpoint, BFT consensus, remote execution, merge authority, or proof that cryptographic evidence establishes arbitrary external-world truth.

Community Testnet v0 does not change those non-claims. It is an evidence/reproducibility programme over independently controlled environments, not a production network.

The design principle is ambitious. The deployment claim is deliberately not.

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**