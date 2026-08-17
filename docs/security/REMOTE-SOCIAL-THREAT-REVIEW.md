# AXIOM-MESH Remote Social Threat Review Companion

**Build:** `0.12.0-dev.3`

**Status:** required companion to `CURRENT-BUILD-THREAT-MODEL.md`; not an independent assessment

**Updated:** 2026-08-17

This document is a focused review input for the remote-social foundations merged through S3A-F and the current S3G hardening sequence. It does not activate those foundations. The canonical current-build threat model remains authoritative and explicitly incorporates this companion for remote-social review scope.

## Current activation boundary

The accepted Grid service still imports and instantiates `SocialGridStore`. The disabled `RemoteSocialRuntimeCandidateGridStore` is not selected by the accepted server, exposes no public route, and has no network egress. On this branch it composes Grid-side S3C staging, S3D admission, S3E private Following, S3G2 retention/quota lifecycle, and S3G6 owner-private abuse controls/quarantine. G6 does not change the accepted Grid selection.

S3F transport is deliberately separate from that candidate because the supported Grid boundary remains deny-egress. The repository contains a pinned/bounded transport laboratory, but no accepted source-package endpoint and no deployed host-side social relay. A future relay must be reviewed and promoted independently.

There is no current claim of live federation, remote discovery, public remote Following, a public follow graph, recommendation ranking, messaging, public profile hosting, relay/index service, or production moderation service.

## Trust statements that must not be collapsed

### Exporter Grid attestation

An S3A `grid-export` signature proves that the trusted exporter Grid key signed the exact package statement. It does not prove legal or biological identity, content truth, actor-key ownership, or that a represented human personally authored the content.

The exporter key is a provenance/trust input, not Mesh authority. Compromise of the exporter key can create apparently valid exporter attestations and therefore requires revocation/rotation and local trust-policy response; it cannot by itself authorize local admission.

### Transport endpoint attestation

An S3F transport envelope proves that the independently pinned transport key signed one nonce-bound response for an exact HTTPS origin, package digest, canonical package-byte digest, exporter Grid/key IDs, and bounded response timestamp.

Transport authentication does not replace S3A package verification and does not prove publisher identity, content truth, delivery, admission, federation, or authority. Transport and exporter keys must remain distinct trust roots.

### Local admission authority

S3D admission proves that the local Grid accepted an exact staged package under a recorded accepted intent and matching independent one-use approval. Approval consumption and admission materialization are transactional. Admission produces a locally retained remote observation, not local authorship and not proof that the remote content is true.

### Private Following

S3E Following is a local owner preference over already admitted remote persona observations. Trust scope is limited to `exporter-attestation-only`. Content-truth, legal-identity, and actor-authorship claims remain false. The projection performs no live fetch, recommendation, ranking, or public graph publication.

### Owner-private abuse controls

S3G6 mute and block records are local owner preferences over already admitted remote personas. A report is an append-only owner assertion for later review and is explicitly non-adjudicating. Exporter/source quarantine is an owner-local fail-closed safety state, not a global denylist, identity revocation, content-truth determination, reputation score, or legal judgment.

Block, mute, report, and quarantine records do not grant Mesh authority. Report does not automatically change visibility or trust. Source quarantine stores a deterministic digest of a normalized exact HTTPS origin plus protected local detail; G6 performs no DNS, HTTP, credential use, or transport. A future G8 relay may consult the source digest before egress only after its own review and activation gates.

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
- S3G6 private mute/block preferences, reports, exporter/source quarantine state, protected reason/note metadata, and source-origin digests; and
- future relay credentials, DNS/TLS state, queues, logs, and handoff receipts if that relay is later implemented.

Remote observations may be structurally public but still privacy-sensitive in aggregate. Following choices, trust labels, abuse preferences, reports, quarantine reasons, and source trust decisions are private local metadata even when the referenced persona/content/source is public.

## Threat actors and failure modes

Reviewers must consider at least:

- a malicious exporter Grid that signs harmful, misleading, spammy, or deceptive but schema-valid public content;
- theft or compromise of a trusted exporter signing key;
- a malicious or compromised transport endpoint using a valid transport key;
- transport/exporter key substitution or reuse of a retired key;
- a compromised future relay attempting to become a confused deputy for admission or Following;
- a local authenticated principal attempting to stage, admit, inspect, clean up, follow, mute, block, report, or quarantine another owner's records;
- an operator approving a visually similar but digest-different stage or trusting an incorrect exporter;
- an attacker replaying a stale transport envelope or changing origin, nonce, package bytes, exporter identity, or timestamps;
- storage-amplification attacks using many valid packages, large public content, repeated unique observations, reports, preferences, quarantine records, or retry pressure;
- malicious content intended to exploit future renderers, link previewers, media processors, moderation tools, or human reviewers;
- trust-label or abuse-control wording intended to be mistaken for verified identity, content truth, personal authorship, adjudication, or global moderation;
- correlation of private Following/trust/report/quarantine state with remote public identities;
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
- block/mute/exporter-quarantine rules cannot be bypassed by Following reconstruction.

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
- the Grid-side candidate remains disabled, has no transport methods, and is not referenced by the accepted Grid server.

