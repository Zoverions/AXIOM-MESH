# Gateway Client Contract

**Applies to:** `0.12.0-dev.0`

**Contract schema:** `axiom-gateway-client-contract.v1`

**Status:** implemented client-contract boundary; experimental local PWA foundation present

**Updated:** 2026-08-01

## Purpose and boundary

The current build provides a versioned contract and zero-dependency client for
human applications that use the authenticated Gateway API. The machine-readable
contract is
[`mesh/config/gateway-client-contract.json`](../../mesh/config/gateway-client-contract.json),
its hand-reviewed JSON Schema is
[`mesh/config/gateway-client-contract.schema.json`](../../mesh/config/gateway-client-contract.schema.json),
and the client is
[`packages/axiom-client/index.mjs`](../../packages/axiom-client/index.mjs).
The client is a private source module in this repository, not a published npm
package; applications must bind and version it with the checked-out build.

The contract covers all 27 authenticated `/v1/` Gateway routes. It deliberately
does not include `/`, `/health`, or `/ready`, which are unauthenticated ingress
and operator-probe routes rather than the authenticated application contract.

The client accepts only contract route identifiers and constructs a relative
`/v1/...` target. It has no configurable Grid, Hypervisor, or Sandbox origin,
and cannot form an internal-service request. A browser binds the supplied
request function to its current origin. A desktop or local host wrapper binds
the same relative request to the permission-restricted Gateway Unix socket or
loopback ingress. The client never discovers or bypasses Gateway.

This module is not a browser application, session manager, credential vault,
or production deployment. It stores a supplied token only in the live client
instance or calls a supplied token provider. Persistent token storage, cookies,
device identity, CSRF policy, origin policy, and session revocation belong to a
separately reviewed application boundary.

## Current route inventory

Every route requires bearer authentication. Access values below name additional
server-enforced ownership or scope checks; they do not grant those rights to the
client.

| Client route ID | HTTP route | Access | Query or path inputs |
|---|---|---|---|
| `capabilities.list` | `GET /v1/capabilities` | authenticated | none |
| `status.get` | `GET /v1/status` | authenticated | none |
| `operations.get` | `GET /v1/operations` | `operations:read` or `telemetry:collect` | none |
| `metrics.get` | `GET /v1/metrics` | `operations:read` or `telemetry:collect` | none |
| `intents.submit` | `POST /v1/intents` | authenticated | intent body and required idempotency key |
| `intents.get` | `GET /v1/intents/:id` | owner or `audit:read` | `id` |
| `events.list` | `GET /v1/events` | owner or `audit:read` | `actor`, `after`, `limit` |
| `capsules.list` | `GET /v1/capsules` | authenticated | none |
| `proposals.list` | `GET /v1/proposals` | authenticated | none |
| `nodes.list` | `GET /v1/nodes` | authenticated | none |
| `nodes.discover` | `GET /v1/node-discovery` | `node:read` | capability, role, security, lease, and limit filters |
| `node_schedules.list` | `GET /v1/node-schedules` | `node:read` | none |
| `consents.list` | `GET /v1/consents` | owner | none |
| `approvals.list` | `GET /v1/approvals` | owner | none |
| `memory.list` | `GET /v1/memory` | owner or consented share | optional owner |
| `accounting.get` | `GET /v1/accounting` | owner | none |
| `imports.list` | `GET /v1/imports` | owner | none |
| `imports.get` | `GET /v1/imports/:id` | owner | `id` |
| `appeals.list` | `GET /v1/appeals` | owner | none |
| `storage_offers.list` | `GET /v1/storage-offers` | owner | none |
| `sync.list` | `GET /v1/sync` | owner | `namespace`, `record_id` |
| `sync_bundles.get` | `GET /v1/sync/bundles/:digest` | owner | `digest` |
| `backups.list` | `GET /v1/backups` | owner | none |
| `backups.get` | `GET /v1/backups/:id` | owner | `id` |
| `exports.get` | `GET /v1/exports/:id` | owner | `id` |
| `export_bundles.get` | `GET /v1/exports/:id/bundle` | owner | `id` |
| `audit.verify` | `GET /v1/audit/verify` | `audit:read` | none |

The checker parses every literal Gateway `router.add()` declaration and
requires the ordered `/v1/` inventory to equal the contract. Adding, removing,
renaming, or dynamically constructing an authenticated route fails the normal
setup and release gates until the contract, tests, schemas, and documentation
are revised together.

## Intent requests and idempotency

`intents.submit` is the only effect-bearing Gateway route. All other contract
routes are reads. Its request schema permits exactly:

- required action identifier of at most 128 characters;
- optional object `input`;
- optional purpose of at most 512 characters;
- optional string arrays with 160-character items: at most 64 `data_scopes`,
  8 `confirmations`, and 8 `approval_ids`.

An idempotency key is mandatory, 16 to 160 characters, and limited to letters,
digits, underscore, period, colon, and hyphen. The same principal and key derive
the same intent identifier. Reusing a key with a different effective request
returns `idempotency_conflict`. Reusing it with the same request returns the
same success fields as the first response plus `idempotent_replay: true`.

