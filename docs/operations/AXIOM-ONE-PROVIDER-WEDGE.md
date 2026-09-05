# AXIOM One + Provider Wedge

**Build context:** `0.12.0-dev.3`  
**Surfaces:** `apps/axiom-one/`; Gateway client contract; AI-001 / UX-* in `docs/MASTER-TODO.md`  
**Status:** In progress (AI-001). Local deterministic organize/summarize provider stub + Mesh invoke envelope + AXIOM One draft-only Vault path landed; Mesh capability `ai.providers` remains `adapter_required`. Not a supported product release claim. Model output never authorizes Mesh effects.

**Doctrine:** Build broadly. Activate deliberately. Expose minimally. Promote only with evidence. Market only what is true.

**Authority path:** human owner → Gateway → Hypervisor → Sandbox → Grid (provider is a constrained destination under grants, not an authority root).

## User story (smallest useful)

As the node owner, in the local AXIOM One loopback UI, I can:

1. See node status and explainable outcomes for already-bounded actions.
2. Create a private Vault note and optionally attach one of the three provenance links (`derived-from`, `supports`, `corrects`).
3. Ask the single approved AI provider to **summarize or organize** only the owner-selected note text I explicitly include in the request.
4. Review the provider result as a **draft suggestion** that does not mutate Vault until I confirm a separate, Mesh-authorized write.
5. Inspect a receipt showing provider identity, data scope, purpose, budget, timeout, cancel signal, retention rule, and terminal outcome digest.

If confirmation, grant, or budget is missing, the path fails closed with a readable denial.

## Required kernel surfaces

- Versioned Gateway client contract (31 authenticated routes; relative-only application targets; no direct Grid/Hypervisor/Sandbox target from the browser app).
- Owner-scoped Vault create/list, provenance links, tombstone, selective export as already bounded in PROJECT-STATUS / `apps/axiom-one/`.
- Deny-dominant policy, confirmation, and short-lived capability consumption before Sandbox execution.
- One provider adapter outside the kernel, bound to named provider, model, data scope, purpose, budget, timeout, cancel, retention, and result receipt (AI-001).
- Grid-attested evidence suitable for later AXIOM Verify offline checking.

Do not require social federation, Circles, Managed Node, MCP, A2A, or repository-effect activation for this wedge.

## Evidence / receipts UX

In AXIOM One, the owner must be able to open a Receipts (or equivalent) view that shows:

- what was requested (purpose and data scope in plain language);
- what was authorized (grant constraints);
- what was observed (terminal outcome digest; not raw secret material);
- cancel, timeout, or denial reasons when applicable;
- a clear label that integrity of the receipt is not external-world truth.

Raw evidence inspection may remain advanced; default copy stays constitutional and non-hyped.

## Gates before consequential effects

Before any provider-assisted path can trigger external messaging, payments, repository mutation, or other consequential effects:

1. This wedge's summarize/organize path is stable with receipts and fail-closed tests.
2. Browser/security/accessibility/package gates agreed for One local productization are complete or explicitly waived in a decision log with residual risk.
3. Model output is never wired as an automatic approval or grant.
4. Separate confirmation and independent approval rules remain enforced for any later effect.
5. capabilities.json updates (if any) are evidence-backed and claim-safe.

## Success metrics

- Owner can complete the user story on a local node without third-party analytics or account services.
- 100% of provider calls in tests bind purpose, scope, budget, timeout, cancel, and retention.
- Denials are readable; cross-principal Vault access remains denied in real-stack tests.
- At least one exportable receipt verifies under the Verify MVP acceptance tests when Verify lands.
- Public docs describe the wedge without claiming a general personal agent, production AI adapter, or Mesh production promotion.


## Current repository slice (honest)

Landed for AI-001 without promoting `ai.providers`:

- `mesh/src/lib/ai-provider-invoke.mjs` — fail-closed invoke/receipt contract (purpose, data_scope, budget, timeout_ms, cancel, retention, note_digest, `draft_only=true`, terminal outcome digest, integrity-vs-truth non-claim).
- `mesh/src/local-organize-provider.mjs` — deterministic local organizer (normalize whitespace, headings/bullets, explicit truncation); no network and no model process spawn.
- `mesh/test/ai-provider-invoke.test.mjs` and `mesh/test/local-organize-provider.test.mjs` — valid PASS; missing fields FAIL; altered bytes FAIL; draft-cannot-authorize; cross-principal denial.
- AXIOM One Vault — owner-selected text → local organize draft review → optional separate `memory.put` confirm path. Ask remains `system.echo`.
- Human contract action `ai.local-organize` explains the draft path; it is not a Sandbox intent and does not change `capabilities.json`.

Still deferred: Mesh Gateway→Hypervisor→Sandbox adapter wiring for providers, external/local model adapters, Verify receipt export, production AI claims.

## Non-claims

This wedge does not claim: supported One release; production AI provider; autonomous agents; Education compliance; Circles; Managed Node; wearable/Personal Agent Pack; or that model summaries are true.
