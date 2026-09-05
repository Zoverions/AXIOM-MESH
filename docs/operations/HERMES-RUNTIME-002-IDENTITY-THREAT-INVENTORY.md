# Hermes RUNTIME-002 Identity-Only Dependency Inventory + Threat Notes

**Status:** bounded research prep for `RUNTIME-002` pin acceptance gates; **not** SBOM certification, **not** pin acceptance, **not** live Hermes process audit complete

**Updated:** 2026-09-05

**Trackers:** `RUNTIME-001` (contract + synthetic reference), `RUNTIME-002` (in progress — identity-only fixture; inventory/threat note for the exact profile)

**Normative parents:**

- [Runtime adapter first pin](RUNTIME-ADAPTER-FIRST-PIN.md)
- [Hermes RUNTIME-002 identity fixture](HERMES-RUNTIME-002-IDENTITY-FIXTURE.md)
- [Hermes RUNTIME-002 candidate pin — 2026-08-21](../reviews/HERMES-RUNTIME-002-CANDIDATE-PIN-2026-08-21.md)
- [Owner decision log — 2026-09](OWNER-DECISION-LOG-2026-09.md)
- [Agent Runtime Adapter conformance](../architecture/AGENT-RUNTIME-ADAPTER-CONFORMANCE.md)

Machine-readable pin profile: `mesh/fixtures/runtime-adapter/hermes-runtime-002-identity-pin.json`

Upstream source inspected for this note: `NousResearch/hermes-agent@b6bcb3e791c673e63974029bbab40cc9326803ff` (`hermes_cli/build_info.py`, `pyproject.toml`).

## Exact pin and first operation

| Field | Value |
|---|---|
| Upstream | `https://github.com/NousResearch/hermes-agent` |
| Immutable commit | `b6bcb3e791c673e63974029bbab40cc9326803ff` |
| Project version at pin | `0.20.5` |
| Commit signature (GitHub API) | `verified: false` / reason `unsigned` |
| Licence at pin | MIT |
| First operation only | `hermes.get_code_identity` → `adapter.hermes.code_identity.inspect` |
| Helper | `hermes_cli.build_info.get_code_identity` |
| Allowed output fields | `sha`, `short_sha`, `version`, `source` |
| Explicitly rejected | `hermes dump` / broader diagnostics |

This inventory covers the **identity-only adapter profile**, not the full Hermes feature set, optional extras, providers, messaging, browser, MCP, cron automation, skills, or orchestration surfaces.

## Python environment bounds (from pin)

From pinned `pyproject.toml`:

- `requires-python = ">=3.11,<3.14"`
- Identity helper uses stdlib only: `pathlib`, `typing`, and `tomllib` (stdlib on Python ≥ 3.11)
- No third-party import is required to evaluate `get_code_identity()` when the helper module is loaded in isolation

Any future live probe must keep the child interpreter inside `>=3.11,<3.14`, with network disabled and no Hermes `.env` import.

## Dependency inventory — identity-only slice

### Must be present (minimum surface)

For a fail-closed identity observation that can succeed (non-`unknown`):

1. Pinned checkout or admitted artifact at commit `b6bcb3e791c673e63974029bbab40cc9326803ff`
2. `hermes_cli/build_info.py` (and package path needed to import that module alone)
3. `pyproject.toml` readable for `project.version` (`0.20.5` expected)
4. One identity source:
   - `.git` HEAD resolution path used by `_resolve_git_head_sha` (preferred `source: "git"`), **or**
   - `.hermes_build_sha` containing the exact pin SHA (`source: "build-file"`)
5. Python `>=3.11,<3.14` with stdlib `tomllib`

No provider SDK, HTTP client, messaging library, browser stack, MCP stack, or lazy-install helper is required for this operation.

### Explicitly excluded from the identity-only profile

Do **not** treat the following as part of the first AXIOM profile, even if present in a full Hermes tree or install:

| Surface | Exclusion rule for identity-only |
|---|---|
| Providers / model SDKs | No `openai`, Anthropic, Bedrock, Vertex, Azure Identity, Mistral, or other provider extras; no model inference |
| Messaging / platforms | No Telegram/Discord/Slack/Matrix/Teams/DingTalk/Feishu/WeCom/SMS/Home Assistant extras or gateway platform paths |
| Browser / computer-use | No browser CDP/websockets-driven automation, `computer-use`, or related MCP bridging |
| MCP / ACP / A2A | No MCP server/client extras, ACP adapter entry, or A2A exposure |
| Lazy installs | No `tools/lazy_deps.py` (or equivalent) runtime installs; profile sets `lazy_installs: false` |
| Secrets / `.env` | No Hermes `.env` / `python-dotenv` import; no provider API keys in child env; `env_import: false`, `credentials_permitted: false` |
| Terminal / PTY / cron / skills / self-update | No shell/terminal backends, cron scheduling paths, skill create/update, or self-update |
| Support dump | No `hermes dump` (loads broader config/secret-presence metadata) |
| Full core dependency blast radius | Installing full `hermes-agent` still resolves many core packages (`httpx`, `requests`, `openai`, `fastapi`, `websockets`, etc.). Those packages are **outside** the identity-only approved import/execution surface and must remain cold / unreachable for the first operation |

