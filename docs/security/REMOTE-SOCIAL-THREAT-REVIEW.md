# AXIOM-MESH Remote Social Threat Review Companion

**Build:** `0.12.0-dev.3`

**Status:** required companion to `CURRENT-BUILD-THREAT-MODEL.md`; not an independent assessment

**Updated:** 2026-08-17

This document is a focused review input for the remote-social foundations merged through S3A-F and S3G1-G5A, plus the narrowly activated S3G5B owner-scoped read-only review path. The canonical current-build threat model remains authoritative and explicitly incorporates this companion for remote-social review scope.

## Current activation boundary

The accepted Grid service still imports and instantiates `SocialGridStore`. The disabled `RemoteSocialRuntimeCandidateGridStore` is not selected by the accepted server and has no network egress or S3F transport methods. It composes only Grid-side S3C staging, S3D admission, S3E private Following, and the S3G2 retention/quota lifecycle.

S3G5B does **not** activate that candidate. The accepted Grid adds one owner-scoped read-only inspection path, `GET /internal/v1/social/remote-review/:owner`, which constructs `createRemoteSocialReviewReadAdapter(store)` over the already-open `SocialGridStore` and passes it to the merged G5A `buildRemoteSocialReviewProjection()` minimizer. The read adapter creates or migrates no remote-social tables and exposes no staging, admission, follow/unfollow, retention-cleanup, event-write, transport, or arbitrary mutation method. If the remote tables are absent, the projection is a valid bounded empty review.

Gateway exposes exactly one authenticated remote-social inspection route, `GET /v1/social/remote-review`. Its owner is derived only from the authenticated `principal.id` and forwarded over the exact Gateway-to-Grid read-only service-network edge. The route does not grant a caller an arbitrary owner selector and must not become a staging, admission, Following, cleanup, transport, recommendation, or authority path. The returned shape is the G5A `axiom-remote-social-review.v1` projection rather than a second route-specific disclosure model.

S3F transport remains deliberately separate because the supported Grid boundary remains deny-egress. The repository contains a pinned/bounded transport laboratory, but no accepted source-package endpoint and no deployed host-side social relay. A future relay must be reviewed and promoted independently.

There is no current claim of live federation, remote discovery, public remote Following, a public follow graph, recommendation ranking, messaging, public profile hosting, relay/index service, or production moderation service. Read-only inspection of already-present owner-scoped remote review state is not a claim that remote content can currently arrive through an accepted live social network.

## Trust statements that must not be collapsed

### Exporter Grid attestation

An S3A `grid-export` signature proves that the trusted exporter Grid key signed the exact package statement. It does not prove legal or biological identity, content truth, actor-key ownership, or that a represented human personally authored the content.

The exporter key is a provenance/trust input, not Mesh authority. Compromise of the exporter key can create apparently valid exporter attestations and therefore requires revocation/rotation and local trust-policy response; it cannot by itself authorize local admission.

### Transport endpoint attestation

An S3F transport envelope proves that the independently pinned transport key signed one nonce-bound response for an exact HTTPS origin, package digest, canonical package-byte digest, exporter Grid/key IDs, and bounded response timestamp.

Transport authentication does not replace S3A package verification and does not prove publisher identity, content truth, delivery, admission, federation, or authority. Transport and exporter keys must remain distinct trust roots.

### Local admission authority

S3D admission proves that the local Grid accepted an exact staged package under a recorded accepted intent and matching independent one-use approval. Approval consumption and admission materialization are transactional. Admission produces a locally retained remote observation, not local authorship and not proof that the remote content is true.

The G5B read-only review route can inspect a minimized representation of an already-existing admission; it cannot create, approve, consume authority for, replay, or alter one.

### Private Following

S3E Following is a local owner preference over already admitted remote persona observations. Trust scope is limited to `exporter-attestation-only`. Content-truth, legal-identity, and actor-authorship claims remain false. The projection performs no live fetch, recommendation, ranking, or public graph publication.

