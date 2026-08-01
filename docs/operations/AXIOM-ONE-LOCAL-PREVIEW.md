# AXIOM One Local Preview

**Applies to:** `0.12.0-dev.0`

**Policy schema:** `axiom-one-preview.v1`

**Status:** experimental local preview; not a supported product

**Updated:** 2026-08-01

## Purpose and exact claim

The current source includes an experimental AXIOM One browser/PWA shell under
[`apps/axiom-one/`](../../apps/axiom-one/). It lets a developer or evaluator
connect a browser to the local development node, see current node status,
exercise one transparent bounded intent, read approval and memory metadata,
inspect the event timeline, and view selected raw Gateway responses without
using the CLI for those interactions.

The preview is executable evidence that the human-product layer can remain
outside the trusted `mesh/` kernel and consume only the versioned
[`axiom-gateway-client-contract.v1`](GATEWAY-CLIENT-CONTRACT.md). It is not a
claim that AXIOM One is supported, production-promoted, safe for remote
exposure, suitable for real sensitive data, or complete. `UX-002` remains in
progress because the full onboarding, lifecycle, Share, Circles, session,
device, accessibility, usability, packaging, update, and support gates have
not been satisfied.

The machine-readable preview policy is
[`apps/axiom-one/app-policy.json`](../../apps/axiom-one/app-policy.json). Its
status is exactly `experimental-local-preview`. The capability registry records
the browser dashboard as experimental, while the versioned Gateway client
contract remains the implemented boundary beneath it.

## Start and stop the local preview

Run the verified source setup once from the repository root:

```bash
npm run setup
```

Start the development node in the first terminal:

```bash
npm run dev
```

The ready receipt prints the local Gateway origin and `token_path`. The token
file is mode-restricted development material. Copy its single value only into
the local preview connection field. Do not paste it into a command history,
issue, chat, log, screenshot, document, or remote site.

Start the preview in a second terminal:

```bash
npm run axiom-one
```

The preview prints a secret-free receipt with:

- URL `http://127.0.0.1:4173` by default;
- Gateway origin `http://127.0.0.1:8080` by default;
- support state `experimental-local-preview`;
- `token_created: false`.

Open the printed preview URL. Paste the development token into **Local API
token**, select **Connect**, and keep both terminal processes running. Stop the
preview and node with `Ctrl+C` in their respective terminals. Closing or
reloading the page clears the in-memory browser session and requires the token
again.

The optional environment variables are intentionally narrow:

```text
AXIOM_ONE_PORT          local preview port; default 4173
AXIOM_GATEWAY_ORIGIN    explicit http://127.0.0.1:<port> or http://localhost:<port>
```

The preview refuses a non-loopback bind host. The Gateway origin must be an
explicit loopback HTTP origin with a port and no credentials, path, query, or
fragment. These settings do not authorize a remote origin, public bind,
reverse tunnel, or production deployment.

## Implemented surfaces

The preview has seven primary sections. Their labels describe the intended
product organization, but only the functions in this table are current.

| Surface | Current behavior | Gateway routes | Current boundary |
|---|---|---|---|
| Overview | Reads kernel version, runtime summary, and capability counts | `status.get`, `capabilities.list` | Authenticated read; no promotion inference |
| Ask | Sends one `system.echo` intent with a visible purpose and cancellation | `intents.submit` | Transparent deterministic test; no AI provider or synthetic assistant |
| Approvals | Lists approval records visible to the principal | `approvals.list` | Read-only; approval creation/explanation flow pending |
| Vault | Lists visible memory objects, edges, and raw metadata | `memory.list` | Read-only; ingestion, tombstone, deletion, export, and recovery UI pending |
| Receipts | Lists up to 50 visible integrity-linked events | `events.list` | Evidence timeline; integrity is not truth |
| Share | Displays explicit unavailable Selective Sharing and Circles states | none | Sends nothing; sharing and Circles remain disabled |
| Explore | Reads selected raw status, registry, operations, node, capsule, import, backup, and audit data | eight contract-listed read routes | Scope denials remain visible; raw data is not reinterpreted as success |

