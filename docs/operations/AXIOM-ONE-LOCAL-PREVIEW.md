# AXIOM One Local Preview

**Applies to:** `0.12.0-dev.3`

**Policy schema:** `axiom-one-preview.v1`

**Status:** experimental local preview; not a supported product

**Updated:** 2026-08-01

## Purpose and exact claim

The current source includes an experimental AXIOM One browser/PWA shell under
[`apps/axiom-one/`](../../apps/axiom-one/). It lets a developer or evaluator
connect a browser to the local development node, see current node status,
review and exercise five explicitly bounded actions, understand stable denials
and uncertain outcomes, distinguish approval states, create and tombstone one
private note at a time, record a fixed directional provenance link, create a
selective local export, inspect a
plain-language event timeline, and retain access to the exact raw Gateway
responses without using the CLI for those interactions.

The preview is executable evidence that the human-product layer can remain
outside the trusted `mesh/` kernel and consume only the versioned
[`axiom-gateway-client-contract.v1`](GATEWAY-CLIENT-CONTRACT.md). It is not a
claim that AXIOM One is supported, production-promoted, safe for remote
exposure, suitable for real sensitive data, or complete. `UX-002` remains in
progress because the full onboarding, lifecycle, Share, Circles, session,
device, accessibility, usability, packaging, update, and support gates have
not been satisfied. `UX-003` is also in progress: a bounded explanation
contract now exists, but authoritative policy-bound pre-execution plans,
consequential approval actions, and human comprehension evidence do not.
`UX-004` is in progress: the Vault exposes one governed owner-scoped note,
three fixed directional provenance relationships, tombstone, and
selective-export path. Arbitrary relationships, direct edge deletion, hard
deletion, restore, bulk ingestion, export deletion, and sharing remain
unavailable.

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

Open the printed preview URL. Use the **First run checklist** in the Connect
panel, paste the development token into **Local API token**, and select
**Connect**. Keep both terminal processes running. Stop the preview and node
with `Ctrl+C` in their respective terminals. Closing or reloading the page
clears the in-memory browser session and requires the token again.

When connected, **Lock session** immediately clears the in-memory token and
returns the shell to its disconnected state. The shell also applies an
in-memory idle timeout and locks when the page becomes hidden so authority is
not left open in an unattended tab.

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
| Ask | Reviews one `system.echo` request before sending, exposes effect/provider/destination/information/retention/timeout/cancellation/reversibility, then presents completion or a stable fail-closed outcome | `intents.submit` | Transparent deterministic test; review is not a kernel plan or grant; same-key recovery only when outcome is uncertain |
| Approvals | Explains active, expired, consumed, and unknown approval records visible to the principal | `approvals.list` | Read-only; cannot grant, widen, renew, revoke, or self-approve authority |
| Vault | Lists active owner-scoped memory objects and edges, creates one private note at a time, records one of three fixed directional provenance links, reviews an explicit tombstone, creates a single-object selective local export, and reveals its record or bundle only on a separate user action | `memory.list`, `intents.submit`, `exports.get`, `export_bundles.get` | Bounded lifecycle only; no arbitrary relation, direct edge deletion, hard delete, restore, bulk ingestion, sharing, browser persistence, or automatic bundle retrieval |
| Receipts | Explains up to 50 visible integrity-linked events using an exact 37-kind vocabulary | `events.list` | Raw payload remains visible; mapped integrity evidence is not external truth |
| Share | Displays explicit unavailable Selective Sharing and Circles states | none | Sends nothing; sharing and Circles remain disabled |
| Explore | Reads selected raw status, registry, operations, node, capsule, import, backup, and audit data | eight contract-listed read routes | Scope denials remain visible; raw data is not reinterpreted as success |

The policy lists exactly 14 client route identifiers. The checker requires
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

Before any network request, **Review request** creates a human projection from
the exact `system.echo` entry in
[`human-contract.json`](../../apps/axiom-one/human-contract.json). The review
names the effect, provider boundary, local destination, information scope,
purpose, external-transfer state, cost, retention, browser timeout,
cancellation behavior, reversibility, confirmation requirement, and
independent-approval requirement. **Change request** closes the review and
sends nothing. **Send reviewed request** submits exactly the frozen request
shown in the raw request details.

