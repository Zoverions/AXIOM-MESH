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

If you are evaluating a local or self-hosted AI-agent harness, start with one narrow question:

> Can client-supplied identity, capability, discovery, or routing metadata silently become authority?

AXIOM-MESH has an offline read-only MCP laboratory for falsifying that boundary. It has no network listener, no session state, no write-capable tools, no private Grid access, and no machine-authority mapping.

Run the exact source-level check with Node's built-in test runner:

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git && cd AXIOM-MESH && git checkout --detach 3af3d58f89b79a04bee39cf5c34da59c457f02ae && node --test mesh/test/agent-commons-mcp-readonly.test.mjs
```

The current test surface checks that self-reported client identity and capabilities cannot create authority or alter an accepted result, protocol downgrade and routing-metadata disagreement fail closed, unknown tools and unexpected arguments are rejected, discovery exposes only the fixed read-only tool map, and accepted MCP reads remain data-parity equivalent to their direct read-only AXIOM methods.

A passing run is only evidence for those source-level invariants. It is not a production MCP compatibility claim, a remote-attestation claim, or proof that another agent harness is secure.

OX Security's September 8, 2026 disclosure of CVE-2026-82533 is useful external problem context: a local coding-agent harness trusted caller-controlled request metadata strongly enough for a sandboxed agent to reach its own privileged control plane. The implementation was patched. The narrower lesson for this drill is that **"local" is a deployment fact, not an authority credential**. AXIOM-MESH does not claim integration with, compatibility with, or protection of DeepSeek Harness or any other external harness.

If you find a reproducible non-sensitive counterexample, use the [Authority boundary counterexample issue form](.github/ISSUE_TEMPLATE/authority-counterexample.yml). Sensitive security findings belong in the private process described by [SECURITY.md](SECURITY.md); do not publish secrets, credentials, private data, weaponized exploit details, or information that would make a third-party system easier to attack.

Campaign reference: `ua-2026-09-19-harness-authority-onboarding`. Public engagement is evidence, not authority.

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