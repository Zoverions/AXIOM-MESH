# Foundational Strength Audit — AXIOM-MESH 0.12.0-dev.3

**Date:** 2026-09-05  
**Subject:** AXIOM-MESH (`https://github.com/Zoverions/AXIOM-MESH`), supported build `0.12.0-dev.3`  
**Audience:** Owner / promotion body (Zov Erion)  
**Status:** Planning audit only. Does not change `mesh/config/capabilities.json`, does not claim pilot completion, independent-security approval, product release, or production promotion.

**Doctrine encoded:** Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.

**Authority path preserved:** Gateway → Hypervisor → Sandbox → Grid.

---

## 1. Executive verdict

AXIOM-MESH is an **unusual fail-closed authority substrate**: consequential work must still pass identity, deny-dominant policy, confirmation/approval, short-lived capability consumption, bounded execution, and signed evidence. Intelligence, planners, browser apps, external runtimes, providers, repository operators, remote nodes, and administrators do **not** inherit authority from connectivity ([`docs/PROJECT-STATUS-2026.md`](../PROJECT-STATUS-2026.md)).

The foundational gap is **not** another laboratory. The gap is:

1. **Lived external evidence** — authentic controlled pilot + independent security review for the exact pinned source/image/deployment (promotion blockers in PROJECT-STATUS).
2. **One human/machine utility wedge** — a productized AXIOM One path plus one least-privilege provider under Mesh grants, with receipts that a non-operator can inspect.

Mechanism density is already high: 31 of 50 capabilities marked `implemented` in [`mesh/config/capabilities.json`](../../mesh/config/capabilities.json) (as recorded in PROJECT-STATUS / STATUS). Synthetic drills, production-unreachable prototypes, and draft architectures prove design honesty; they do not prove deployment truth.

**Verdict in one line:** Keep the kernel constitutional; freeze one progression; earn promotion with evidence; ship a narrow useful surface before activating broader effects.

---

## 2. Novel / differentiating (cite paths)

These differentiators are implemented or contract-pinned in-repo. They are not marketing claims of live deployment.

### Intelligence is not authority
Path: `docs/PROJECT-STATUS-2026.md` (authority model); Gateway → Hypervisor → Sandbox → Grid.
Models, planners, and runtimes may coordinate; they do not authorize Mesh effects.

### Constrained machine principals and non-authorization discovery
Registry-backed machine principals; authenticated `/v1/machine-discovery`.
Discovery returns a digest-bound requestable intersection under deny-dominant policy and does not grant execution authority.

### Digest receipts and Grid-attested terminal machine receipts
Grid evidence path; MACHINE-003 in `docs/MASTER-TODO.md`.
Binds request and authority digests, accepted and terminal anchors, chain-assurance metadata, and outcome digests without treating raw result content as ambient authority.

### Continuity anchors
Schema: `axiom-grid-continuity-anchor.v1`; Grid evidence boundary in PROJECT-STATUS.
External retention outside `AXIOM_DATA_DIR` strengthens truncation detection. This is not BFT finality and not malice-free host or root assurance.

### Evidence-first external-effect chain
See PROJECT-STATUS repository-effect section and INTENT-004.
Built and tested, but production-unreachable until separate promotion gates pass.

### Agent Runtime Adapter v1
See docs/architecture/AGENT-RUNTIME-ADAPTER-CONFORMANCE.md and mesh/src/lib/runtime-adapter-contract.mjs.
Byte-pinned contract with a synthetic 28-case drill. No external runtime loaded.

### Zero-dependency kernel posture
PROJECT-STATUS; source-setup and dual-lock policy.
Supported coordination kernel line is dependency-free Node.js with exact engine policy.

### Claim lifecycle bound to capabilities.json
`mesh/config/capabilities.json`; `docs/rebuild/STATUS.md`.
Roadmaps, labs, synthetic conformance, and built-but-unreachable source cannot promote status. Current count: 31 implemented of 50 tracked.

### Fail-closed pilot and independent-review intake
`docs/operations/PILOT-DEPLOYMENT-DOSSIER.md`; `mesh/src/pilot-dossier.mjs`; `mesh/src/pilot-evidence-package.mjs`; `mesh/src/independent-security-review.mjs`.
Scripts: pilot:dossier:verify, pilot:package:verify, security-review:verify.
Intake may report accepted-for-promotion-review with production_promoted false. It does not deploy or promote.

### Experimental AXIOM One loopback surface
`apps/axiom-one/`; `docs/operations/AXIOM-ONE-LOCAL-PREVIEW.md`.
Bounded owner Vault, reversible review, selective export. Not a supported product release.

---

## 3. Critical gaps — P0 / P1 / P2

### P0 — foundational evidence (blocks production promotion)

From PROJECT-STATUS promotion blockers and pilot dossier requirements:

1. Authentic controlled pilot on dedicated hardware with at least 720 hours (30-day) availability and capacity observation under pinned image and topology.
2. Independent security review for the exact source revision, image digest, deployment policy, and pilot configuration.
3. Exact pilot evidence package plus a separate promotion decision. Package verification still reports production_promoted false until the accountable body decides.

Without P0, Mesh remains a strong candidate substrate, not a lived authority deployment.

### P1 — utility wedge