### S3G6 owner-private abuse controls and quarantine

Review should verify:

- only already admitted owner-visible persona observations can be muted or blocked;
- active block prevents new local follow while preserving prior follow/observation evidence;
- active mute/block suppress matching local Following items without rewriting remote observations;
- reports can target only owner-visible admitted persona/publication observations;
- reports are append-only owner assertions, `adjudicated: false`, claim no content truth, and create no automatic block/quarantine/visibility effect;
- exporter quarantine requires an exporter already present in that owner's staged/admitted state, remains owner-local, suppresses matching Following, and prevents new follow while active;
- source quarantine accepts only a normalized exact HTTPS origin, persists a deterministic origin digest, protects the normalized origin/reason/note at rest, and performs no network I/O;
- release/unmute/unblock transitions are explicit and historical evidence remains retained;
- owner/report/preference/quarantine bounds fail before durable mutation;
- every new protected G6 value is included in generic remote-social data-key rotation;
- reports/preferences/quarantines never become ranking, recommendation, reputation, identity, admission, policy, or legal authority; and
- earlier opt-in stores plus accepted `SocialGridStore` do not gain G6 schema/methods.

## Abuse and privacy requirements before runtime exposure

G6 closes the first local-control gap, but the current laboratory stack is still not sufficient for untrusted-network social exposure. Before Following or admission is exposed through an accepted public/user route, review must still cover:

- user-visible report review/appeal or equivalent correction semantics if reports are ever shared with an operator/service;
- source-quarantine enforcement and retired-key handling in the future egress relay before any source fetch occurs;
- owner-scoped request/rate controls for any future public abuse-control mutation route;
- content/rendering safety for text, links, and any future media path;
- privacy minimization for follow/trust/observation/report/quarantine metadata;
- consistent not-found behavior where existence itself is sensitive;
- abuse-control export/deletion/retention semantics appropriate to the exposed product;
- incident response for compromised exporter, transport, or relay keys; and
- independent review of any public moderation, shared blocklist, automated classification, or reputation proposal before it is built or exposed.

These controls are separate from recommendation ranking. A reputation, ranking, moderation, report, block, mute, or quarantine state must never become Grid authorization, actor identity proof, consent, content-truth proof, or legal-status proof.

## Future relay review boundary

If an egress-capable social relay is implemented later, it requires a separate threat-model update and review. At minimum the relay should use:

- a distinct process/service identity;
- no Grid signing/data-protection key;
- no admission/follow approval authority;
- exact allowlisted HTTPS origins with strict DNS/TLS/redirect behavior;
- least-privilege per-source read credentials;
- bounded queues, response sizes, retries and concurrency;
- source/transport/exporter key lifecycle and revocation handling;
- owner/source quarantine preflight before network access;
- a staging-only authenticated handoff into Grid;
- receipts that distinguish fetch, verification, staging, admission and follow effects; and
- explicit failure behavior for uncertain fetch/delivery.

The relay cannot be described as deployed merely because S3F laboratory code exists.

## Independent review scope

Any review that purports to cover remote-social activation must inspect the exact source revision of at least:

- `mesh/src/lib/social-exchange-package.mjs`
- `mesh/src/lib/social-transport-envelope.mjs`
- `mesh/src/grid/remote-social-store.mjs`
- `mesh/src/grid/remote-social-admission-store.mjs`
- `mesh/src/grid/remote-social-following-store.mjs`
- `mesh/src/grid/remote-social-retention-store.mjs`
- `mesh/src/grid/remote-social-abuse-store.mjs`
- `mesh/src/grid/remote-social-transport-store.mjs`
- `mesh/src/grid/remote-social-protection.mjs`
- `mesh/src/grid/remote-social-runtime-candidate.mjs`
- their migrations and tests;
- `mesh/src/grid/server.mjs` to confirm current candidate non-activation;
- Gateway owner-scoping and route contracts before any remote route is added;
- service-network policy to preserve Grid deny-egress and constrain any future relay handoff; and
- AXIOM One policy/UX claims before any remote-social surface is represented as available.

## Non-claims

A Grid-signed export proves what that Grid signed. A transport envelope proves what the pinned transport endpoint signed for one nonce-bound request. A local admission proves what the local Grid accepted under the recorded local authority path. A private Following record proves a local preference. A mute/block proves only this owner's local preference; a report proves only that the owner recorded the assertion; quarantine proves only that this owner locally marked the exporter/source for fail-closed handling. None of those statements alone proves content truth, abuse, legal identity, biological identity, personal authorship, or a right to impose authority on another actor.

The current accepted runtime does not instantiate the remote-social candidate, does not provide a live source-package endpoint, and does not run a host-side social relay. No live federation, public remote Following, recommendation system, messaging system, moderation service, relay/index, public follow graph, or public-profile hosting claim follows from the laboratory foundations.