G5B may expose a minimized summary of the authenticated owner's own already-present private follow records. That disclosure does not make Following a public graph and does not provide a follow/unfollow effect route.

### Owner-scoped review projection

G5A/G5B review output is intentionally weaker than the internal durable records from which it is derived. The projection independently re-checks owner binding, strips package bodies, trusted-exporter PEM, raw signatures/attestations, protected actor/controller linkage, transport state, ranking/reputation state, and unneeded internal authority detail, bounds every collection, caps the aggregate canonical response, and declares `mutation_effect`, `network_effect`, `recommendation_effect`, and `authority_effect` as `none`.

A valid review projection is evidence about the local owner's review state. It is not content truth, legal identity, actor authorship, admission authority, transport success, recommendation output, or federation evidence.

### Future social relay

A future egress-capable social relay must remain outside Grid. It should have only the authority needed to fetch an exact package from an exact configured HTTPS origin and hand a verified package plus transport evidence into a staging-only Grid endpoint. It must not possess an admission approval, follow authority, general Grid credential, or a route that can convert transport success into admission.

## Assets

Remote-social review adds these assets and sensitive metadata to the current-build inventory:

- public-safe persona, publication, supersession, and retraction projections;
- S3A package signatures, exporter Grid/key IDs, package digests, and import-plan digests;
- trusted exporter public keys and local trust labels;
- S3C encrypted staged package/import-plan/exporter records;
- S3D admission, intent, approval, observation, and admission-to-observation provenance;
- S3E private follow/unfollow state and encrypted trust labels;
- S3F transport pins, exact origins, job/retry state, request-nonce digests, and receipts;
- S3G2 retention policies, quota state, cleanup events, and retention receipts;
- the G5A minimized owner-scoped review projection and its disclosure/response-size boundary;
- the G5B exact Gateway-to-Grid read route and authenticated owner binding; and
- future relay credentials, DNS/TLS state, queues, logs, and handoff receipts if that relay is later implemented.

Remote observations may be structurally public but still privacy-sensitive in aggregate. Following choices and trust labels are private local metadata even when the followed persona is public. G5B therefore treats the review response itself as authenticated owner data rather than as a public social corpus.

## Threat actors and failure modes

Reviewers must consider at least:

- a malicious exporter Grid that signs harmful, misleading, spammy, or deceptive but schema-valid public content;
- theft or compromise of a trusted exporter signing key;
- a malicious or compromised transport endpoint using a valid transport key;
- transport/exporter key substitution or reuse of a retired key;
- a compromised future relay attempting to become a confused deputy for admission or Following;
- a local authenticated principal attempting to stage, admit, inspect, clean up, or follow another owner's records;
- a caller attempting to smuggle or override an owner through public query/body/path input rather than authenticated principal binding;
- a future store regression returning foreign-owner rows to the read adapter/projection;
- an operator approving a visually similar but digest-different stage or trusting an incorrect exporter;
- an attacker replaying a stale transport envelope or changing origin, nonce, package bytes, exporter identity, or timestamps;
- storage-amplification attacks using many valid packages, large public content, repeated unique observations, or retry pressure;
- malicious content intended to exploit future renderers, link previewers, media processors, moderation tools, or human reviewers;
- trust-label wording intended to be mistaken for verified identity, content truth, or personal authorship;
- correlation of private Following/trust state with remote public identities;
- retention actions that erase replay dependencies, evidence, or an operator's ability to explain an admission;
- source-read credential leakage, overly broad relay credentials, DNS/TLS interception, redirect abuse, or permissive origin matching; and
- future public source/profile/federation services being used for spam, scraping, harassment, impersonation, resource exhaustion, or Sybil amplification.

## Required security properties by layer

### S3A/B package and review plan

Review should verify:

- exact schemas and rejection of unknown/private/protected fields;
- content addressing for public objects and package statement;
- deterministic complete supersession/retraction dependencies;
- duplicate identity rejection;
- explicit trusted exporter public key supplied by the verifier;
- Ed25519 exporter-key binding and key substitution rejection;
- exporter attestation claims remain `grid-export` only;
- review plan is exact-package/exact-exporter/exact-recipient bound, bounded in lifetime, and requires operator approval; and
- package verification alone performs no apply, network, or authority effect.

### S3C staging

Review should verify:

- only an explicitly selected Grid-side remote store creates the staging schema;
- owner-scoped rows and deterministic stage identity;
- package/import-plan/trusted-exporter values remain encrypted at rest and participate in data-key rotation;
- staging re-verifies the package immediately before persistence;
- staging never materializes local authored personas/publications; and
- quotas and expiry do not silently delete or admit state.

### S3D admission

Review should verify:

- exact accepted intent for `social.remote.admit`;
- exact independent active approval for the same requester/action/request digest;
- approval is consumed atomically with the admission event;
- quota failure occurs before approval consumption;
- restart replay re-verifies the original stage and consumed authority evidence;
- admitted observations remain separately classified from local authored state; and
- an exporter/transport/trust label never substitutes for local admission authority.

### S3E Following

Review should verify:

- only admitted persona observations can be followed;
- owner-scoped private follow/trust records;
- trust scope cannot expand beyond exporter-attestation-only;
- chronological projection reads admitted local observations only;
- superseded/retracted observations are treated consistently;
- no live transport, discovery, engagement ranking, or recommendation effect occurs; and
- later block/mute/report/quarantine rules cannot be bypassed by Following reconstruction.

### S3F transport laboratory

Review should verify:

- exact HTTPS origin, redirect rejection, bounded timeout and bounded response bytes;
- per-attempt source-read credential is not persisted;
- independent transport and exporter keys;
- request nonce and response freshness binding;
- canonical package-byte digest and package digest binding;
- package is independently reverified after transport verification;
- durable lease, idempotency, bounded retry/backoff and terminal evidence failures;
- transport can create/confirm S3C review staging only; and
- no S3D/S3E methods are present in the network-capable class.

### S3G1-G3 hardening

Review should verify:

- every encrypted S3C/D/E/F column is covered by generic data-key rotation when its table exists;
- absent remote tables remain a zero-op and are not created by rotation;
- remote rotation fails closed on known schema drift;
- retention quotas are owner-scoped and preflighted before new durable materialization;
- expired unadmitted cleanup is explicit and evidence-backed;
- admitted stage payloads remain replay dependencies under the current replay design; and
- the Grid-side candidate composes S3C/D/E/retention only, reports `activation_state: disabled`, has no transport methods, and is not referenced by the accepted Grid server.

### S3G5A/B read-only review exposure

Review should verify:

- `mesh/src/grid/remote-social-review-projection.mjs` is the single disclosure/minimization implementation;
- `mesh/src/grid/remote-social-review-read-adapter.mjs` creates no schema and exposes only the projector's required read methods;
- absent remote tables yield an empty valid projection without side effects;
- every SQL read remains owner-scoped and G5A independently rejects a foreign-owner row even if a lower layer regresses;
- exporter PEM, package bodies/signatures, protected controller linkage, transport jobs, ranking/reputation state, and unnecessary authority detail do not cross the route;
- `GET /v1/social/remote-review` is authenticated and derives owner exclusively from `principal.id`;
- no public owner override is accepted or forwarded;
- only Gateway may call `GET /internal/v1/social/remote-review/:owner` through the exact service-network allowlist;
- Hypervisor, Sandbox, POST, wildcard, and unlisted remote-social edges remain denied;
- the accepted Grid still instantiates `SocialGridStore`, not the remote candidate;
- the route exposes no staging, admission, follow/unfollow, cleanup, transport, recommendation, or authority effect; and
- existing `/v1/social` local-authored snapshot semantics remain separate and unchanged.

