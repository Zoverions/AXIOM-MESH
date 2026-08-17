# AXIOM-MESH Remote Social Threat Review Companion

**Build:** `0.12.0-dev.3`

**Status:** required companion to `CURRENT-BUILD-THREAT-MODEL.md`; not an independent assessment

**Updated:** 2026-08-17

This document is a focused review input for the remote-social foundations merged through S3A-F and S3G1-G7B, including the accepted S3G5B owner-scoped read-only review path, accepted G7A dual intent/materialization binding, accepted G7B v1/v2 admission replay logic, and the G7B2a activation of remote-social schemas/replay as local no-egress Grid storage. The canonical current-build threat model remains authoritative for the accepted runtime and explicitly incorporates this companion for remote-social review scope.

## Current activation boundary

The accepted Grid service imports and instantiates `AcceptedSocialGridStore` from `mesh/src/grid/accepted-social-store.mjs`. That composition layers the previously proven local authored social store with encrypted S3C staging, S3D/G7B admission and observation replay, S3E private Following storage, S3G2 retention/quota storage, and S3G6 owner-private abuse-control/quarantine storage. This is **accepted local storage/replay**, not accepted remote-social effect authority.

`AcceptedSocialGridStore` remains no-egress and excludes S3F transport methods and the `remote_social_transport_jobs` schema. The older `RemoteSocialRuntimeCandidateGridStore` remains a disabled provenance/laboratory descriptor and is not selected by the accepted server. There is no runtime switch, environment toggle, or fallback that can select the transport-capable laboratory.

The accepted Grid still exposes exactly one remote-social inspection path, `GET /internal/v1/social/remote-review/:owner`, which constructs `createRemoteSocialReviewReadAdapter(store)` over the already-open accepted store and passes it to the merged G5A `buildRemoteSocialReviewProjection()` minimizer. The read adapter itself creates or migrates no remote-social tables and exposes no staging, admission, follow/unfollow, retention-cleanup, abuse-control mutation, event-write, transport, or arbitrary mutation method. On the accepted store the remote tables exist as local storage, but absence of owner rows still yields a valid bounded empty review.

Gateway exposes exactly one authenticated remote-social inspection route, `GET /v1/social/remote-review`. Its owner is derived exclusively from `principal.id` and forwarded over the exact Gateway-to-Grid read-only service-network edge. The route does not grant a caller an arbitrary owner selector and must not become a staging, admission, Following, cleanup, mute/block/report/quarantine, transport, recommendation, or authority path. The returned shape is the G5A `axiom-remote-social-review.v1` projection rather than a second route-specific disclosure model.

There is **no accepted mute, block, report, quarantine, follow, cleanup, staging, or admission mutation route** on this build. `social.remote.admit` remains absent from active policy; no Hypervisor-to-Grid admission finalizer exists; and the accepted Sandbox does not expose a remote-admission effect. Storage/replay activation therefore does not create effect authority.

S3F transport remains deliberately separate because the supported Grid boundary remains deny-egress. The repository contains a pinned/bounded transport laboratory, but no accepted source-package endpoint and no deployed host-side social relay. A future relay must be reviewed and promoted independently and must consult any applicable local source/exporter quarantine before network access without giving Grid egress authority.

There is no current claim of live federation, remote discovery, public remote Following, a public follow graph, recommendation ranking, messaging, public profile hosting, relay/index service, shared/global blocklists, automated adjudication, or production moderation service. Read-only inspection of already-present owner-scoped remote review state and accepted local storage/replay are not claims that remote content can currently arrive through an accepted live social network.

## Trust statements that must not be collapsed

### Exporter Grid attestation

An S3A `grid-export` signature proves that the trusted exporter Grid key signed the exact package statement. It does not prove legal or biological identity, content truth, actor-key ownership, or that a represented human personally authored the content.

The exporter key is a provenance/trust input, not Mesh authority. Compromise of the exporter key can create apparently valid exporter attestations and therefore requires revocation/rotation and local trust-policy response; it cannot by itself authorize local admission.

### Transport endpoint attestation

An S3F transport envelope proves that the independently pinned transport key signed one nonce-bound response for an exact HTTPS origin, package digest, canonical package-byte digest, exporter Grid/key IDs, and bounded response timestamp.