1. AXIOM One productization: finish browser, security, accessibility, and package gates for `apps/axiom-one/` beyond experimental loopback preview.
2. First AI provider under Mesh grants (AI-001): named model, data scope, purpose, budget, timeout, cancel, retention, receipt; model output never authorizes effects.
3. Pin one read-only external runtime via Agent Runtime Adapter v1 (RUNTIME-002): immutable upstream pin; no-secret read-only; native authz, cancel, idempotency, and receipt parity; direct-service denial. Pointers: `docs/reviews/RUNTIME-CANDIDATE-SURVEY-2026-08-21.md`, `docs/reviews/HERMES-RUNTIME-002-CANDIDATE-PIN-2026-08-21.md`.
4. Ship AXIOM Verify (VERIFY-001) as local/static verifier of machine receipts and export packages. Integrity is not truth.
5. Education compatibility evidence: `Zoverions/Axiom-Education` pins Mesh contracts; production Education actions remain unavailable in committed Mesh policy until explicit adoption evidence.

### P2 — honesty, packaging, focus

1. Attestation honesty: machine runtime IDs and software digests are attribution metadata, not TPM, TEE, measured-boot, or remote-attestation proof (PROJECT-STATUS).
2. Single-node versus BFT education: Grid is one transparency log, not replicated BFT consensus.
3. Installer: INSTALL-001 (fresh Linux personal/local node) remains pending.
4. Reduce parallel lab sprawl: converge Agent Trust, semantic-memory, and contributor-mode laboratories into one selected progression (AGENT-003).
5. Issue prioritization: park remote execution, MCP/A2A exposure, Circles pilots, Managed Node activation, and repository-effect activation until the frozen progression clears gates.

---

## 4. Blind spots

- Treating synthetic drills as lived pilot evidence yields false readiness. Dossier verifiers accept only authentic packages signed under policy.
- Equating built-and-tested with production-reachable ignores intentional unreachability of repository-effect and synthetic adapter drills.
- Accepting runtime-local approval or permissive bypass flags as Mesh authority would create a second control plane (`AGENT-RUNTIME-ADAPTER-CONFORMANCE.md`).
- Treating continuity anchors as history forever overclaims: anchors prove equality or extension through retained heads, not later-event preservation under active signing-key or host compromise.
- Local Grid verification alone is not absolute truncation proof when a deleted suffix matches rewritten local head or checkpoint metadata.
- Education substrate presence is not Education production activation.
- Parallel green branches without a freeze dilute owner attention and expand claim surface without lived evidence.
- Marketing attestation without a hardware root misleads operators about trust assumptions.

---

## 5. Foundationalization path

Freeze one progression (also in `docs/operations/FOUNDATIONAL-EXECUTION-PACK-2026-09.md`):

1. Phase 2 pilot package (authentic evidence + independent review intake)
2. AXIOM One productization + one least-privilege AI provider under Mesh grants
3. Agent Runtime Adapter v1 — single read-only external runtime pin
4. AXIOM Verify standalone (local/static)
5. Only then consider activating repository-effect, broader runtime, MCP/A2A, or Circles pilots

Preserve Gateway → Hypervisor → Sandbox → Grid at every step. No second authority path from installers, runtime allowlists, or lab results.

---

## 6. Claim hygiene

### Explicit non-claims (must remain true unless evidence changes)

This audit and build `0.12.0-dev.3` do not claim:

- live public, customer, testnet, mainnet, or production service;
- completed authentic pilot or independent security approval;
- supported release of AXIOM One, Education, Verify, Circles, Studio, or Managed Node;
- certification of Hermes, OpenClaw, Agent Zero, MCP, A2A, or any external runtime;
- production AI, messaging, payment, repository, or regulated-domain adapter;
- federation, BFT consensus, replicated Grid finality, or global Sybil resistance;
- TPM, TEE, measured-boot, or remote attestation;
- exactly-once external side effects;
- that cryptographic integrity of receipts equals external-world truth;
- that capability status changed because this document exists.

**Claim rule:** If it is not accurately statused in `mesh/config/capabilities.json`, and not backed by authentic external evidence where required, do not market it as available.

---

## 7. Recommended next 5 actions

1. Freeze the progression: adopt `docs/operations/FOUNDATIONAL-EXECUTION-PACK-2026-09.md`; park non-progression labs in a decision-log entry.
2. Stand up pilot ops: dedicated hardware plan, custody inventory, and start the 720-hour observation clock only after image and policy pin; use `docs/operations/PILOT-EXTERNAL-EVIDENCE-CHECKLIST.md`.
3. Commission independent security review for the exact build tuple; feed the ledger into the pilot package and security-review:verify path.
4. Define the One+provider wedge per `docs/operations/AXIOM-ONE-PROVIDER-WEDGE.md` without consequential external effects.
5. Run `docs/operations/RUNTIME-ADAPTER-FIRST-PIN.md` against the survey and HERMES checkpoint; no remote execution until parity gates pass; ship Verify MVP per `docs/operations/AXIOM-VERIFY-MVP-SCOPE.md` once receipt and export schemas are stable for offline reproduction.

---

## Evidence index (primary)

- `docs/PROJECT-STATUS-2026.md`
- `mesh/config/capabilities.json`
- `docs/operations/PILOT-DEPLOYMENT-DOSSIER.md`
- `docs/architecture/AGENT-RUNTIME-ADAPTER-CONFORMANCE.md`
- `docs/reviews/RUNTIME-CANDIDATE-SURVEY-2026-08-21.md`
- `docs/reviews/HERMES-RUNTIME-002-CANDIDATE-PIN-2026-08-21.md`
- `docs/MASTER-TODO.md` (PILOT-*, UX-*, AI-001, VERIFY-001, RUNTIME-001/002, INSTALL-001)
- `docs/ROADMAP.md` (product family; Verify; One)
- `apps/axiom-one/`