## Abuse and privacy requirements before further runtime exposure

The current read-only inspection route is not sufficient for untrusted-network social exchange. Before Following or admission is exposed through an accepted public/user effect route, review must cover:

- private block and mute semantics;
- report/appeal or equivalent operator review semantics;
- exporter/source quarantine and unquarantine authority;
- behavior when a followed source becomes quarantined or its key is retired;
- owner-scoped storage, rate, object-count, and payload-byte quotas;
- content/rendering safety for text, links, and any future media path;
- retention and operator-visible cleanup semantics;
- privacy minimization for follow/trust/observation metadata beyond the current G5A review shape;
- consistent not-found behavior where existence itself is sensitive; and
- incident response for compromised exporter, transport, or relay keys.

These controls are separate from recommendation ranking. A reputation, ranking, moderation, or visibility score must never become Grid authorization, actor identity proof, consent, or legal-status proof.

## Future relay review boundary

If an egress-capable social relay is implemented later, it requires a separate threat-model update and review. At minimum the relay should use:

- a distinct process/service identity;
- no Grid signing/data-protection key;
- no admission/follow approval authority;
- exact allowlisted HTTPS origins with strict DNS/TLS/redirect behavior;
- least-privilege per-source read credentials;
- bounded queues, response sizes, retries and concurrency;
- source/transport/exporter key lifecycle and revocation handling;
- a staging-only authenticated handoff into Grid;
- receipts that distinguish fetch, verification, staging, admission and follow effects; and
- explicit failure behavior for uncertain fetch/delivery.

The relay cannot be described as deployed merely because S3F laboratory code exists or because G5B can read already-present remote-social state.

## Independent review scope

Any review that purports to cover remote-social activation must inspect the exact source revision of at least:

- `mesh/src/lib/social-exchange-package.mjs`
- `mesh/src/lib/social-transport-envelope.mjs`
- `mesh/src/grid/remote-social-store.mjs`
- `mesh/src/grid/remote-social-admission-store.mjs`
- `mesh/src/grid/remote-social-following-store.mjs`
- `mesh/src/grid/remote-social-retention-store.mjs`
- `mesh/src/grid/remote-social-transport-store.mjs`
- `mesh/src/grid/remote-social-protection.mjs`
- `mesh/src/grid/remote-social-runtime-candidate.mjs`
- `mesh/src/grid/remote-social-review-projection.mjs`
- `mesh/src/grid/remote-social-review-read-adapter.mjs`
- their migrations and tests;
- `mesh/src/grid/server.mjs` to confirm `SocialGridStore` remains selected and only the exact read-only review route is added;
- `mesh/src/gateway/server.mjs` to confirm owner derives from authenticated principal and no owner override/effect route exists;
- `mesh/config/gateway-client-contract.json` and its exact contract verifier;
- `mesh/config/service-network-policy.json` and its exact route verifier;
- service-network policy to preserve Grid deny-egress and constrain any future relay handoff; and
- AXIOM One policy/UX claims before any broader remote-social surface is represented as available.

## Non-claims

A Grid-signed export proves what that Grid signed. A transport envelope proves what the pinned transport endpoint signed for one nonce-bound request. A local admission proves what the local Grid accepted under the recorded local authority path. A private Following record proves a local preference. A G5A/G5B review response proves only the bounded local review representation returned for the authenticated owner. None of those statements alone proves content truth, legal identity, biological identity, or personal authorship.

The current accepted runtime does not instantiate the remote-social candidate, does not provide a live source-package endpoint, and does not run a host-side social relay. It does provide exactly one authenticated owner-scoped read-only remote-social review route with no mutation, network, recommendation, or authority effect. No live federation, public remote Following, recommendation system, messaging system, moderation service, relay/index, public follow graph, or public-profile hosting claim follows from that inspection capability.