Transport authentication does not replace S3A package verification and does not prove publisher identity, content truth, delivery, admission, federation, or authority. Transport and exporter keys must remain distinct trust roots.

### Local admission authority

S3D admission proves that the local Grid accepted an exact staged package under a recorded accepted intent and matching independent one-use approval. G7A/B make the authority statement more explicit by preserving two distinct commitments: `intent_request_digest` for the ordinary human intent/approval identity and the S3D resolved `request_digest` for the exact staged package/materialization identity. Those digests must never be silently equated.

G7B v2 replay stores the public-safe intent binding, re-derives both commitments during replay, requires the canonical `type: human` owner principal, and preserves v1 admission history in global event order. Approval consumption and admission materialization remain transactional in the store implementation. Admission produces a locally retained remote observation, not local authorship and not proof that the remote content is true.

On this G7B2a build, the admission **storage/replay implementation is accepted but its effect path is not**. No active policy action or internal finalizer can invoke it from the supported request path. The G5B read-only review route can inspect a minimized representation of an already-existing admission; it cannot create, approve, consume authority for, replay, or alter one.

### Private Following

S3E Following is a local owner preference over already admitted remote persona observations. Trust scope is limited to `exporter-attestation-only`. Content-truth, legal-identity, and actor-authorship claims remain false. The projection performs no live fetch, recommendation, ranking, or public graph publication.

The accepted Grid initializes Following storage/replay, but there is no accepted follow/unfollow mutation route. G5B may expose a minimized summary of the authenticated owner's own already-present private follow records. That disclosure does not make Following a public graph and does not provide follow authority.

### Owner-private abuse controls

S3G6 owner-private abuse-control **storage/replay is part of the accepted local Grid composition**, but its effect APIs remain closed. Mute and block are owner preferences over already admitted remote observations. Mute suppresses matching items from that owner's Following projection without deleting follow or observation evidence. Block suppresses matching Following content and prevents a new follow while active, but it does not erase prior follow/observation history or impose a rule on another owner.

G6 reports are append-only owner assertions. A report remains `adjudicated: false` and has no automatic visibility or trust effect. A report proves only that the owner recorded an assertion; it does not prove abuse, falsity, legal status, identity, authorship, or entitlement to punish another actor.

Exporter quarantine is owner-local fail-closed handling, not a shared denylist, reputation score, or identity statement. Source quarantine accepts only a normalized exact HTTPS origin. Grid stores the deterministic origin digest plus protected local metadata, but G6 source quarantine must not perform network I/O: no DNS, HTTP, credential use, fetch, redirect processing, or transport operation is authorized by the quarantine record.

All G6 controls remain owner-local safety state and carry `network_effect: none`, `authority_effect: none`, and `recommendation_effect: none`; report/quarantine semantics also carry `adjudication_effect: none`. Local mute/block/report/quarantine records remain owner-private safety state. They never become Mesh authorization, admission authority, content truth, identity proof, reputation/ranking input, or global moderation merely because their schemas and replay are now accepted local storage.

### Accepted no-egress social storage

`mesh/src/grid/accepted-social-store.mjs` is the explicit accepted-storage composition boundary. It declares local authored social storage plus remote staging/admission/Following/retention/abuse storage as active, while declaring `public_mutation_routes: false`, `internal_admission_finalizer: false`, `network_egress: false`, `transport_included: false`, `automatic_admission: false`, `automatic_follow: false`, and `automatic_federation: false`.

The accepted server selects `AcceptedSocialGridStore` directly and contains no `AXIOM_REMOTE_SOCIAL` runtime selector. Base `SocialGridStore` remains remote-schema-free as a lower-layer invariant. The accepted composition adds remote schema/replay intentionally; the S3F transport schema/methods remain absent.

### Owner-scoped review projection

G5A/G5B review output is intentionally weaker than the internal durable records from which it is derived. The projection independently re-checks owner binding, strips package bodies, trusted-exporter PEM, raw signatures/attestations, protected actor/controller linkage, transport state, ranking/reputation state, and unneeded internal authority detail, bounds every collection, caps the aggregate canonical response, and declares `mutation_effect`, `network_effect`, `recommendation_effect`, and `authority_effect` as `none`.

