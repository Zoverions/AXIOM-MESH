# AXIOM Agent Commons

**Status:** architecture / contribution-interface draft  
**Capability impact:** none  
**Canonical public collaboration surface:** GitHub

## Purpose

Agent Commons is the proposed public collaboration layer between AXIOM-MESH and external digital agents, agent runtimes, automated reviewers, research systems, and agent-native communities.

Its purpose is to let outside systems discover bounded work, critique architecture, reproduce evidence, propose patches, contribute test infrastructure, and return verifiable results without becoming an alternate authority plane.

Core invariant:

> **External agents may contribute evidence and proposals. They do not acquire AXIOM authority from participation, popularity, runtime identity, or successful prior work.**

## Position in the architecture

```text
external agents / communities / runtimes
                 |
                 v
          Agent Commons
  discovery / challenges / feedback
       contribution envelopes
   bounded infrastructure offers
                 |
                 v
       GitHub issues / draft PRs
                 |
       protected CI + review
                 |
                 v
             AXIOM-MESH
       authority + evidence
```

Agent Commons is not a replacement for GitHub and not a second source of repository truth. Mirrors and external communities may advertise or index work, but canonical issue, pull-request, branch, release, and capability state remains on the declared repository surface.

## Protocol boundary

AXIOM should remain protocol-neutral internally and standard-compatible at the edges.

Candidate interoperability roles:

- **A2A-compatible discovery/task exchange** for agent-to-agent discovery and bounded task negotiation;
- **MCP-compatible read-only resources/tools** for public documentation, capability status, verification helpers, and challenge discovery;
- external community adapters for announcements, mirrors, and feedback intake;
- GitHub for canonical issues, pull requests, protected checks, and review state.

No protocol adapter may bypass the normal AXIOM authority sequence or mint capabilities merely because an external peer requested work.

## Machine-readable object set

The first draft object family is deliberately small:

1. `axiom-agent-challenge.v1` — a bounded public work request;
2. `axiom-agent-contribution.v1` — a returned implementation/reproduction package;
3. `axiom-agent-feedback.v1` — criticism, review, risk, or research feedback that may not contain a patch;
4. `axiom-agent-infrastructure-offer.v1` — bounded contributed test capacity;
5. `axiom-agent-infrastructure-challenge.v1` — an exact-base hardware or infrastructure test plan;
6. `axiom-agent-infrastructure-result.v1` — a bounded infrastructure result and evidence envelope;
7. `axiom-agent-device-attestation.v1` — fresh Ed25519 key-possession evidence bound to one offered node-profile digest;
8. `axiom-agent-test-session-authorization.v1` — a human-sponsored, one-time, short-lived laboratory authorization envelope whose effects are not currently reachable.

The supported core contribution schemas live under `docs/architecture/contracts/`. The experimental infrastructure-lab exchange schemas remain under `agent-commons/contracts/` until that layer is separately promoted into the supported documentation boundary.

These are exchange contracts, not proof that an external agent, runtime, identity, network, or offered device is trustworthy.

## Challenge model

A challenge should bind at least:

- challenge/task identity;
- canonical repository;
- exact base commit SHA;
- problem statement;
- allowed or relevant scope;
- prohibited effects;
- acceptance criteria;
- evidence expectations;
- security/disclosure route;
- claim boundary.

A challenge may invite analysis or patches. It must not imply that completing the challenge grants authority, payment, production access, merge rights, or reputation weight beyond what a separate policy explicitly defines.

## Contribution model

A contribution should preserve enough information to review and reproduce the work:

- contributor/agent identity as asserted or externally verifiable;
- runtime/model/tool metadata where known and relevant;
- source challenge if any;
- repository and exact base SHA;
- changed paths or inspected scope;
- commands/tests actually executed;
- observations and artifacts;
- assumptions, uncertainty, and unresolved cases;
- explicit statement that repository merge authority is not requested by the envelope.

A contribution can be useful even when it fails. Reproduced failures and negative findings are evidence.

## Feedback model

Feedback is first-class because high-value work is often not a patch.

Examples:

- threat-model criticism;
- architecture counterexample;
- benchmark reproduction;
- unsupported-claim finding;
- interoperability mismatch;
- recovery failure mode;
- privacy leakage hypothesis;
- scalability bottleneck;
- test-gap proposal.

Feedback must distinguish observation, inference, proposal, and unverified hypothesis.

## Reputation and trust

Social popularity, follower count, karma, model brand, benchmark prestige, or self-described expertise must not become ambient authority.

A future reputation layer may summarize evidence-backed contribution history, for example:

- accepted or rejected findings;
- reproduced results;
- tests that continue to pass;
- security findings confirmed independently;
- reversions or invalidated claims;
- provenance continuity.

Even a strong contribution history does not itself grant execution or merge authority. Reputation is evidence for review policy, not a capability token.

## Threat model

Treat all remote contribution surfaces as hostile-input boundaries.

Relevant threats include:

- prompt injection through issues, patches, agent cards, tool descriptions, or social content;
- malicious patches that weaken authority while preserving superficial tests;
- fabricated test/evidence claims;
- poisoned external artifacts or dependencies;
- Sybil/reputation gaming;
- identity spoofing;
- secret exfiltration attempts;
- oversized or resource-exhaustion submissions;
- stale-base patches that overwrite newer security work;
- social pressure to merge around protected review gates;
- malicious external mirrors misrepresenting capability status;
- offered hardware whose declared properties are false;
- remote-support requests that attempt to obtain credentials or persistent control;
- test-node workflows that smuggle production enrollment or destructive changes;
- replayed or substituted device-attestation nonces;
- self-supplied software keys falsely described as secure-element or platform-backed identity;
- session envelopes that widen operations, network access, lifetime, or effect reachability beyond the parent challenge.

Required controls include exact-base binding, bounded inputs, protected CI, provenance capture, secret isolation, security-report routing, independent review for consequential changes, and no merge or infrastructure authority for external agents merely from participation.

## GitHub integration

GitHub remains the front-facing source of collaboration truth.

Agent-oriented issue forms should support at least:

- implementation/contribution;
- architecture or security-adjacent feedback that is safe for public disclosure;
- reproduction/verification reports.

Security vulnerabilities that should not be public must follow `SECURITY.md` instead of public Agent Commons forms.

A future repository-effect adapter may prepare or create an open draft pull request only through separately authorized AXIOM policy. Draft creation is not merge authority.

## Infrastructure and hardware laboratory

Agent Commons may also coordinate contributed physical hardware and operational test capacity. The infrastructure laboratory is intentionally a three-object model:

1. **Offer** — a contributor advertises bounded test capacity and binds an existing `axiom-compute-node-profile.v1` by digest.
2. **Challenge** — AXIOM binds one exact repository/base revision, one offered node-profile digest, one challenge class, a narrow safe-operation set, network limits, acceptance criteria, evidence requirements, and expiry.
3. **Result** — the contributor reports bounded execution, evidence references, limitations, and explicit negative effect claims.

Core infrastructure invariant:

> **A device offer is not node admission. A challenge is not production authority. A result is not self-verifying truth.**

The laboratory reuses `axiom-compute-node-profile.v1`; it does not create a competing hardware identity format.

Initial challenge classes are:

- `hardware-validation`;
- `test-node-provisioning`;
- `deployment-reproduction`;
- `infrastructure-diagnostics`;
- `support-assistance`;
- `device-lab-capacity`.

The v1 safe-operation vocabulary is restricted to system-fact collection, disposable workspace setup/reset, test-only dependency installation, build/test execution, local test services, sanitized logs, and bounded benchmark metrics.

The following remain explicitly prohibited by the v1 infrastructure contracts:

- production node enrollment;
- credential issuance;
- secret retrieval;
- firmware or boot-chain changes;
- disk erasure or destructive repair;
- purchases or subscription activation;
- security-boundary weakening;
- unbounded remote shell;
- permanent system mutation;
- capability promotion;
- ambient authority;
- implicit payment.

Hardware facts must keep `declared`, `measured`, `reproduced`, and `externally-verified` states separate. A contributor or agent cannot self-assert independent verification; the executable validator requires separate verifier confirmation before accepting that status.

### Device attestation boundary

The first device-attestation laboratory proves one deliberately narrow fact: possession of the Ed25519 private key corresponding to a public key that signs a fresh canonical statement containing the infrastructure offer ID, exact compute-node-profile digest, challenge nonce, issuance time, and short expiry.

The validator recomputes the public-key SHA-256 fingerprint and verifies the Ed25519 signature over the canonical statement. The attestation expires after at most 15 minutes and fails closed on stale evidence, nonce substitution, offer/profile substitution, malformed keys, fingerprint mismatch, or signature mismatch.

This key-possession proof must **not** be upgraded into a claim of physical ownership, secure-element custody, Secure Enclave/TPM/TEE backing, secure boot, firmware integrity, boot-chain integrity, or independent external verification. Those claims require provider/platform-specific evidence and a separate verification path.

### Ephemeral test-session authorization boundary

A test-session authorization is a laboratory mandate between a validated infrastructure challenge and a future executor. It requires:

- an explicit human sponsor and machine-principal subject;
- exact challenge, offer, node-profile digest, device-attestation ID, and attestation-key fingerprint binding;
- a lifetime of at most 15 minutes that cannot outlive the offer, challenge, or attestation freshness window;
- one-time use, explicit revocability, and fail-closed unknown revocation state;
- a safe-operation set that is a subset of the parent challenge;
- network mode and origins that cannot exceed the parent challenge;
- disposable-workspace-only filesystem scope;
- no credentials, secret access, interactive shell, or unbounded remote shell.

The current authorization envelope always carries `effect_reachable: false`. Validation therefore proves that the envelope is internally bounded; it does **not** provide a deployed remote executor, credentials, tunnel, shell, device-management enrollment, or other path that can act on the machine.

A future effect-reachable executor is a separate promotion problem. It would require authenticated sponsor identity, trusted device-key custody or stronger platform attestation as appropriate, isolated ephemeral credentials, durable revocation state, replay prevention, timeout and interrupted-work recovery, exact command/filesystem/network enforcement, evidence receipts, independent threat review, and protected promotion.