This projection is deliberately described as a browser explanation, not an
authoritative kernel plan. The current public intent API evaluates and executes
one request atomically; it does not expose a separately bound preview/execute
protocol. The bounded `memory.tombstone` form therefore includes the exact
kernel confirmation only after an explicit human review, but it does not claim
an independently granted approval or a reusable generic consequential-action
protocol. Broader consequential actions must not be enabled until a
policy-bound plan can be reviewed before execution and the eventual grant is
demonstrably bound to that exact plan, policy, data scope, destination,
provider, constraints, and approval state.

## Human explanation and uncertainty contract

The machine-readable `axiom-one-human-contract.v1` and zero-dependency
[`presentation.mjs`](../../apps/axiom-one/presentation.mjs) module are public
shell assets. They contain no token, user record, remote origin, runtime policy
override, or executable authority. The release checker independently verifies
their exact action, error, event, approval, and non-claim inventories.

The current action inventory contains exactly `system.echo`, `memory.put`,
`memory.link`, `memory.tombstone`, and `export.create`. The echo is labelled a
`non-consequential-local-test`; the lifecycle actions are labelled a durable
local memory write, durable local provenance write, durable local tombstone, or
local selective-export write. All five declare no external provider or egress.
`memory.tombstone` requires
the exact `confirm:memory.tombstone` value; none declares an independent
approval under the current kernel policy. The browser cannot use the contract
to explain or submit another action. Adding an action requires an explicit
contract, checker, tests, documentation, and the applicable human and security
gates; a generic or unknown action fails closed.

## Governed memory lifecycle

The Vault implements one deliberately narrow owner-scoped path:

- **Create private note** submits `memory.put` with a human-supplied title and
  note, the fixed `note` kind, and the fixed `axiom-one-local-preview` source. The
  browser does not supply or override the owner identity; Gateway authentication
  and Grid authorization establish it.
- **List** reads active objects visible to the authenticated principal. It does
  not reveal another principal's object merely because an owner query is
  supplied.
- **Record provenance** submits `memory.link` between two different active
  owner-scoped objects. The browser offers only `derived-from`, `supports`, and
  `corrects`, freezes the exact direction and fixed source marker for review,
  and accepts no arbitrary relationship or metadata. `corrects` keeps both
  records independently active and visible; it does not overwrite or hide the
  target. The preview cannot directly delete an edge. Tombstoning either linked
  object removes the edge from active results while append-only evidence
  remains.
- **Review removal** freezes one exact `memory.tombstone` request with a fixed
  reason and `confirm:memory.tombstone`. A tombstone removes the object from the
  active list; it is not a claim of physical erasure, secure deletion, or
  restoration support.
- **Review selective export** freezes one exact `export.create` request for the
  selected object and `memory` type. The kernel constructs the authenticated
  export record, bundle, identity, and evidence. It does not transfer the
  bundle to an external recipient or background service.
- **Inspect export record** reads owner-scoped export metadata. **Reveal bundle
  in this page** is a separate explicit action that reads the owner-scoped
  bundle only into the current page and raw-details view. There is no automatic
  reveal, download button, browser database, or persistent response cache.

Real-stack tests prove the create, list, fixed provenance link, selective
export, record inspection, bundle inspection, and tombstone path through the
preview proxy, Gateway, Hypervisor, Sandbox, and Grid. They prove a correction
does not replace its target and that tombstoning an endpoint removes the edge
from active results. A second authenticated principal is denied the owner's
export record and sees no owner memory when it attempts an owner query; it also
cannot link or tombstone the owner's objects. This is bounded evidence, not a
claim that browser lifecycle or export controls are production complete.

Every one of the 20 stable Gateway client error codes has one fixed outcome
class and operator next step:

| Outcome class | Representative codes | Browser claim and action |
|---|---|---|
| Session | `authentication_required`, `invalid_token` | No authenticated execution claim; reconnect with a current local token |
| Denied or blocked | `forbidden`, `policy_denied`, `approval_mismatch`, `approval_unavailable`, `rate_limited` | No success; respect policy, approval, and rate boundaries |
| Needs explicit authority | `confirmation_required`, `independent_approval_required` | No execution; show the exact required confirmation or request digest where supplied; never auto-confirm or self-approve |
| Unavailable | `not_found`, `capability_unavailable` | Missing route, record, provider, or adapter is not simulated |
| Invalid or conflicting | `body_too_large`, `validation_error`, `invalid_client_request`, `idempotency_conflict` | Request was not accepted as reviewed; do not reuse a key for changed content |
| Uncertain | `dependency_unavailable`, `request_cancelled`, `request_timeout`, `response_too_large`, `invalid_gateway_response` | Do not claim completion or denial when the browser cannot prove either |

For a dependency loss, cancellation, timeout, or invalid contract response, the
node may have accepted or completed the request before the browser lost its
authoritative result. The UI retains the exact request body and idempotency key
in page memory and offers **Retry same request safely** only where the human
contract permits it. That retry sends the unchanged request with the same key,
allowing the Gateway to return the existing result instead of creating a
duplicate intent. The UI does not offer a changed request under the same key.
An oversized response remains uncertain but is not automatically retried,
because repeating it would not resolve the display boundary.

The contract maps all 37 event kinds currently accepted by the Grid state
transition layer. These include intent acceptance/completion/denial/failure;
approval grant/consumption; consent grant/revocation; capsule
registration/revocation; memory put/link/tombstone; governance lifecycle;
node registration/renewal/quarantine/scheduling; import/export; backup;
accounting; storage offers; and applied causal-sync bundles. A future or
unknown event is labelled **Unmapped evidence event**, keeps an uncertain tone,
and exposes its exact kind and raw record without inventing a meaning.

Approval explanations use only record fields returned by the owner-scoped
Gateway route. An `active` approval becomes locally `expired` when its exact ISO
expiry is past; a `consumed` record shows the bound intent where available; an
unknown status is never presented as active. The explanation repeats that the
page is read-only and cannot grant, widen, renew, revoke, or self-approve the
record. This is visibility into authority, not authority creation.