A valid review projection is evidence about the local owner's review state. It is not content truth, legal identity, actor authorship, admission authority, transport success, recommendation output, federation evidence, or moderation adjudication.

### Future social relay

A future egress-capable social relay must remain outside Grid. It should have only the authority needed to fetch an exact package from an exact configured HTTPS origin and hand a verified package plus transport evidence into a staging-only authenticated handoff into Grid. It must not possess an admission approval, follow authority, general Grid credential, or a route that can convert transport success into admission. Before any fetch, a future relay must apply the relevant owner/source quarantine policy through a separately reviewed, bounded handoff rather than by granting Grid network access.

## Assets

Remote-social review adds these assets and sensitive metadata to the current-build inventory:

- public-safe persona, publication, supersession, and retraction projections;
- S3A package signatures, exporter Grid/key IDs, package digests, and import-plan digests;
- trusted exporter public keys and local trust labels;
- S3C encrypted staged package/import-plan/exporter records;
- S3D/G7B admission, dual intent/materialization commitments, approval, observation, and admission-to-observation provenance;
- S3E private follow/unfollow state and encrypted trust labels;
- S3F transport pins, exact origins, job/retry state, request-nonce digests, and receipts in laboratory code only;
- S3G2 retention policies, quota state, cleanup events, and retention receipts;
- S3G6 mute/block preferences, append-only reports, exporter/source quarantine state, deterministic source-origin digests, and protected reason/note/source metadata;
- the accepted-storage descriptor and migration/replay state;
- the G5A minimized owner-scoped review projection and its disclosure/response-size boundary;
- the G5B exact Gateway-to-Grid read route and authenticated owner binding; and
- future relay credentials, DNS/TLS state, queues, logs, and handoff receipts if that relay is later implemented.

Remote observations may be structurally public but still privacy-sensitive in aggregate. Following choices, trust labels, reports, reasons, notes, and quarantine decisions are private local metadata even when the referenced persona/source is public. G5B therefore treats the review response itself as authenticated owner data rather than as a public social corpus.

## Threat actors and failure modes

Reviewers must consider at least:

- a malicious exporter Grid that signs harmful, misleading, spammy, or deceptive but schema-valid public content;
- theft or compromise of a trusted exporter signing key;
- a malicious or compromised transport endpoint using a valid transport key;
- transport/exporter key substitution or reuse of a retired key;
- a compromised future relay attempting to become a confused deputy for admission or Following;
- a local authenticated principal attempting to stage, admit, inspect, clean up, follow, mute, block, report, or quarantine another owner's records;
- a caller attempting to smuggle or override an owner through public query/body/path input rather than authenticated principal binding;
- a future store regression returning foreign-owner rows to the read adapter/projection;
- a future internal route accidentally exposing a method merely because accepted storage now implements it;
- an operator approving a visually similar but digest-different stage or trusting an incorrect exporter;
- an attacker replaying a stale transport envelope or changing origin, nonce, package bytes, exporter identity, or timestamps;
- storage-amplification attacks using many valid packages, large public content, repeated unique observations, retry pressure, or preference/report/quarantine pressure;
- malicious content intended to exploit future renderers, link previewers, media processors, moderation tools, or human reviewers;
- trust labels, report state, quarantine state, or provenance UI being interpreted as content truth, legal identity, personal authorship, adjudication, or global moderation;
- private follow/trust/report/quarantine correlation with remote public identities;
- attempts to bypass an owner-local block or exporter/source quarantine during Following reconstruction or future relay fetch;
- malformed or over-broad source origins, including HTTP, userinfo, path, query, fragment, or ambiguous-origin inputs intended to expand quarantine/fetch scope;
- retention actions that erase replay dependencies, evidence, or an operator's ability to explain an admission;
- source-read credential leakage, overly broad relay credentials, DNS/TLS interception, redirect abuse, or permissive origin matching; and
- future public source/profile/federation services being used for spam, scraping, harassment, impersonation, resource exhaustion, or Sybil amplification.

## Required security properties by layer

### S3A/B package and review plan