Remote access is not part of the current effect path. An offer may state that remote access is technically available, but credentials, tunnels, remote shells, device-management enrollment, and unattended administration require that separate future design.

Hosted CI can establish broad platform compatibility but cannot substitute for all physical-device evidence. For Apple, physical follow-on work may eventually test `launchd`, sleep/wake/reboot recovery, Keychain/Secure Enclave integration, firewall/network semantics, signing/notarization, thermal/power behavior, and virtualization constraints. Equivalent physical validation can apply to Windows, Linux, ARM SBCs, GPU workstations, network appliances, and specialized hardware.

Failures and blocked results remain useful evidence when exact-base and honestly reported. Interrupted or uncertain consequential effects must not be upgraded to success.

## Initial read-only interoperability laboratory

The first external-facing runtime experiment should be read-only and expose only already-public state such as:

- project identity and claim boundary;
- selected public documentation;
- capability-registry status;
- open Agent Commons challenges;
- verification instructions;
- schema discovery.

It must not expose secrets, private Grid state, credentials, private memory, unpublished security findings, write tools, production execution routes, or implicit authority.

## External publication and mirrors

Agent-native communities may be used for discovery, announcements, technical challenges, and feedback intake.

Each external publication should be treated as a bounded projection or mirror. It should point back to the canonical GitHub repository and must not silently become the authority for release state, capability state, security status, or accepted contributions.

Where practical, retain publication provenance and external identifiers so announcements can later be audited or retracted without rewriting repository history.

## Promotion stages

### Stage A — repository contribution surface

- `AGENTS.md` machine entry point;
- Agent Commons architecture document;
- challenge/contribution/feedback schemas;
- agent-oriented GitHub issue forms;
- contract self-check in protected CI.

### Stage B — challenge registry laboratory

- machine-readable list of open challenges;
- exact base-SHA binding;
- bounded path and acceptance metadata;
- fixtures and negative tests.

### Stage C — Read-only MCP/A2A laboratory

- public discovery only;
- no consequential tools;
- hostile-input tests;
- request and response bounds;
- no authority change.

### Stage D — external community adapters

- announcements and challenge mirrors;
- feedback ingestion with provenance;
- canonical-link enforcement;
- rate, size, abuse, and identity controls.

### Stage E — evidence-backed contribution reputation research

- portable contribution receipts;
- correction/invalidation history;
- Sybil/collusion analysis;
- no ambient authority derived from score.

### Stage F — infrastructure and contributed hardware laboratory

- bounded device/test-capacity offers;
- exact-base infrastructure challenges;
- exact compute-node-profile digest binding;
- constrained operation and network vocabularies;
- result/evidence envelopes with negative effect claims;
- fresh Ed25519 key-possession attestation bound to offer/profile/nonces;
- human-sponsored, one-time, revocable test-session authorization envelopes;
- declared/measured/reproduced/externally-verified evidence separation;
- no effect-reachable remote administration or production-enrollment authority.

Any write-capable external adapter or remote infrastructure executor requires a separate threat review, policy mapping, evidence model, negative tests, and promotion decision.

## Acceptance gates

1. External participation cannot change `mesh/config/capabilities.json` status without the normal reviewed repository process.
2. No Agent Commons contract grants merge, deployment, secret, production execution, production node enrollment, or credential authority.
3. Challenge and contribution objects bind an exact repository base SHA.
4. External social or agent-network state cannot override canonical GitHub state.
5. Public feedback and security-sensitive disclosure paths are clearly separated.
6. Protected CI checks the contract files and critical non-authority invariants.
7. A hostile external message or artifact cannot create a second authority path around `Gateway -> Hypervisor -> Sandbox -> Grid`.
8. Reputation, if later implemented, remains evidence and policy input rather than self-executing authority.
9. Read-only interoperability is proven before any write-capable adapter is considered.
10. Infrastructure test capacity cannot become production admission or remote administration merely because hardware is available.
11. Device key possession cannot be represented as platform-backed or externally verified hardware trust without separate evidence and verification.
12. A test-session envelope cannot widen its parent challenge or become effect-reachable merely because it validates structurally.
13. Current documentation remains explicit about what is architecture, laboratory, implemented, enabled, exposed, production-promoted, and marketed.

## Current non-claims

This document does not claim:

- a deployed Agent Commons service;
- a production MCP or A2A endpoint;
- a verified cross-network agent identity system;
- autonomous code merging;
- autonomous capability promotion;
- production external-agent execution;
- a Sybil-resistant portable reputation network;
- trustworthy external agent cards or social profiles;
- a legal or economic reward system for contributions;
- a deployed hardware marketplace;
- production remote administration;
- automatic node enrollment;
- verified physical ownership of offered devices;
- TPM, Secure Enclave, TEE, secure-element, secure-boot, or boot-integrity verification;
- a production attestation authority;
- an effect-reachable test-session executor;
- secure remote-shell infrastructure;
- firmware-management authority;
- production macOS service support;
- native iOS/iPadOS node support;
- autonomous purchasing or payment.

The first deliverable is a safer contribution surface, not an autonomous swarm.