The policy lists exactly 12 client route identifiers. The checker requires
every identifier to exist in the active Gateway client contract. The loopback
server independently matches method, path, and query names against that
contract before proxying. `/internal/...`, unlisted `/v1/...`, a wrong method,
or an undeclared query parameter is never forwarded.

The Ask surface deliberately does not pretend to be an AI assistant. The
current kernel has no implemented AI provider. The surface explains that it
submits `system.echo` through Gateway, Hypervisor, Sandbox, and Grid so an
evaluator can observe the real authenticated policy and evidence path. The
result, status, evidence, idempotent replay indication, error code, and trace
identifier remain inspectable. A future AI workflow must be delivered through
the separately governed provider contract and cannot silently replace this
explicit behavior.

## Browser and token boundary

The preview does not create, discover, read, print, or inject a token. A human
supplies a current token after opening the loopback page. The browser module
holds it in one JavaScript object only while the page is open. Disconnect,
reload, navigation away, or page close clears the reference. The page does not
write the token or response data to:

- `localStorage`;
- `sessionStorage`;
- IndexedDB;
- cookies;
- Cache Storage;
- a URL or fragment;
- logs or analytics;
- HTML markup or DOM injection;
- the service-worker shell cache.

The service worker caches only an exact allowlist of public shell assets. It
returns before handling any `/v1/` request, never places an API response into a
cache, and uses a network-first update path with the last verified shell as an
offline fallback. Offline shell availability does not imply offline node data:
without the live loopback proxy and Gateway, authenticated operations fail
visibly.

The shared client emits only relative `/v1/...` requests with
`credentials: same-origin` and redirect rejection. The preview server forwards
only `Authorization`, `Accept`, the exact JSON content type, trace ID, and the
required idempotency key. It does not forward a browser cookie, referer,
forwarded host, arbitrary header, or client-selected upstream origin.

This memory-only bearer-token design is suitable only for the bounded local
development preview. It does not complete `UX-005`. A supported browser product
still requires a separately reviewed device/session design with expiry, idle
timeout, revocation, scope reduction, CSRF analysis, secure update identity,
and recovery that does not turn a long-lived bearer token into ambient browser
authority.

## Loopback proxy and response controls

The preview binds only `127.0.0.1`. It rejects a Host header other than the
active `127.0.0.1:<port>` or `localhost:<port>`, limiting DNS-rebinding and
accidental non-loopback use. API requests with an `Origin` header must match
the preview origin, and Fetch Metadata must be `same-origin` or `none` when
present. The server returns no permissive CORS header. Cross-site form, fetch,
frame, image, and script paths therefore gain no token and no authorized API
response.

The proxy independently enforces:

- a contract-listed method and `/v1/` path;
- only declared query names;
- at most 64 query values, 512 characters each;
- a valid bearer header with no newline;
- JSON and a 16-160 character idempotency key for the one POST route;
- a 1 MiB maximum request body;
- a 30-second upstream timeout;
- an incrementally read 2 MiB maximum response;
- no upstream redirects;
- no response cache.

The proxy has one fixed Gateway origin from startup configuration. It never
uses a request header, query, route parameter, browser value, or response to
choose an upstream host. Dependency loss becomes an explicit structured
`dependency_unavailable` response. An oversized response becomes
`response_too_large`. Unlisted routes are rejected locally and never reach the
Gateway.

Static paths come from one fixed map. The server does not join a request path
onto the filesystem, provide directory listing, or use a single-page fallback
that could disguise an unknown route. Static responses are no-store/no-cache
at the HTTP layer so the service worker controls its exact offline shell
inventory.

## Security headers and offline policy

Every static, health, proxy, and local error response receives the same base
hardening headers. The Content Security Policy is self-only and includes:

```text
default-src 'self'
base-uri 'none'
connect-src 'self'
font-src 'self'
form-action 'self'
frame-ancestors 'none'
img-src 'self'
manifest-src 'self'
object-src 'none'
script-src 'self'
style-src 'self'
worker-src 'self'
```