Review should verify exact schemas and rejection of unknown/private/protected fields; content addressing for public objects and package statement; deterministic complete supersession/retraction dependencies; duplicate identity rejection; explicit trusted exporter public key supplied by the verifier; Ed25519 exporter-key binding and key substitution rejection; exporter attestation claims remain `grid-export` only; review plan is exact-package/exact-exporter/exact-recipient bound, bounded in lifetime, and requires operator approval; and package verification alone performs no apply, network, or authority effect.

### S3C staging

Review should verify the accepted storage composition creates the staging schema locally; rows are owner-scoped and stage identity deterministic; package/import-plan/trusted-exporter values remain encrypted at rest and participate in data-key rotation; staging re-verifies the package immediately before persistence when an authorized staging path is later invoked; staging never materializes local authored personas/publications; and schema existence does not imply staging authority.

### S3D/G7B admission

Review should verify v1 evidence remains replayable; v2 runtime admission keeps `intent_request_digest` distinct from the resolved S3D `request_digest`; the persisted public-safe intent binding re-derives the ordinary intent digest; only the exact canonical human owner principal is eligible at G7; approval consumption is atomic with the admission event; restart replay re-verifies the original stage, consumed authority evidence, dual digest bindings, and admitted object set; admitted observations remain separately classified from local authored state; and exporter/transport/trust labels never substitute for local admission authority.

Schema/replay activation alone is not admission authorization. Until G7B2b/G7C are separately accepted, no supported request path may call `admitRemoteSocialStageWithIntent()`.

### S3E Following

Review should verify only admitted persona observations can be followed; follow/trust records are owner-scoped/private; trust scope cannot expand beyond exporter-attestation-only; chronological projection reads admitted local observations only; superseded/retracted observations are treated consistently; no live transport, discovery, engagement ranking, or recommendation effect occurs; block/mute/exporter-quarantine rules cannot be bypassed by Following reconstruction; and schema/method presence is not follow authority.

### S3F transport laboratory

Review should verify exact HTTPS origin, redirect rejection, bounded timeout/response bytes; per-attempt source-read credential is not persisted; transport and exporter keys are independent; request nonce and response freshness are bound; canonical package-byte/package digests are bound; package is independently reverified after transport verification; lease/idempotency/retry/backoff are bounded; transport can create/confirm S3C review staging only in laboratory composition; and no S3F method or transport table appears in `AcceptedSocialGridStore`.

### S3G1-G3 hardening

Review should verify every encrypted remote-social column is covered by generic data-key rotation when its table exists; remote rotation fails closed on known schema drift; retention quotas are owner-scoped/preflighted; expired unadmitted cleanup is explicit/evidence-backed; admitted stage payloads remain replay dependencies under the current replay design; base `SocialGridStore` remains remote-schema-free; accepted `AcceptedSocialGridStore` intentionally initializes the reviewed remote schemas; and the accepted Grid still excludes the disabled candidate and transport-capable store.

### S3G5A/B read-only review exposure

Review should verify:

- `mesh/src/grid/remote-social-review-projection.mjs` is the single disclosure/minimization implementation;
- `mesh/src/grid/remote-social-review-read-adapter.mjs` creates no schema and exposes only the projector's required read methods;
- an owner with no retained remote rows receives an empty valid projection without side effects;
- every SQL read remains owner-scoped and G5A independently rejects a foreign-owner row even if a lower layer regresses;
- exporter PEM, package bodies/signatures, protected controller linkage, transport jobs, ranking/reputation state, and unnecessary authority detail do not cross the route;
- `GET /v1/social/remote-review` is authenticated and derives owner exclusively from `principal.id`;
- no public owner override is accepted or forwarded;
- only Gateway may call `GET /internal/v1/social/remote-review/:owner` through the exact service-network allowlist;
- Hypervisor, Sandbox, POST, wildcard, and unlisted remote-social edges remain denied;
- the accepted Grid instantiates `AcceptedSocialGridStore`, not the disabled candidate or transport store;
- the route exposes no staging, admission, follow/unfollow, cleanup, abuse mutation, transport, recommendation, or authority effect; and
- existing `/v1/social` local-authored snapshot semantics remain separate and unchanged.

### S3G6 owner-private abuse controls

