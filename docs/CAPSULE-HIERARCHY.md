# AXIOM-MESH Capsule Hierarchy

### 0. Skill Pill (ultra-lightweight basic skill)
*   **Single-purpose micro-skills** (OpenClaw / Agent Zero style)
*   **Examples:** QR-sync-pill, wallet-balance-pill, totp-2fa-pill, basic-vote-verify-pill
*   **RAM target:** <150 MB
*   **Use:** Instant Android/Termux edge, family nodes, live-USB offline

### 1. Capsule (standard)
*   **Requires:** Skill Pill(s) + kernel/gateway
*   **Examples:** education-capsule (core), governance-capsule (core)
*   **RAM target:** 300–600 MB
*   **Overlaps:** Shares core mesh, wallet, auth primitives

### 2. Capsule Plus (advanced education/governance)
*   **Requires:** Capsule
*   **Overlapping cores:** curriculum-engine, mission-dashboard, achievement-tracker, zero-knowledge voting, paper-ballot backup
*   **Regional curricula:** Ontario (primary), expand to US/UK/China via “pull not push”
*   **RAM target:** 800 MB – 2 GB (full-system mode)