There is no inline script, inline style, `eval`, remote font, remote image,
remote stylesheet, CDN, analytics tag, advertising identifier, or third-party
account library. The server also sends `Cross-Origin-Opener-Policy:
same-origin`, `Cross-Origin-Resource-Policy: same-origin`,
`Origin-Agent-Cluster: ?1`, `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and a deny-all
Permissions Policy for camera, display capture, geolocation, microphone,
payment, and USB.

The manifest describes **AXIOM One Local Preview**, uses the root scope, and
contains a repository-native SVG icon. Installation as a PWA changes only the
browser presentation of this experimental source; it does not make the preview
supported, production-promoted, remotely safe, or able to operate without a
live local node.

## Accessibility and responsive foundation

The current shell provides a semantic header, navigation, main region, footer,
status announcements, explicit labels, a skip link, keyboard-native controls,
visible focus, responsive single-column layouts, high-contrast dark and light
themes, and a reduced-motion media query. Browser inspection has verified the
render at a standard desktop size and at a 375-pixel phone viewport without
document-level horizontal overflow. Planned sections use the word
**Unavailable** rather than a deceptive enabled control.

These are implementation foundations, not completion of `UX-006`. Automated
semantic checks and a visual inspection do not replace keyboard traversal,
screen-reader testing, zoom, contrast calculation, multiple mobile browsers,
touch-target measurement, language review, cognitive walkthroughs, or testing
with people who use assistive technology. Those remain promotion gates.

## Verification, rollback, and failures

Run the exact preview checker from the repository root:

```bash
npm run axiom-one:check
```

It verifies policy identity, exact surfaces and route inventory, membership in
the active Gateway contract, the no-storage/no-injection/no-remote-origin
browser boundary, semantic document markers, CSP server markers, service-worker
API exclusion, reduced motion, manifest identity, and secret-free asset
digests. The normal source gate also runs this checker and the focused server
tests.

The test suite proves:

- exact policy status and seven-surface/twelve-route inventory;
- rejection of a public bind or non-loopback Gateway origin;
- rejection of a weakened storage policy;
- required CSP, framing, opener, and content-type headers;
- secret-free health output;
- exact authenticated status and intent forwarding;
- a real status read and bounded echo intent through the preview proxy,
  Gateway, Hypervisor, Sandbox, and Grid;
- no cookie forwarding;
- cross-origin rejection before upstream I/O;
- rejection of unlisted `/v1/` routes before upstream I/O.

Release verification includes the preview policy and asset digests, and the
current-build source input digest includes `apps/`. This binds what was tested;
it does not promote the preview.

Rollback is source rollback. Stop `npm run axiom-one`, remove any installed PWA
entry and its public shell cache through the browser, and return to the prior
verified commit. No preview migration or user-data store exists in this
increment. Kernel/Grid rollback and recovery procedures remain separate and
must not be replaced by clearing browser data.

Expected visible failures include invalid or retired token, missing scope,
Gateway unavailable, request cancelled, timeout, response too large, malformed
Gateway response, and explicit policy denial. The UI keeps the structured code
and trace identifier visible where available. It does not replace failure with
cached API data, a fabricated result, or a generic success state.

## Remaining gates and non-claims

This increment does not complete or claim:

- non-technical installation or automatic local-node discovery;
- a supported AXIOM One product;
- a completed browser/session/device threat model or independent review;
- secure persistent authentication, device enrolment, idle expiry, or device
  revocation;
- complete plan, approval, consent, revocation, uncertainty, or denial
  explanations;
- memory ingestion, correction, tombstone, delete, export, or restore UI;
- selective sharing, remote recipients, or AXIOM Circles;
- an external or local AI provider;
- useful AI workflows or model-output truth;
- a complete accessibility or human-usability gate;
- signed preview packaging, update, rollback automation, or support service;
- production credentials, live deployment, federation, consensus, or
  production promotion.

The next work is to run the shell against real development fixtures for each
current read surface, add human-readable plan/denial/approval mappings, expose
the governed memory and export/deletion lifecycle, and design the separate
browser session/device boundary. Share, Circles, and AI controls must remain
visibly unavailable until their own contracts and negative evidence exist.