Review should inspect `mesh/src/grid/remote-social-abuse-migrations.mjs`, `mesh/src/grid/remote-social-abuse-store.mjs`, `mesh/src/grid/remote-social-protection.mjs`, `mesh/src/grid/remote-social-runtime-store.mjs`, and `mesh/src/grid/accepted-social-store.mjs` and verify:

- G6 schema/replay is part of accepted local storage but there is no accepted G6 mutation route;
- mute/unmute is owner-local and changes only the local Following projection, preserving follow/observation evidence;
- block/unblock is owner-local, suppresses matching Following, and prevents a new follow while active without deleting prior evidence;
- reports are append-only owner assertions, bounded/idempotent as defined by the store, remain `adjudicated: false`, and do not automatically alter visibility or trust;
- exporter quarantine/release is owner-local and cannot become a global denylist, reputation score, actor-identity fact, or Mesh policy grant;
- source quarantine accepts only a normalized exact HTTPS origin and rejects HTTP, userinfo, path, query, fragment, malformed, or ambiguous origin inputs;
- G6 source quarantine must not perform network I/O or create a transport method/table;
- all relevant reason/note/source values are protected at rest and included in remote-social data-key rotation under their exact storage contexts;
- restart reconstruction derives G6 materialized state from signed Grid evidence;
- cross-owner/tampered abuse-control events fail closed before durable append;
- `AcceptedSocialGridStore` remains no-egress and transport-free; and
- accepted `mesh/src/grid/server.mjs` imports/instantiates neither `RemoteSocialRuntimeCandidateGridStore`, `RemoteSocialTransportGridStore`, nor `RemoteSocialAbuseGridStore` directly.

| Threat | Required G6 boundary | Residual risk / later gate |
| --- | --- | --- |
| Remote-social report or quarantine becomes false authority | Reports remain owner assertions with `adjudicated: false`; mute/block/quarantine remain local safety choices with explicit no-authority/no-recommendation semantics | Future UI, shared moderation, appeals, legal process, reputation, or automated classification need separate review |
| Preference/report/quarantine amplification | Owner-scoped bounded records and existing retention/storage ceilings fail closed | Global capacity/rate controls remain required before untrusted-network write exposure |
| Source quarantine is used as a hidden egress primitive | Exact HTTPS-origin normalization, deterministic digest, protected metadata, and no network/transport method in accepted Grid | A future relay needs separate least-privilege quarantine preflight and independently reviewed egress |

The accepted local storage/replay layer must preserve `network_effect: none`, `authority_effect: none`, `recommendation_effect: none`, and where applicable `adjudication_effect: none`. Local mute/block/report/quarantine records remain owner-private safety state and must not silently rewrite the underlying admitted remote observations.

## Abuse and privacy requirements before further runtime exposure

G6 closes the local-model/storage portion of the block/mute/report/quarantine gap, but accepted storage plus the current read-only inspection route is still not sufficient for untrusted-network social exchange or public moderation. Before Following, admission, or abuse-control mutation is exposed through an accepted public/user effect route, review must still cover:

- exact owner-derived API bindings and anti-confused-deputy semantics for each mutation;
- policy-required confirmation/independent approval where consequence warrants it;
- appeal/correction semantics for any report state that becomes shared beyond the owner;
- renderer/content safety for text, links, and any future media path;
- source/exporter quarantine enforcement by any future relay without giving Grid egress;
- public rate, storage, object-count, and payload-byte controls;
- privacy minimization and consistent not-found behavior where existence is sensitive;
- compromised exporter/transport/relay key response; and
- independent security review before activation.

These controls are separate from recommendation ranking. A reputation, ranking, moderation, quarantine, report, or visibility score must never become Grid authorization, actor identity proof, consent, or legal-status proof.

## Required negative paths

Review must preserve explicit tests that reject or safely contain:

- package/exporter/transport-key substitution and stale/replayed transport envelopes;
- admission without the exact accepted intent and matching independent one-use approval;
- cross-owner stage/admission/follow/retention/review access;
- public owner-query/body override and a lower-layer foreign-owner row;
- widening the G5B GET edge into POST, wildcard, Hypervisor/Sandbox, or effect authority;
- treating accepted schema/method presence as staging/admission/follow/abuse authority;
- cross-owner mute/block/report/quarantine attempts;
- following a blocked/quarantined source or bypassing exporter quarantine in Following projection;
- a report automatically changing visibility/trust or becoming adjudicated without a separately reviewed authority path;
- malformed/expanded source origins and any G6 code path attempting DNS/HTTP/fetch/credential/transport use;
- incomplete remote-social protected-column rotation or old-key access after successful rotation; and
- selection of the disabled candidate or transport-capable store through a runtime toggle.