Every explanation is rendered with `textContent`, fixed DOM construction, and
an adjacent raw `<details>` view. Unknown Gateway codes retain the client's
generic failure behavior and never expose an untrusted message as a new
plain-language claim. The presentation model excludes event payload contents;
the payload appears only in the explicit raw evidence view. No private
chain-of-thought, synthetic reason, or inferred external truth is generated.

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
accidental non-loopback use. API requests must include an `Origin` header that matches the preview origin,
and Fetch Metadata must be `same-origin` or `none` when present. The server
returns no permissive CORS header. Cross-site form, fetch, frame, image, and
script paths therefore gain no token and no authorized API response.

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
account library. The server also sends `Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Embedder-Policy: require-corp`,
`Cross-Origin-Resource-Policy: same-origin`, `Origin-Agent-Cluster: ?1`,
`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `X-Permitted-Cross-Domain-Policies: none`, and a
deny-all Permissions Policy for camera, display capture, geolocation,
microphone, payment, and USB.

The manifest describes **AXIOM One Local Preview**, uses the root scope, and
contains a repository-native SVG icon. Installation as a PWA changes only the
browser presentation of this experimental source; it does not make the preview
supported, production-promoted, remotely safe, or able to operate without a
live local node.

## Accessibility and responsive foundation

The current shell provides a semantic header, navigation, main region, footer,
status announcements, explicit labels, a skip link, keyboard-native controls,
visible focus, responsive single-column layouts, touch-size mobile buttons,
high-contrast dark and light themes, an explicit `prefers-contrast` path, and
a reduced-motion media query. Browser inspection has verified the render at a
standard desktop size and at a 375-pixel phone viewport without document-level
horizontal overflow. Planned sections use the word
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
API exclusion, reduced motion, manifest identity, exact human contract
identity, all 20 stable outcome mappings, all 37 current event mappings, the
five-action/no-generic-authority boundary, governed lifecycle policy, and
secret-free asset digests. The normal
source gate also runs this checker and the focused server and human
presentation tests.

The test suite proves:

- exact policy status and seven-surface/fourteen-route inventory;
- exact five-action human contract and all stable Gateway error/current event
  mappings;
- frozen review bodies for private-note creation, three fixed directional
  provenance links, exact-confirmation tombstone, and single-object selective
  local export;
- browser refusal of self-links and policy refusal of arbitrary relationship
  expansion or correction-as-replacement;
- fail-closed completed-result evidence validation and unknown-code behavior;
- visible confirmation and independently bound approval requirements without
  automatic confirmation or self-approval;
- active, expired, consumed, and unknown approval explanations;
- same-key recovery for dependency loss, cancellation, timeout, and malformed
  response uncertainty;
- mapped receipts that exclude raw payload contents from their human claim and
  keep unknown events explicitly unmapped;
- rejection of a public bind or non-loopback Gateway origin;
- rejection of a weakened storage policy;
- required CSP, framing, opener, and content-type headers;
- secret-free health output;
- exact authenticated status and intent forwarding;
- a real status read, bounded echo intent, private-note create/list, provenance
  link, tombstone, selective export, export-record inspection, and explicit
  bundle inspection through the preview proxy, Gateway, Hypervisor, Sandbox,
  and Grid;
- correction-without-replacement and active-edge removal when a linked endpoint
  is tombstoned;
- cross-principal non-disclosure of owner memory and export records, plus denial
  of outsider link and tombstone requests;
- no cookie forwarding;
- cross-origin rejection before upstream I/O;
- rejection of unlisted `/v1/` routes before upstream I/O.

Release verification includes the preview policy and asset digests, and the
current-build source input digest includes `apps/`. This binds what was tested;
it does not promote the preview.

Rollback of the shell is source rollback. Stop `npm run axiom-one`, remove any
installed PWA entry and its public shell cache through the browser, and return
to the prior verified commit. The preview has no browser data migration or
persistent user-data store, but lifecycle actions write durable kernel/Grid
records: source rollback or clearing browser data does not erase memory,
tombstones, exports, bundles, or evidence already committed. Kernel/Grid
backup, restore, import, and recovery procedures remain separate and must not
be replaced by browser cleanup.

Expected visible failures include invalid or retired token, missing scope,
Gateway unavailable, request cancelled, timeout, response too large, malformed
Gateway response, and explicit policy denial. The UI keeps the structured code
and trace identifier visible where available. It does not replace failure with
cached API data, a fabricated result, or a generic success state.

An explicit Gateway denial is different from an uncertain client outcome. A
denial is displayed as a stopped request. Cancellation, timeout, dependency
loss, or an invalid response is displayed as **Outcome not confirmed** because
the browser cannot prove whether the node committed the intent. Operators must
use the offered same-key recovery or an exact bounded inspection path; they
must not submit a different key merely to make the warning disappear.

## Remaining gates and non-claims

This increment does not complete or claim:

- non-technical installation or automatic local-node discovery;
- a supported AXIOM One product;
- a completed browser/session/device threat model or independent review;
- secure persistent authentication, device enrolment, idle expiry, or device
  revocation;
- an authoritative policy-bound pre-execution kernel plan/execute protocol;
- a generic consequential-action protocol, independently granted approval,
  consent administration, or authority revocation controls;
- completed human comprehension/usability evidence for the experimental
  explanation mappings;
- arbitrary provenance relationships or metadata, direct edge deletion, bulk
  memory ingestion, hard deletion, restore, export deletion, automatic bundle
  retrieval, or a safe download workflow;
- selective sharing, remote recipients, or AXIOM Circles;
- an external or local AI provider;
- useful AI workflows or model-output truth;
- a complete accessibility or human-usability gate;
- signed preview packaging, update, rollback automation, or support service;
- production credentials, live deployment, federation, consensus, or
  production promotion.

The next work is to complete the remaining governed-memory gates, including
broader provenance and edge-deletion policy, deletion and restore policy,
export retention and deletion, and a reviewed download boundary; design a
separately bound consequential plan/execute and approval protocol; run keyboard, screen-reader,
and comprehension fixtures; and design the separate browser session/device
boundary. Share, Circles, and AI controls must remain visibly unavailable until
their own contracts and negative evidence exist.
