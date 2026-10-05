# Hermes RUNTIME-002 Identity Fixture (research slice)

**Status:** provisional research/fixture for `RUNTIME-002`; **not** pin acceptance, production certification, live Hermes execution, or capability promotion

**Updated:** 2026-09-05

**Trackers:** `RUNTIME-001` (contract + synthetic reference), `RUNTIME-002` (in progress — identity-only fixture)

**Normative parents:**

- [Runtime adapter first pin](RUNTIME-ADAPTER-FIRST-PIN.md)
- [Hermes RUNTIME-002 candidate pin — 2026-08-21](../reviews/HERMES-RUNTIME-002-CANDIDATE-PIN-2026-08-21.md)
- [Agent Runtime Adapter conformance](../architecture/AGENT-RUNTIME-ADAPTER-CONFORMANCE.md)
- [Owner decision log — 2026-09](OWNER-DECISION-LOG-2026-09.md)
- [Hermes RUNTIME-002 identity threat inventory](HERMES-RUNTIME-002-IDENTITY-THREAT-INVENTORY.md)

## What landed

Mesh records an immutable provisional Hermes pin and a **fixture-backed** identity-only adapter profile that exercises the smallest read-only boundary:

| Field | Value |
|---|---|
| Upstream | `https://github.com/NousResearch/hermes-agent` |
| Immutable commit | `b6bcb3e791c673e63974029bbab40cc9326803ff` |
| Project version at pin | `0.20.5` |
| First operation | `hermes.get_code_identity` → `adapter.hermes.code_identity.inspect` |
| Allowed fields | `sha`, `short_sha`, `version`, `source` |
| Explicitly rejected | `hermes dump` / broader diagnostics |
| Driver | fixture-backed (no Hermes subprocess) |

Machine-readable pin + profile:

- `mesh/fixtures/runtime-adapter/hermes-runtime-002-identity-pin.json`

Mesh helpers + receipt binding:

- `mesh/src/lib/hermes-identity-fixture-adapter.mjs`

Focused tests:

- `mesh/test/hermes-runtime-002-identity-fixture.test.mjs`

## Profile constraints (fail closed)

The recorded execution profile requires:

1. exact source commit pin above;
2. network disabled;
3. no Hermes `.env` import;
4. no provider/model credentials;
5. no lazy installs, browser, messaging, MCP, A2A, terminal, cron, skill-update, or self-update paths;
6. no model inference and no remote execution;
7. unknown identity or SHA ≠ pin → denied;
8. forged `.hermes_build_sha` (build-file source with non-pin SHA) → denied;
9. output bounded to the four identity fields;
10. receipts bind Agent Runtime Adapter v1 contract digest + adapter manifest digest + pin digest;
11. `production_conformance_claimed: false`, `pin_accepted: false`, `live_hermes_spawned: false`.

## Parity cases covered (fixture path)

Covered by the fixture-backed driver and tests:

- pin binding (exact SHA + version);
- field bounding (extra fields denied);
- unknown identity fail-closed;
- SHA mismatch denial;
- forged build-sha denial;
- explicit `hermes dump` rejection;
- contract digest + manifest digest receipt binding;
- receipt tamper rejection;
- install grants zero authority / non-claims preserved.

## Deferred (not claimed green)

Still required before calling the pin accepted (see first-pin parity matrix):

- live no-secret Hermes process path (network disabled, bounded timeout) if owner later authorizes spawn;
- native Gateway versus adapter authorization parity on a real Gateway route;
- direct-service denial against Hypervisor/Sandbox/Grid from the runtime boundary;
- cancellation, idempotency, timeout, and bounded-response evidence against a real adapter process;
- deepen/complete SBOM-grade dependency evidence beyond the bounded identity-only inventory note ([HERMES-RUNTIME-002-IDENTITY-THREAT-INVENTORY.md](HERMES-RUNTIME-002-IDENTITY-THREAT-INVENTORY.md) is prep only — not certification);
- independent review;
- owner decision log entry: **“RUNTIME-002 read-only pin accepted”**.

`capabilities.json` remains untouched by this slice.

## Non-claims

This document does **not** claim that Hermes is installed, safe, signed, AXIOM-certified, production-ready, or authorized. It does not claim RUNTIME-002 complete, pin accepted, MCP/A2A/remote-execution support, or Mesh authority for Hermes. The fixture path is explicitly **not** production certification.

**Not production certification.**
