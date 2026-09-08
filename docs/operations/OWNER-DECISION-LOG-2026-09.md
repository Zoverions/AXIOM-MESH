# Owner Decision Log — Foundational Progression (2026-09)

**Status:** owner operating decisions for the foundational track. Does not change capability registry status or claim production promotion.

**Linked:** [Foundational strength audit — 2026-09-05](../reviews/FOUNDATIONAL-STRENGTH-AUDIT-2026-09-05.md), [Foundational execution pack](FOUNDATIONAL-EXECUTION-PACK-2026-09.md), [Epistemic Fabric Stage 5B design gate](../superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md), [Epistemic Fabric roadmap](../ROADMAP-EXTENSION-EPISTEMIC-FABRIC.md), [Epistemic Fabric queue](../MASTER-TODO-EPISTEMIC-FABRIC.md), [Epistemic Fabric threat model](../security/EPISTEMIC-FABRIC-THREAT-MODEL.md)

## Frozen progression (active)

Only this sequence is active until the next written decision:

1. **Pilot external evidence** — authentic controlled pilot + independent security review package (see [Pilot external evidence checklist](PILOT-EXTERNAL-EVIDENCE-CHECKLIST.md)).
2. **AXIOM One + one least-privilege provider wedge** — [AXIOM One provider wedge](AXIOM-ONE-PROVIDER-WEDGE.md).
3. **Agent Runtime Adapter first pin** — bounded read-only integration only ([Runtime adapter first pin](RUNTIME-ADAPTER-FIRST-PIN.md)).
4. **AXIOM Verify MVP** — local/static verifier ([AXIOM Verify MVP scope](AXIOM-VERIFY-MVP-SCOPE.md)).

Parked until after the above: Circles productization, repository-effect activation, MCP/A2A exposure, Personal Compute Fabric implementation, plural-authority laboratories, and parallel Agent Trust green branches that are not on this progression.

The Epistemic Fabric Stage 5B work is a separate design-gated track. Its E0/E1 implementation gate is now explicitly approved, but only for inert schemas plus a bounded local proposal graph (`Source -> Claim -> Evidence`). This does **not** alter the frozen foundational progression above, does not authorize runtime activation or external effects, and grants no authority for E2+ phases. Stage 5A artifacts remain inputs/provenance only and confer no Stage 5B implementation or authorization authority.

## Runtime-002 provisional selection

**Provisional first pin:** Hermes Agent, following the immutable research checkpoint in [Hermes RUNTIME-002 candidate pin — 2026-08-21](../reviews/HERMES-RUNTIME-002-CANDIDATE-PIN-2026-08-21.md).

| Field | Value |
|---|---|
| Upstream | `https://github.com/NousResearch/hermes-agent` |
| Immutable commit | `b6bcb3e791c673e63974029bbab40cc9326803ff` |
| First operation | code identity inspection only (`get_code_identity`) |
| Explicitly rejected first op | `hermes dump` |
| Not claimed | certification, installation approval, remote execution, MCP/A2A, or Mesh authority for Hermes |

A Mesh-side **fixture-backed** identity-only research slice may land before live spawn (pin binding, field bounding, mismatch/forged-build denial, contract/manifest receipt binding). That fixture does **not** accept the pin. Bounded identity-only dependency inventory + threat notes live in [HERMES-RUNTIME-002-IDENTITY-THREAT-INVENTORY.md](HERMES-RUNTIME-002-IDENTITY-THREAT-INVENTORY.md) (not SBOM certification; not pin acceptance). Refresh pin hash + deepen inventory/threat review before any live Hermes adapter path merges. Selection becomes final only after Adapter v1 parity matrix green for the read-only slice **and** an owner decision log entry: "RUNTIME-002 read-only pin accepted".

## Open owner inputs required

These cannot be completed from repository work alone:

1. Dedicated pilot hardware identity and custody owners
2. Named independent security reviewer / firm engagement
3. Pilot telemetry/alert receiver ownership and acknowledgement path
4. Continuity-anchor external custody path and cadence

## Decision record

| Date | Decision | By |
|---|---|---|
| 2026-09-05 | Open foundational packs PR; freeze progression Pilot → One+provider → Hermes read-only pin → Verify | Assistant on owner mandate to drive foundational status |
| 2026-09-05 | Advance frozen stage 2 AI-001 with local organize provider stub only; keep `ai.providers` adapter_required; drafts never authorize Mesh effects | Assistant on owner mandate for One + provider wedge |
| 2026-09-05 | Advance RUNTIME-002 with Hermes identity-only **research/fixture** + adapter profile + tests; pin remains provisional until parity matrix green + owner acceptance; no live Hermes spawn; capabilities.json untouched; do not claim pin accepted | Assistant on owner mandate for Adapter first pin |
| 2026-09-05 | Record bounded Hermes identity-only dependency inventory + threat-model note (unsigned-commit / secret-import / network / dump / second-control-plane); does not certify SBOM, accept pin, or complete live process audit; capabilities.json untouched | Assistant on owner mandate for Adapter first pin prep |
| 2026-09-05 | Verify scaffold started while Hermes pin provisional / SEC-002 pending; offline VERIFY-001 MVP slice only; capabilities.json untouched; no product-release claim | Assistant on owner mandate for Verify MVP |
| 2026-09-05 | Extend VERIFY-001 with offline continuity-anchor chain-segment + selective-export digest checks; capabilities.json untouched; experimental only; no product-release claim | Assistant on owner mandate for Verify MVP |
| 2026-09-07 | Approve the Epistemic Fabric as a fresh Stage 5B design direction only. Stage 5B inherits no implementation or authorization authority from Stage 5A. Preserve proposal/canonical separation, `knowledge != authority`, exact-head/replay semantics, append-only revision history, bounded reassessment, evidence-lineage independence, and node disagreement. Only a fresh E0/E1 proposal may proceed next; no capability registry or production-policy change is authorized by this decision. | Owner approval recorded from current project discussion |
| 2026-09-07 | Stage 5B documentation/provenance package passed Clean Kernel run `34174907304` and Windows Compatibility run `34174907306` on exact head `f6b71a5dbe10a086bd4d4fa91be7d9ea45488a0b`, then merged through PR #1560 as `344ad17b0e4781c66a5103a4df67c72b93bde4ca`. This merge records architecture only and grants no E0/E1 code authority. | Assistant executing owner instruction after protected verification |
| 2026-09-07 | Prepare the fresh E0/E1 implementation-gate proposal on branch `docs/epistemic-fabric-e0-e1-gate` from merged base `344ad17b0e4781c66a5103a4df67c72b93bde4ca`. Proposal preparation is documentation-only; implementation remains blocked pending explicit owner approval of the exact gate. | Assistant executing owner instruction to continue |
| 2026-09-08 | **Approve E0/E1 gate** against proposal head `9fec5a449811e343c4723dfb5598d860b59841dc`, including exact file envelope, resource ceilings, 20 acceptance tests, and schema SHA-256 digests `9c813d…`, `8b2289…`, `0d5fab…`, `4ff83b…`. Authority is limited to E0 inert schemas and E1 local proposal-only `Source -> Claim -> Evidence`; E2+, federation, continuous feeds, external effects, capability changes, production-policy changes, and live providers remain unauthorized. | Owner explicit approval in current project discussion |