## Future relay review boundary

If an egress-capable social relay is implemented later, it requires a separate threat-model update and review. At minimum the relay should use a distinct process/service identity; no Grid signing/data-protection key; no admission/follow approval authority; exact allowlisted HTTPS origins with strict DNS/TLS/redirect behavior; least-privilege per-source read credentials; bounded queues/response sizes/retries/concurrency; source/transport/exporter key lifecycle and revocation handling; local quarantine preflight; a staging-only authenticated handoff into Grid; receipts distinguishing fetch, verification, staging, admission and follow effects; and explicit failure behavior for uncertain fetch/delivery.

The relay cannot be described as deployed merely because S3F laboratory code exists, because G5B can read accepted remote-social state, or because the accepted store contains G6 quarantine methods/storage.

## Independent review scope

Any review that purports to cover remote-social activation must inspect the exact source revision of at least:

- `mesh/src/lib/social-exchange-package.mjs`
- `mesh/src/lib/social-transport-envelope.mjs`
- `mesh/src/lib/remote-social-admission-authority.mjs`
- `mesh/src/grid/remote-social-store.mjs`
- `mesh/src/grid/remote-social-admission-store.mjs`
- `mesh/src/grid/remote-social-following-store.mjs`
- `mesh/src/grid/remote-social-retention-store.mjs`
- `mesh/src/grid/remote-social-abuse-migrations.mjs`
- `mesh/src/grid/remote-social-abuse-store.mjs`
- `mesh/src/grid/remote-social-runtime-store.mjs`
- `mesh/src/grid/accepted-social-store.mjs`
- `mesh/src/grid/remote-social-transport-store.mjs`
- `mesh/src/grid/remote-social-protection.mjs`
- `mesh/src/grid/remote-social-runtime-candidate.mjs`
- `mesh/src/grid/remote-social-review-projection.mjs`
- `mesh/src/grid/remote-social-review-read-adapter.mjs`
- `mesh/test/remote-social-admission-authority.test.mjs`, `mesh/test/remote-social-runtime-store.test.mjs`, `mesh/test/accepted-social-store.test.mjs`, and the other remote-social migration/store/projection/route/protection/candidate tests;
- `mesh/src/grid/server.mjs` to confirm `AcceptedSocialGridStore` is selected, no runtime toggle exists, and only the exact read-only review route is exposed;
- `mesh/src/gateway/server.mjs` to confirm owner derives from authenticated principal and no owner override/effect route exists;
- `mesh/config/gateway-client-contract.json` and its exact contract verifier;
- `mesh/config/service-network-policy.json` and its exact route verifier; and
- AXIOM One policy/UX claims before any broader remote-social surface is represented as available.

## Non-claims

A Grid-signed export proves what that Grid signed. A transport envelope proves what the pinned transport endpoint signed for one nonce-bound request. A local admission proves what the local Grid accepted under the recorded local authority path. A private Following record proves a local preference. A G5A/G5B review response proves only the bounded local review representation returned for the authenticated owner. A mute/block record proves only the owner's local preference; a report proves only that the owner recorded an assertion; exporter/source quarantine proves only that the owner selected local fail-closed handling. None of those statements alone proves content truth, abuse, legal identity, biological identity, actor-key ownership, or personal authorship.

The current accepted runtime **does** instantiate encrypted remote-social storage/replay through `AcceptedSocialGridStore`, but it does not provide a live source-package endpoint, host-side social relay, accepted staging/admission/follow/abuse mutation route, or remote-social transport capability. It provides exactly one authenticated owner-scoped read-only remote-social review route with no mutation, network, recommendation, or authority effect. No live federation, public remote Following, recommendation system, messaging system, production moderation service, shared/global blocklist, relay/index, public follow graph, or public-profile hosting claim follows from accepted local storage/replay.