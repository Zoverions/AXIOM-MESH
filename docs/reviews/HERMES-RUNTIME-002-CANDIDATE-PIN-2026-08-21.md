# Hermes Runtime Candidate Pin — 2026-08-21

**Status:** immutable research checkpoint for `RUNTIME-002`; not runtime certification, capability promotion, installation approval, or permission to execute Hermes

**Parent survey:** [Runtime Candidate Survey — 2026-08-21](RUNTIME-CANDIDATE-SURVEY-2026-08-21.md)

**Architecture:** [Runtime & Connector Fabric](../architecture/RUNTIME-AND-CONNECTOR-FABRIC.md)

## Exact source checkpoint

| Field | Observed value |
|---|---|
| upstream repository | `https://github.com/NousResearch/hermes-agent` |
| branch observed | `main` |
| immutable commit | `b6bcb3e791c673e63974029bbab40cc9326803ff` |
| commit authored | `2026-08-21T22:46:58Z` |
| commit committed | `2026-08-21T22:50:48Z` |
| commit signature status | GitHub API reported `verified: false`, reason `unsigned` |
| project version at pin | `0.20.5` |
| Python declaration | `>=3.11,<3.14` |
| repository licence at pin | MIT |

The immutable commit is sufficient to name exact repository content for research and conformance work. It is **not** evidence that the commit was cryptographically authenticated as a release by Nous Research. The observed commit is unsigned, so publisher identity remains a separate assurance question.

Do not replace this hash with `main`, `latest`, an unpinned package reference, or a mutable container tag in an adapter manifest.

## Dependency and supply-chain observations

At this pin:

- `pyproject.toml` identifies `hermes-agent` version `0.20.5`;
- many core Python dependencies are exact-pinned and the source comments explicitly describe supply-chain risk as the reason for exact pinning;
- some dependencies remain bounded ranges or platform markers where upstream requires them;
- `uv.lock` exists and records package versions, artifact URLs, and SHA-256 hashes;
- the lock declares Python `>=3.11,<3.14` and includes explicit override state;
- Hermes also supports optional providers, messaging, browser/runtime tooling, and other extras that materially enlarge the dependency and authority surface;
- upstream documents lazy dependency installation for optional backends, which must be disabled for the first AXIOM conformance slice.

This is an inventory observation, not a completed dependency/SBOM audit. `RUNTIME-002` still requires a bounded dependency inventory for the exact adapter execution profile rather than treating every optional Hermes feature as part of the first integration.

## First integration boundary

The first candidate operation should be **code identity inspection only**.

At the pinned commit, `hermes_cli/build_info.py` provides `get_code_identity(refresh=False)`, returning a bounded dictionary containing:

- `sha`;
- `short_sha`;
- `version`; and
- `source` (`git`, `build-file`, or `unknown`).

The helper resolves source-checkout identity from `.git`, falls back to the baked `.hermes_build_sha` used by Docker builds, reads the project version from `pyproject.toml`, caches per process, and deliberately returns `None`/`unknown` on resolution failures rather than escalating privilege or contacting a provider.

### Why this operation

It can test the real external-runtime boundary while avoiding the features we explicitly do **not** want in the first slice:

- no model inference;
- no provider API key;
- no network destination;
- no browser automation;
- no messaging connector;
- no runtime tool execution;
- no memory import;
- no skill creation/update;
- no worker spawning;
- no shell/terminal execution;
- no external effect.

The adapter must treat an `unknown` identity or a SHA different from the configured immutable pin as a failed conformance observation, not as permission to continue.

## Explicitly rejected first operation: `hermes dump`

Do **not** use the general `hermes dump` support command as the first AXIOM integration probe.

At this source pin the dump implementation loads Hermes `.env`/configuration state and reports or derives broader runtime information including provider/model state, terminal backend, configured platforms, profile information, and API-key presence. Even where values are redacted, this is more metadata than the first adapter needs.

The first conformance operation should exercise the smallest source-identity helper directly rather than importing a support command whose purpose is broad diagnostic disclosure.

## Candidate adapter execution profile

Before a real Hermes process is loaded, the adapter profile should require all of the following:

1. exact source commit `b6bcb3e791c673e63974029bbab40cc9326803ff`;
2. exact reviewed Python environment for the identity-only slice;
3. no provider/model credentials in the child environment;
4. no Hermes `.env` import;
5. network disabled;
6. runtime lazy installs disabled;
7. no browser, messaging, MCP, terminal, cron, skill-update, or self-update paths;
8. read-only access only to the pinned runtime files needed for code identity;
9. finite process timeout and bounded stdout/stderr;
10. sanitized structured output containing only the four allowed code-identity fields;
11. mismatch/unknown -> denied or failed observation, never fallback to a broader runtime path;
12. no runtime-local approval state accepted as AXIOM authorization.

## AXIOM action mapping rule

Do not alias this operation onto an unrelated existing AXIOM action merely to avoid adding a semantic contract.

The implementation must either:

- identify an existing read-only Gateway action whose semantics exactly match runtime identity inspection; or
- introduce a separately reviewed, narrowly named inspection action through the normal capability/policy/evidence process.

A tool name, CLI name, plugin permission, or runtime-local role is not sufficient to infer AXIOM authority.

## Required conformance tests for the identity-only slice

Positive:

- exact pinned source returns expected full SHA and project version;
- adapter output is bounded to the declared fields;
- Grid/adapter evidence binds the exact runtime source pin and adapter contract.

Negative:

- different checkout SHA;
- missing `.git` and missing build identity;
- forged `.hermes_build_sha` inconsistent with admitted artifact identity;
- extra output fields;
- unexpected provider credential in the child environment;
- any network attempt;
- lazy dependency installation attempt;
- subprocess/tool invocation outside the permitted identity probe;
- timeout;
- cancellation before result acceptance;
- adapter/source contract mismatch;
- direct access to Hypervisor, Sandbox, or Grid from the external runtime boundary.

## What remains open

This checkpoint does not complete `RUNTIME-002`. Still required:

- comparison with a fourth maintained runtime before the survey is considered complete;
- exact dependency/SBOM inventory for the chosen identity-only environment;
- runtime artifact construction and digest;
- adapter manifest and mapping review;
- threat-model delta;
- live no-secret read-only conformance implementation;
- native-vs-adapter authorization parity evidence;
- direct-service-denial evidence;
- cancellation/idempotency/timeout/receipt evidence;
- independent review.

## Non-claims

This document does not claim that Hermes Agent is safe, signed, production-ready, AXIOM-certified, installed, enabled, or authorized. It does not claim that the full Hermes runtime or its provider, browser, messaging, tool, memory, MCP, skill, update, or orchestration surfaces satisfy AXIOM requirements. It pins one source checkpoint and identifies one deliberately narrow candidate observation for further conformance work.