The client never retries an effect automatically. An application that retries
after an ambiguous transport failure must reuse the original key and retain the
user-visible pending state until the result is known.

Example with an application-owned same-origin request function:

```js
import { createGatewayClient } from './packages/axiom-client/index.mjs';

const client = createGatewayClient({
  token: () => sessionToken,
  request: (path, options) => fetch(path, options)
});

const result = await client.call('intents.submit', {
  body: {
    action: 'system.echo',
    input: { message: 'hello' },
    purpose: 'local-user-request'
  },
  idempotencyKey: 'user-action-018f4f97'
});
```

Tokens, private input, and result data must not be logged. The example assumes
the application has already established an appropriate local session boundary;
it does not endorse browser persistence of a bearer token.

## Cancellation, timeout, and response bounds

Every call accepts an `AbortSignal`. External cancellation becomes
`request_cancelled`. The default timeout is 10 seconds and a caller may select
only 1 through 30,000 milliseconds. Timeout becomes `request_timeout`; it
covers response-body reading as well as initial response receipt.

The client rejects a serialized intent larger than the Gateway's 1 MiB request
limit. It also limits a relative request target to 8,192 characters, at most 64
query values, and at most 512 characters per value. It rejects a declared or
incrementally observed response larger than 2 MiB with `response_too_large`
without first buffering the full body. It requires the exact contracted media type, valid JSON for
JSON routes, and every route's required top-level response fields. Missing
fields, invalid JSON, an invalid response object, or a wrong media type become
`invalid_gateway_response`. These checks keep malformed or incompatible
responses from being mistaken for successful state.

## Error contract

Gateway errors use this envelope and the `x-trace-id` response header:

```json
{
  "error": {
    "code": "policy_denied",
    "message": "The request was denied",
    "details": {}
  },
  "trace_id": "trace_example"
}
```

The stable v1 vocabulary is:

| Category | Codes |
|---|---|
| Authentication and scope | `authentication_required`, `invalid_token`, `forbidden` |
| Request and pressure | `rate_limited`, `body_too_large`, `validation_error`, `not_found` |
| Idempotency and approval | `idempotency_conflict`, `confirmation_required`, `independent_approval_required`, `approval_mismatch`, `approval_unavailable` |
| Policy and dependency | `policy_denied`, `capability_unavailable`, `dependency_unavailable` |
| Client lifecycle | `request_cancelled`, `request_timeout`, `response_too_large`, `invalid_client_request`, `invalid_gateway_response` |

Only `rate_limited`, `dependency_unavailable`, and `request_timeout` are marked
retryable by the contract. Retryable does not mean automatic or safe to repeat:
an effect still requires the same idempotency key and application-level state.

Domain handlers may add a new structured code in a compatible v1 response. The
client preserves an unknown code, status, and trace ID, but suppresses
unreviewed message/details, presents `Gateway request failed`, and marks it
non-retryable rather than inventing behavior. Removing or changing the meaning
of a stable code requires a new contract version.

## Verification and compatibility changes

Run from the repository root:

```bash
npm run gateway-client:check
```

The receipt contains the contract and JSON Schema digests, route and stable
error counts, implementation parity, and the same-origin/no-direct-service
boundary. It contains no token, request data, response data, origin, or user
identifier.

The test suite proves:

- exact route and JSON Schema inventory;
- relative-only target construction and rejection of unlisted inputs;
- request schema and idempotency enforcement;
- first-response and idempotent-replay compatibility;
- stable, unknown, retryable, and malformed error behavior;
- response byte and media-type bounds;
- external cancellation and bounded timeout;
- a real status read and idempotent intent through Gateway, Hypervisor,
  Sandbox, and Grid;
- rejection of direct-service, route, error-vocabulary, and source drift.

Release verification binds both schema digests and route parity. A compatible
v1 change may add optional response fields or a new domain error code while
preserving all stable fields and meanings. A removed route, renamed field,
new required request field, changed idempotency rule, weakened same-origin
boundary, or changed stable error meaning requires a new contract version and
an explicit migration/rollback plan.

## Non-claims and next application boundary

This milestone implements `UX-001`. The separate AXIOM One local preview has
started `UX-002`, but it does not implement a supported browser product,
browser session/device security (`UX-005`), or completed accessibility and
usability gates. Neither milestone adds a remote account service, third-party
analytics, AI provider, multi-host routing, or production pilot.

The experimental local shell is outside the trusted kernel and uses only this
contract. It has a loopback-only origin, strict CSP, memory-only token, and no
API cache, remote asset, analytics, sharing, Circles, or AI. It must still
separately prove the complete CSRF and cookie/token boundary, idle timeout,
device revocation, browser-storage inspection, accessible interaction,
plain-language authority, export/deletion/recovery flows, packaging, updates,
support, and human usability before promotion. See the
[AXIOM One local preview](AXIOM-ONE-LOCAL-PREVIEW.md).
