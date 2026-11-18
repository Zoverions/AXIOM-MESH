# Feed contract scaffolding — PWA interface lane

**Label:** DESIGN-ONLY · **Status:** mocks + loopback stubs only. Not wired to the real relay.

## What this is

The typed interface the AXIOM One PWA builds against to read the operator's
unified presence feed: audience projections, chronological substrate, cursor
pagination, rescind notices, error cases. Everything here is scaffolding so PWA
UI work can proceed without the real backend.

Files:

| File | Purpose |
|---|---|
| `feed-contract.schema.json` | Machine-readable contract (JSON Schema 2020-12) |
| `feed-contract.d.ts` | TypeScript types mirroring the schema |
| `fixtures.json` | Synthetic fixture data (no real user content, no memoir content — ever) |
| `mock-feed-server.mjs` | Loopback-only mock server (binds 127.0.0.1), exports `startMockFeedServer()` |
| `contract-tests.mjs` | Contract tests: every fixture + every live mock response is schema-validated |

Run the tests: `node contract-tests.mjs` from this directory.

## The contract (summary)

Derived from lane-BA `feed-design.md` + `feed-api-sketch.md` (both DESIGN-ONLY).
Reads are audience-scoped and rescind-aware; writes are stubbed.

- `GET /v1/feed?audience=<aud>&cursor=&limit=&lens=` → `{ items, next_cursor, server_seq }`
  - `audience`: `public` | `circle:<id>` | `intimate` | `named:<principal>`. Malformed → 400, whole request fails, no partial results.
  - `items` are audience projections in sequence order, newest first. Rescinded items are excluded server-side — no placeholders, no countable gaps.
  - `next_cursor` is opaque; `server_seq` is the cache-invalidation key. `limit` default 20, max 100.
  - `lens=none` (default) is chronological. A lens id returns the reader's ordering over the **same item set** — a lens can never change which items are eligible, never widens audience, never touches canonical order.
- `GET /v1/feed/<item_id>?audience=<aud>` → one projection, or coarse **404** (`not_found`): nonexistent, rescinded, and not-in-your-audience are indistinguishable by design.
- `POST /v1/feed/<item_id>/rescind` → `{ rescind_id, tombstone_id, rescinded_at, attestations, local_effects, ui_copy, mock_only: true }`. Stub only — marks the item rescinded in-memory (idempotent), bumps `server_seq`, records a ledger entry. The `ui_copy` is the verbatim ledger line the UI shows: *"removed everywhere you control; N mirrors asked, M honored."*
- `GET /v1/feed/drafts` → the approve queue. Widening drafts carry `scope_delta` verbatim (e.g. `"intimate → public (WIDENING — always per-item)"`) and are **never** `auto_approve_eligible`.
- `GET /v1/feed/ledger` → rescind ledger records (who was asked, who honored).
- `GET /mock-info` → mock metadata; always `mock: true`.
- Error envelope: `{ error: { code, message }, trace_id, mock: true }` with codes `validation_error | not_found | not_authorized_for_audience | rescind_refused | mock_limitation`.

Cache rules for the future PWA: key = `audience + server_seq` (lists), `projection_id + digest` (items). A rescind changes `server_seq` and drops the item — the client drops what no longer appears. Offline: cached projections readable; on reconnect revalidate and drop silently. The client never holds: the operator's vault, epoch keys beyond the current one, other audiences' projections, anyone else's rescind ledger, other devices' state. No analytics endpoints exist.

## F-1..F-3 dependency (explicit)

Real wiring follows **F-1 → F-2 → F-3** (presence-post registry proposal → registry adoption plumbing → scope-label migration in the lane-BC prototype). Until F-2 lands:

- the scope labels carried in fixtures are **mock annotations**, not registry claims;
- nothing here may be presented to a real verifier, enqueued on the real relay, or federated;
- the epoch-gated circle composition (F-4) is unproven and unimplemented here — the mock does query-time audience checks only.

## What the PWA must NOT assume yet

- Per-projection author signatures are a prototype extension awaiting the lane-BA design owner's blessing (BC reconciliation §2) — fixtures omit them.
- Circle readership at wire time via lane-AG epochs (F-4) — mock only.
- Mirror-registry sourcing for rescind attestations (F-7) — the mock fakes attestations in-loopback.
- Rescind-request scope label (`presence-post` sub-speech-act vs its own §2 proposal) — open (O-2).

## Honest limits of this directory

- `contract-tests.mjs` uses a self-contained structural validator covering exactly the schema constructs this contract uses; it refuses to run if the schema uses an unsupported keyword (the first test asserts this). It is not a full JSON Schema validator.
- The mock plays the operator node, so it serves all fixture audiences; it is not a multi-principal security boundary.
- Fixture content is synthetic filler. Any resemblance to real posts is accidental; there is none.

## Test record

- `contract-tests.mjs`: **27 passed, 0 failed, 27 total** (run 2026-09-22 against the loopback mock).
- Static: every fixture projection / ledger record / draft card / rescind receipt validates.
- Live: schema validity of every endpoint response + semantics (chronological order, coarse 404, rescind omission + server_seq bump + idempotence, cursor pagination, lens same-item-set, widening-draft guard, fail-closed unknown circle).