Residual note: a naïve `pip`/`uv` install of the whole package is **not** the identity-only environment. Preferred future live path is an import-isolated probe of `get_code_identity` (or an equally narrow sealed artifact) that does not load provider, network, messaging, browser, or MCP modules.

### Optional extras (never part of first slice)

Pinned optional-dependency groups that enlarge authority/network surface and remain excluded: `anthropic`, `exa`, `firecrawl`, `parallel-web`, `fal`, `edge-tts`, `modal`, `daytona`, `vercel`, messaging/`slack`/`matrix`/`teams`/`dingtalk`/`feishu`/`wecom`, `mcp`, `computer-use`, `acp`, `web`, `bedrock`, `vertex`, `azure-identity`, `mistral`, `voice`/`tts-premium`, memory extras, `google`, `youtube`, `all`, and related composites.

`uv.lock` at the pin records full-tree hashes for supply-chain review of a **full** install; it is reference material only and does **not** certify the identity-only profile as an SBOM-complete environment.

## Threat notes (identity-only profile)

### Supply-chain (unsigned commit)

- GitHub reported the pin commit as **unsigned** (`commit_signature_verified: false` in the Mesh fixture).
- Exact SHA pin removes mutable-ref drift (`main` / `latest`) but does **not** prove Nous Research publisher authenticity.
- Full-package installs inherit Hermes core + transitive risk; identity-only must not widen to that surface.
- Lazy installs and unpinned extras are reject-list items for this profile.

### Secret import

- `hermes dump` and dotenv-backed config paths can disclose or imply credential presence; rejected as first op.
- Profile requires `env_import: false` and `credentials_permitted: false`.
- Unexpected provider credentials in a child environment are a negative conformance case.

### Network

- Profile requires `network: "disabled"`.
- Core Hermes dependencies include HTTP clients; identity-only must not open sockets or resolve destinations.
- Any observed network attempt fails the slice.

### Privilege escalation via dump / support commands

- Broader diagnostics (`hermes dump`, banner/support paths that pull config) exceed the four identity fields.
- Adapter rejects `hermes.dump` / `hermes dump` and bounds output to declared fields.
- Forged `.hermes_build_sha` that disagrees with the admitted pin must deny (fixture already encodes this).

### Second control plane

- Hermes local approval, tool allowlists, skills, plugins, gateway, or runtime-local roles must never authorize Mesh effects.
- Adapter path remains: external runtime → versioned adapter → Gateway → Hypervisor → Sandbox → Grid → receipt.
- Creating a second Gateway/control plane, mapping Hermes permissions to Mesh grants, or skipping Gateway is reject-list territory.
- Current Mesh driver is **fixture-backed** (`subprocess_spawn: false`); install grants zero Mesh authority.

## Fail-closed expectations already in the fixture

Encoded in `hermes-runtime-002-identity-pin.json` and exercised by `mesh/test/hermes-runtime-002-identity-fixture.test.mjs`:

1. Exact pin SHA + version binding
2. Network disabled; no env/credential import; no lazy installs / browser / messaging / MCP / A2A / terminal / cron / skill-update / self-update / inference / remote execution
3. Unknown identity → denied
4. SHA ≠ pin → denied
5. Forged build-file identity → denied
6. Extra identity fields → denied
7. `hermes dump` rejected
8. Receipts bind Agent Runtime Adapter v1 contract digest + adapter manifest digest + pin digest; tamper rejected
9. `production_certification_claimed: false`, `pin_accepted: false`, `live_hermes_spawned: false`

## Explicit non-claims

This document does **not**:

- certify an SBOM or complete dependency audit of Hermes or of a full `uv.lock` closure;
- accept the RUNTIME-002 read-only pin;
- claim a live Hermes process audit, native-vs-adapter Gateway parity, cancellation/idempotency/timeout evidence against a real subprocess, or direct-service denial against Hypervisor/Sandbox/Grid is complete;
- authorize install, execute, MCP, A2A, remote execution, model inference, or Mesh authority for Hermes;
- change `capabilities.json` or claim production certification.

Promotion still requires the first-pin gates in [RUNTIME-ADAPTER-FIRST-PIN.md](RUNTIME-ADAPTER-FIRST-PIN.md), including parity matrix green and an owner decision log entry: **“RUNTIME-002 read-only pin accepted”**.

**Not production certification.**
