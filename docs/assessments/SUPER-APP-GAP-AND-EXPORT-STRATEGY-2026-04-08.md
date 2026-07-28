# AXIOM-MESH Super-App Gap and Export Strategy (2026-04-08)

## Context
This note addresses a strategic question: if AXIOM-MESH is intended to become a societal operating system / "everything app" foundation, what critical gaps remain versus WeChat/X-style ecosystems, and where should export capabilities be elevated to first-class status?

## Executive Takeaway
AXIOM-MESH already has core foundation layers (gateway, orchestration, sandbox, grid), but an everything-app trajectory requires **productized trust loops** on top of infra:
1. Identity and reputation portability.
2. Payments + custody UX abstraction.
3. A composable mini-app surface.
4. Distribution loops (social + creator + enterprise channels).
5. A hard, user-controlled export layer that prevents lock-in.

Without #5, ecosystem trust and adoption velocity are likely to stall at pilot scale.

## Gap Map (Current → Needed)

## 1) Identity + Trust Graph
Current:
- Auth and governance controls exist, but user-level portable identity primitives are not yet clearly surfaced as product features.

Needed:
- Portable identity cards (person/org/agent/service).
- Reputation receipts (verifiable activity and contribution proofs).
- Cross-capsule consent ledger (who can use what data, for what purpose, and for how long).

## 2) Transaction and Value Rails
Current:
- Tokenomics and chain integrations are documented at protocol level.

Needed:
- End-user wallet abstraction (fiat/off-ramp optionality, stable UX).
- Multi-asset transfer intent templates (P2P, payroll, merchant, grants).
- Trust-preserving dispute/reversal policy layer for real-world commerce edges.

## 3) Mini-App / Capsule Platform
Current:
- Capsule framing exists in governance and architecture docs.

Needed:
- Opinionated SDK + capability manifest model for capsule developers.
- Discoverability layer (catalog + quality score + safety labels).
- Revenue routing primitives (fees, subscriptions, rev-shares, bounties).

## 4) Distribution and Network Effects
Current:
- Channel adapters exist (Discord/Slack/Telegram/WhatsApp/X adapter).

Needed:
- Growth API for referral, affiliate, and partner graph rewards.
- CRM-grade operator console for institutions and guilds.
- Multi-tenant branding + policy inheritance for sovereign deployments.

## 5) Export and Data Portability (Critical)
Current:
- Evidence and audit artifacts are emphasized, but end-user export appears under-specified as a platform promise.

Needed:
- **Universal Export Contract** with stable schemas for:
  - identity/profile,
  - conversation/intent history,
  - memory/context objects,
  - asset/balance/event history,
  - governance votes/delegations,
  - app entitlements and receipts.
- Human-readable and machine-readable bundles (JSONL + signed manifest + optional encrypted archive).
- Selective export scopes (full account, time-window, capsule-specific, legal-hold mode).
- Deterministic re-import validation with checksum/proof continuity.

## Why Export Must Be Elevated Now
- It reduces lock-in anxiety for citizens, creators, and institutions.
- It improves regulatory posture (data rights and portability expectations).
- It enables partner adoption because integrations remain reversible.
- It becomes a moat via trust, not captivity.

## 90-Day Sequencing Proposal

## Days 0-30: Spec + Contract
- Publish `export.schema.v1` for core objects.
- Define signed manifest and integrity model.
- Add compatibility policy (backward-compatibility guarantees).

Exit criteria:
- RFC accepted; test vectors published.

## Days 31-60: API + Tooling
- Add `/api/v1/export/jobs` with async export pipeline.
- Add scoped export permissions and policy checks.
- Build CLI and dashboard flow for operator-verified exports.

Exit criteria:
- Export job success rate >99% in staging; signed bundle verification green.

## Days 61-90: Re-import + Partner Pilot
- Add import validator and dry-run diff mode.
- Pilot one external migration path (e.g., from a community platform).
- Publish transparency dashboard: export latency, failures, schema drift.

Exit criteria:
- Two successful end-to-end migrations with reproducible logs.

## KPI Suggestions
- Median export generation time.
- Export completion success rate.
- Re-import validation pass rate.
- Percentage of objects covered by stable export schemas.
- Number of partner migrations completed without manual data repair.

## Decision Recommendation
Treat export as a **P0 trust primitive** and include it as an explicit milestone gate for sovereign/guild expansion and mainnet promotion readiness.
