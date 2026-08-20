# AXIOM-MESH Community Testnet v0

**Status:** public participation design; distributed evidence network; not a federated AXIOM runtime

**Updated:** 2026-08-20

AXIOM-MESH Community Testnet v0 is a way for independent people, agents, researchers, and hardware operators to run the same repository revision on different environments and return reviewable evidence.

The word **testnet** is intentionally narrow here. v0 does **not** claim WAN federation, cross-node execution, BFT consensus, shared production authority, autonomous delegation, or a public AXIOM service. GitHub remains the canonical collaboration surface, and every participating machine remains under its own operator's control.

The purpose is to answer a simpler question first:

> Can independently controlled machines reproduce the same authority, failure, portability, lifecycle, and evidence properties on exact source revisions?

## Core model

```text
                 canonical GitHub revision
                          |
              exact 40-hex commit selected
                          |
       +------------------+------------------+
       |                  |                  |
   Linux/x64          Windows/x64        macOS/ARM64
       |                  |                  |
       +----------+-------+---------+--------+
                  |                 |
             other ARM/edge    unusual environments
                  |                 |
                  +--------+--------+
                           |
                 contribution result
                           |
             GitHub issue / PR / evidence
```

No node becomes authoritative because it is online, popular, old, fast, well-known, or operated by a trusted organization. Multiple matching results increase confidence in reproducibility; they do not create protocol consensus or AXIOM authority.

## Participation roles

A participant may use one or more of these public roles:

### Operator

Provides an independently controlled environment and runs an exact revision. Useful environments include:

- Linux x86-64;
- Linux ARM64;
- Windows;
- macOS, especially Apple Silicon;
- Raspberry Pi or similar edge hardware;
- home servers;
- disposable cloud VMs;
- unusual filesystems, container runtimes, CPU classes, or constrained machines.

An operator is not expected to find a vulnerability. A clean reproduction with precise limitations is useful evidence.

### Breaker

Attempts to falsify a named AXIOM invariant in an authorized local, repository-owned, or disposable environment. Start with the existing [community red-team challenge](RED-TEAM-CHALLENGE.md) and Security Agent Cell pilot rather than inventing an unbounded target.

### Builder

Proposes a narrow patch or test after a behavior is reproducible or an evidence gap is clear. Builder status never implies merge, deployment, credential, release, or production-promotion authority.

These labels describe work performed. They are not credentials or permissions.

## v0 lanes

A result should identify at least one lane.

### T0 — baseline reproducibility

Goal: prove an exact revision can be prepared and checked on a distinct environment.

Recommended repository-native path from a clean checkout:

```bash
git checkout <exact-40-hex-commit>
npm run doctor
npm run setup:check
npm run check
```

If the operator installs dependencies or runs additional commands, report the exact commands and resulting environment rather than describing the run only as "passed."

### T1 — authority-boundary negatives

Goal: attempt a named deny/fail-closed property such as:

- capability does not become authority;
- discovery does not become permission;
- identity does not become permission;
- stale or mismatched grants fail closed;
- purpose, destination, budget, or scope cannot widen through composition;
- alternate protocol/runtime metadata cannot create a second authority path.

Use the existing Security Agent Cell target and reporting machinery where applicable.

### T2 — lifecycle and restart

Goal: exercise restart, replay, recovery, one-use consumption, revocation, expiry, and failure-state behavior that can be tested safely on contributor-controlled systems.

A restart result should distinguish availability loss from authority restoration. Do not convert uncertainty into success.

### T3 — evidence and chain verification

Goal: independently exercise Grid/evidence verification, tamper detection, continuity assumptions, exported evidence packages, or other exact proof/non-proof boundaries.

A valid local chain is not a claim of global consensus or external-world truth.

### T4 — portability and platform variation

Goal: identify platform-specific behavior across Windows, macOS, Linux, ARM, container/no-container, filesystem, and resource-constrained environments.

A platform result is scoped to the exact hardware/software configuration reported. It does not certify all machines of that class.

### T5 — constrained hardware / soak candidate

Goal: collect practical resource evidence on small or unusual machines without changing the production-readiness claim.

Useful observations include setup friction, startup time, memory pressure, filesystem behavior, restart behavior, and bounded test throughput. Authentic long-duration pilot evidence remains separate from a community smoke test.

## Result format

Prefer the existing machine-readable contribution package:

- `agent-readiness/CONTRIBUTION-RESULT.schema.json`
- `agent-readiness/CONTRIBUTION-RESULT.example.json`
- `agent-readiness/CONTRIBUTION-TRIAGE.txt`

The Community Testnet issue form is a human-friendly wrapper for the same evidence discipline.

At minimum, report:

- exact 40-hex commit;
- role and lane;
- operating system, architecture, runtime versions, and relevant hardware/resource limits;
- whether the environment is contributor-owned, repository-owned, or disposable;
- exact commands or procedure;
- observed result, including failures;
- non-sensitive evidence digests or locators where useful;
- whether the result reproduced a prior claim independently;
- limitations, uncertainty, and anything not tested.

Do **not** report a moving branch name such as `main` as the tested artifact without also recording the exact commit.

## Evidence states

Community results may be described using bounded states such as:

- `submitted` — evidence has been provided but not independently checked;
- `reproduced` — another participant reproduced the named behavior on an exact revision/environment;
- `not_reproduced` — a named attempt failed to reproduce under the reported conditions;
- `accepted_evidence` — the project has reviewed the package as useful evidence for a specific claim;
- `superseded` — later source or evidence changed the relevant claim;
- `invalidated` — the result was shown to be incorrect, mismatched, fabricated, or non-reproducible.

None of these states is a security certification, reputation score, capability token, or authority grant.

## Safety boundary

Public Testnet work is limited to:

- this repository;
- participant-owned systems;
- repository-owned systems; or
- explicitly disposable environments the participant is authorized to use.

Do not test third-party accounts, networks, services, organizations, or hardware without separate authorization. Do not publish secrets, private keys, bearer tokens, personal data, production data, unpublished sensitive vulnerabilities, or infrastructure details that should remain private. Route sensitive security findings through `SECURITY.md`.

Community Testnet participation grants no authority to merge, deploy, publish releases, alter protected branches, spend funds, provision credentials, activate protocols, operate third-party infrastructure, take custody of hardware, or promote a capability to production.

## What v0 is trying to learn

The highest-value early questions are practical:

1. Can a new participant get from clone to a trustworthy result without private operator knowledge?
2. Which platforms fail, and why?
3. Which authority invariants are independently reproducible?
4. Which current tests accidentally depend on one OS, filesystem, clock, runtime detail, or hardware assumption?
5. Can negative evidence be reported clearly without being flattened into pass/fail marketing?
6. Can outside participants produce useful evidence without receiving repository or runtime authority?

## What would justify v1

A future Testnet v1 may consider controlled inter-node experiments only after v0 produces enough independent operators and evidence to justify the additional protocol surface.

Possible later work includes bounded node discovery, authenticated cross-node test traffic, portable result exchange, and separately reviewed federation/consensus laboratories. None is enabled by this document.

The promotion rule remains:

> **Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.**
