# AXIOM-MESH Capsule Hierarchy (v2 – March 2026)

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
  - Ontario Education Capsule Plus (live today)
  - Canadian Government Capsule Plus (multi-level, live today)
  - US Government Capsule Plus (planned)
  - UK Government Capsule Plus (planned)
  - China Governance Capsule Plus (planned – pull-not-push philosophy)
- RAM target: 800 MB – 2 GB (full-system mode)