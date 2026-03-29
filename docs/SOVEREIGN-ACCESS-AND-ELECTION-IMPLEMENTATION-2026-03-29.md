# Sovereign Access + Secure Election + Live USB Polish (2026-03-29)

## Scope

This implementation closes three open roadmap items from `docs/MASTER-TODO.md` in the Capsule Hierarchy refinement lane:

1. Ship one-time blockchain code + QR login end-to-end flow.
2. Implement Secure Election Node (Governance+ paper ballot fallback + ZK verification).
3. Complete Live USB polish pass (preloaded model bundles + capsule selector UX).

## 1) One-time blockchain code + QR login E2E flow

Implemented in `gateway/src/routes/mobile.ts`:

- `POST /api/mobile/auth/qr/init`
  - Requires gateway auth.
  - Accepts `walletAddress`.
  - Produces a one-time code + nonce + expiry-backed session.
  - Returns `qrPayload` for desktop-to-mobile handoff.
- `POST /api/mobile/auth/qr/complete`
  - Verifies one-time code hash with timing-safe comparison.
  - Enforces wallet address match.
  - Validates signed payload digest shape (64-char hex).
  - Marks session `verified`.
- `GET /api/mobile/auth/qr/status/:sessionId`
  - Requires gateway auth.
  - Polling endpoint for desktop.
  - One-time consumable completion (session is removed after verified read).

## 2) Secure Election Node flow (paper fallback + ZK digest verification)

Implemented in `gateway/src/routes/mobile.ts`:

- `POST /api/mobile/election/session/init`
  - Requires gateway auth.
  - Accepts `voterIdHash` + `constituency`.
  - Mints session ID + paper fallback code.
- `POST /api/mobile/election/session/verify`
  - Requires gateway auth.
  - Accepts `sessionId`, `ballotHash`, `zkProofDigest`.
  - Fail-closed validation: each digest must be 64-char hex.
  - On malformed proof or ballot hash, returns `fallback-required` + paper fallback code.
  - On success, returns an election receipt hash.

This is a practical governance node baseline where the digital vote path is strict and malformed submissions immediately route into a traceable paper reconciliation path.

## 3) Live USB polish pass

Implemented in `live-installer/axiom-mesh-launcher.sh`:

- New interactive capsule-tier selector before first-run auto-install:
  - `skill-pill`
  - `capsule`
  - `capsule-plus`
- New model-bundle selector sourced from local offline payloads:
  - Reads `/opt/axiom-mesh/live-installer/offline/models/*`.
  - Captures selected bundle to `/tmp/axiom-assessment/selected_model_bundle.txt`.
- Installer now forwards selected capsule tier:
  - `python3 install.py --capsule "$CAPSULE_TIER" ...`

This adds a UX polish layer for offline-first USB users and ensures capsule hierarchy choices are made explicitly at install-time.

## Validation

- Added route-level tests in `gateway/src/routes/mobile.test.ts` covering:
  - One-time QR login completion + one-time consume behavior.
  - Election fallback behavior when ballot/proof digests are malformed.
