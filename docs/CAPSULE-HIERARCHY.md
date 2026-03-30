# AXIOM-MESH Capsule Hierarchy (v3 – March 2026)

This document formalizes the package hierarchy requested for operations and installer behavior:

`Skill Pill → Capsule → Capsule Plus`

## Hierarchy Contract

| Layer | Depends on | Scope | Typical profile |
|---|---|---|---|
| Skill Pill | Mesh kernel primitives | Single-purpose micro-skill | minimal-edge |
| Capsule | 1+ Skill Pills + gateway/kernel | Domain package (education, governance, analytics) | shared-machine |
| Capsule Plus | Capsule | Full-stack domain bundle with regional standards and governance overlays | education-node / dedicated-mesh |

## 0. Skill Pill (ultra-lightweight basic skill)
- Purpose: Single-purpose micro-skills (OpenClaw / Agent Zero style)
- Examples: QR-sync-pill, wallet-balance-pill, totp-2fa-pill, basic-vote-verify-pill
- RAM target: <150 MB
- Use cases: Instant Android/Termux edge, family nodes, live-USB offline

## 1. Capsule (standard)
- Requires: Skill Pill(s) + kernel/gateway
- Examples: education-capsule (core), governance-capsule (core)
- Overlaps: Shares core mesh, wallet, auth primitives
- RAM target: 300–600 MB

## 2. Capsule Plus (advanced education/governance)
- Requires: Capsule
- Major overlapping cores: curriculum-engine, mission-dashboard, achievement-tracker, zero-knowledge voting, paper-ballot backup
- Regional curricula (primary focus Ontario → expand):
  - Ontario Education Capsule Plus (implemented)
  - Canadian Government Capsule Plus (implemented)
  - US Government Capsule Plus (implemented)
  - UK Government Capsule Plus (planned)
  - China Governance Capsule Plus (planned – pull-not-push philosophy)
- RAM target: 800 MB – 2 GB (full-system mode)

## Installer Mapping

- `--capsule=skill-pill` → minimal-edge role, lightweight deploy path.
- `--capsule=capsule` → standard role selection flow.
- `--capsule=capsule-plus` → education/governance expanded profile.
- `--region=<key>` → applies regional curriculum selector from `config/regional_curricula.json` (default: `ontario`).

## Regional Standards Reference

The canonical region map and rollout status is stored in:
- `config/regional_curricula.json`

Ontario remains the default active curriculum profile.
