# AXIOM Application Security Baseline Design

**Date:** 2026-09-05  
**Status:** approved design; implementation not yet started  
**Scope:** AXIOM human-facing and hosted application surfaces, adapters, and supporting services  
**Security posture:** fail closed; reuse stronger Mesh controls where already authoritative

## 1. Purpose

AXIOM needs one enforceable application-security baseline for present and future human-facing surfaces rather than a collection of app-specific checklists.

This design standardizes the minimum controls for:

- secret handling and repository hygiene;
- browser-to-server trust boundaries;
- hosted relational database access;
- authentication and sessions;
- record-level authorization;
- mutation-field integrity;
- input, query, content, and upload safety;
- response minimization;
- HTTPS and browser security headers;
- abuse resistance;
- dependency and supply-chain verification; and
- executable negative-path security evidence.

The baseline applies to Axiom One, Education, Circles, Governance, and future public or hosted surfaces where relevant.

It does **not** replace the AXIOM-MESH authority model. Gateway -> Hypervisor -> Sandbox -> Grid remains the supported privileged-effect path. Existing principal, capability, consent, evidence, encryption, deny-egress, and signed internal-request controls remain authoritative where they are stronger than ordinary web-application mechanisms.

## 2. Core invariant

> The browser is an untrusted presentation environment. Anything it can read, modify, replay, or fabricate must remain harmless unless independently authenticated, authorized, validated, and bounded by the server or authoritative data-policy boundary.

No client-side state may establish authority merely because the official UI produced it.

## 3. Design principles

### 3.1 Reuse stronger controls instead of weakening them

A conventional web mechanism must not replace an existing stronger Mesh control.

Examples:

- database row-level security does not replace Mesh capability authorization;
- a login session does not create Grid or Sandbox authority;
- a governance result does not become executable merely because a hosted application stores it;
- a public database credential never becomes an administrator or service credential;
- application telemetry must not weaken existing privacy-minimized Mesh telemetry requirements.

### 3.2 Default deny

A new table, endpoint, field, upload type, origin, cookie scope, or external dependency is inaccessible until its explicit positive policy and negative tests exist.

Unknown identity, ownership, role, schema, origin, query shape, upload type, or authority state fails closed.

### 3.3 Server-derived authority

Identity, owner, role, scope, approval state, authority, timestamps, and other security-sensitive properties are derived or verified server-side. Client-supplied equivalents are never trusted as authoritative.

### 3.4 Security controls must be evidence-bearing

A control is not considered implemented merely because a configuration flag exists. Each material control requires executable positive and negative evidence appropriate to its consequence.

## 4. Architecture

The baseline is divided into one universal profile and four adapters.

### 4.1 Universal Application Security Profile

Applies to every externally reachable AXIOM application surface unless a stronger existing control explicitly supersedes it.

Responsibilities:

- secret classification and non-disclosure;
- server-side authentication and authorization;
- input and output boundary validation;
- content safety;
- request/response size limits;
- security headers;
- transport security for Internet-facing origins;
- dependency review and scanning;
- redacted security observability;
- negative-path conformance tests.

### 4.2 Hosted Web Adapter

Applies to browser-delivered applications hosted outside the local loopback-only Mesh shell.

Responsibilities:

- secure cookies where cookies are used;
- CSRF defence for cookie-authenticated mutations;
- HTTPS/HSTS on public origins;
- origin and redirect validation;
- browser security headers;
- client-bundle secret scanning;
- bot/abuse controls on exposed anonymous surfaces.

### 4.3 Database Adapter

Applies when a hosted relational database or database API is directly or indirectly reachable from a client-facing service.

Responsibilities:

- default-deny row-level security where supported;
- parameterized values and allowlisted dynamic identifiers;
- record ownership/visibility enforcement;
- field-level mutation allowlists;
- response projection allowlists;
- database/service credential separation;
- encryption and key separation for sensitive data.

### 4.4 Authentication Adapter

Applies where a hosted application introduces login, account recovery, password, passkey, or reusable browser-session semantics.

Responsibilities:

- server-side authentication;
- session rotation, expiry, revocation, and fixation resistance;
- password hashing only if passwords are actually stored by AXIOM;
- recovery abuse controls;
- account- and source-aware rate limiting;
- credential and authentication-event redaction.

### 4.5 File and Content Adapter

Applies when users can upload files or publish/render untrusted content.

Responsibilities:

- file-type, size, count, and decompression limits;
- storage outside executable application paths;
- randomized object naming;
- content/signature verification where appropriate;
- isolated serving origin or attachment disposition for risky content;
- malware/content scanning where justified by the deployment;
- contextual output encoding and sanitization;
- no uncontrolled script-capable markup execution.

## 5. Required controls

### 5.1 Secrets and API keys

Production secrets must not appear in:

- source control;
- client bundles;
- public configuration;
- logs or traces;
- screenshots or fixtures;
- exception responses;
- test snapshots containing real values;
- generated documentation or evidence artifacts.

Secret-bearing configuration remains server-side or in separately reviewed secret-provider/workload-identity mechanisms.

Where a platform intentionally uses a public browser credential, such as an anonymous database project key, that credential must be explicitly classified as public and incapable of bypassing authorization policy.

No service-role, administrator, private signing, data-protection, provider, telemetry-write, or repository-effect credential may cross the browser boundary.

### 5.2 Secret discovery and Git history remediation

A discovered secret is treated as compromised regardless of whether the repository is public or private.

Required incident order:

1. revoke or rotate the credential;
2. determine exposure scope and dependent systems;
3. preserve bounded incident evidence without copying the secret further;
4. remove the value from current source/configuration;
5. scan for equivalent exposures;
6. perform coordinated Git-history rewriting only when the residual exposure justifies it;
7. invalidate caches, releases, artifacts, or deployment copies where applicable;
8. verify the old credential no longer works;
9. document the incident and prevention test.

History rewriting is not itself credential remediation.

### 5.3 Public database credentials

If a hosted database requires a browser-visible key, only the intentionally public/anonymous key may be exposed.

The public key must:

- grant no administrative capability;
- depend on independent row/data policy;
- be safe to copy by an attacker;
- be replaceable without redefining user authority;
- never be treated as authentication merely because it is present.

### 5.4 Row-level security

For client-accessible hosted relational data stores that support RLS or an equivalent policy mechanism:

- RLS is enabled by default on every externally reachable table/view;
- a table without explicit access policy is inaccessible;
- ownership is derived from authenticated server/database identity, not request fields;
- service/admin bypass roles are never used from the browser;
- cross-account reads and writes have explicit negative tests;
- insert, update, delete, and select policies are reviewed independently;
- security-definer/bypass functions require separate review and tests.

RLS is defence in depth. It does not replace application or Mesh authorization.

### 5.5 Encryption of sensitive data

Sensitive persistent data must use encryption appropriate to its trust boundary.

Requirements:

- existing encrypted Grid state remains authoritative for Mesh data;
- hosted stores use provider/storage encryption at minimum;
- unusually sensitive fields use application-level or separately scoped encryption where the threat model requires database-operator separation;
- encryption keys are separated from ciphertext storage where practical;
- key rotation, recovery, backup, and deletion semantics are documented;
- logs, analytics, caches, replicas, exports, and backups are included in the data inventory.

Encryption does not substitute for access control or minimization.

### 5.6 Server-side authentication

Every protected request is authenticated at the authoritative server boundary.

The server must not trust:

- client-side login state;
- hidden fields;
- local-storage roles;
- unsigned JWT-like blobs produced by the client;
- requested owner/user identifiers;
- UI-only route guards.

Authentication establishes an identity context. Authorization remains a separate decision.

### 5.7 Record access control

Record access is evaluated from authenticated identity plus explicit policy.

Requirements:

- no endpoint accepts `owner_id`, `user_id`, `account_id`, or equivalent as proof of ownership;
- parent/child object access revalidates the relationship;
- list/search endpoints enforce the same visibility rules as direct lookup;
- indirect identifiers, exports, attachments, and cached projections preserve the same boundary;
- foreign-owned and nonexistent resources use indistinguishable responses where disclosure of existence would be sensitive.

### 5.8 Field tampering prevention

Mutations use explicit writable-field allowlists.

Security-sensitive fields are never mass-assigned from untrusted request bodies, including where applicable:

- owner or subject identity;
- role or privilege;
- policy version;
- approval/review state;
- authority or scope;
- balances/credits;
- provenance/evidence identifiers;
- server timestamps;
- moderation/security flags;
- immutable revision identifiers.

The server constructs authoritative records from validated inputs plus server-derived fields.

### 5.9 Session cookies

Where reusable browser sessions use cookies, production cookies must use:

- `HttpOnly`;
- `Secure` on HTTPS deployments;
- `SameSite=Lax` or `Strict` by default, with any relaxation justified;
- the narrowest practical path and host scope;
- no permissive cross-subdomain `Domain` unless explicitly required;
- `__Host-` prefix where deployment constraints permit;
- bounded idle and absolute expiry;
- rotation after authentication and privilege change;
- revocation/logout support;
- session fixation resistance.

Cookies are not introduced into local Mesh bearer/capability flows merely to satisfy this baseline.

### 5.10 CSRF defence

Cookie-authenticated state changes require CSRF protection.

Preferred controls combine:

- `SameSite` cookies;
- origin verification;
- anti-CSRF token or equivalent bound request mechanism where required;
- state changes restricted to non-GET methods;
- no credentialed wildcard CORS.

Bearer-token APIs that do not rely on ambient browser credentials are evaluated under their own replay/origin threat model rather than receiving unnecessary cookie-CSRF machinery.

### 5.11 Password storage

AXIOM should prefer managed authentication, passkeys, or externally reviewed identity providers over creating another password database.

If AXIOM itself must store passwords:

- use a vetted adaptive password KDF such as Argon2id;
- use a unique random salt per password;
- store only the resulting verifier and required parameters;
- support parameter/version migration on successful authentication;
- never log, encrypt-for-recovery, or otherwise retain plaintext passwords;
- recovery must not reveal whether a credential exists beyond the minimum necessary UX.

### 5.12 Login and recovery rate limiting

Login, recovery, registration, and similar high-abuse surfaces require independent limits.

Controls should combine, as deployment permits:

- source/network limits;
- account/identity limits;
- bounded progressive delay;
- concurrency limits;
- recovery/email/send limits;
- detection of distributed attempts without storing excessive identifying telemetry.

A rate-limit increase must not be the first response to sustained abuse.

### 5.13 Bot protection

Bot controls apply primarily to anonymous or inexpensive-to-create identities on Internet-facing surfaces.

Examples include:

- registration;
- account recovery;
- public posting;
- invitations;
- high-cost search or generation;
- public forms.

Bot signals may reduce abuse or require additional interaction. They never create authority, identity proof, or permission.

Accessibility and privacy must be considered before introducing CAPTCHA-like mechanisms.

### 5.14 Parameterized queries

Database values are parameterized.

Dynamic identifiers that cannot be represented as values, such as selected sort columns or table names, use finite allowlists mapped to trusted identifiers.

Request data must never be concatenated into SQL, shell, template, search, or interpreter syntax.

Equivalent parameterization/escaping rules apply to non-SQL interpreters and query languages.

### 5.15 Input validation

Every external input is validated at the server boundary for applicable:

- type;
- required/optional state;
- maximum and minimum length;
- numeric bounds;
- enum membership;
- normalization/canonical form;
- encoding;
- nesting depth;
- collection size;
- semantic relationships;
- body size;
- allowed media type.

Validation is duplicated at lower authoritative boundaries where trust changes, consistent with existing Mesh revalidation patterns.

### 5.16 User-content rendering

Untrusted content is encoded for its output context.

Requirements:

- use framework text rendering by default;
- avoid raw HTML injection APIs;
- sanitize allowed rich text with a reviewed policy;
- reject or isolate executable content;
- do not rely on Content Security Policy as the sole XSS defence;
- encode separately for HTML, attribute, URL, script/data, and other contexts as applicable.

### 5.17 File uploads

Upload policy is explicit per feature.

At minimum:

- maximum file size;
- maximum count;
- approved file/media types;
- filename normalization and non-authoritative client filenames;
- randomized storage identifiers;
- storage outside executable application paths;
- bounded archive/decompression processing;
- image/media parser limits;
- content-type and signature inspection where appropriate;
- scanning/quarantine where justified;
- least-privilege object access;
- safe serving headers/origin;
- retention, deletion, export, and recovery behavior.

A file being uploaded successfully does not imply it is safe to execute, parse deeply, publish, or share.

### 5.18 API response minimization

Responses use explicit DTO/projection allowlists.

Never serialize database rows or internal domain objects wholesale merely because they are convenient.

Omit unless required:

- secret or credential material;
- internal authorization state;
- private object identifiers;
- unrelated user fields;
- hidden moderation/security state;
- stack traces;
- provider internals;
- raw database metadata;
- unnecessary timestamps or correlation fields;
- authority/evidence details not intended for that caller.

Error responses are bounded and do not reveal secrets or privileged internal structure.

### 5.19 Security headers

All applicable browser responses use a centrally defined hardened header policy.

The profile includes, where appropriate:

- Content-Security-Policy;
- `X-Content-Type-Options: nosniff`;
- frame denial through CSP `frame-ancestors` and/or legacy compatibility headers where required;
- Referrer-Policy;
- Permissions-Policy;
- cache controls for sensitive responses;
- HSTS for public HTTPS production origins;
- safe cross-origin policies where the application model supports them.

Existing Axiom One and kernel security-header implementations should be reused or generalized rather than duplicated.

### 5.20 HTTPS and transport

Public Internet origins must use HTTPS and reject or redirect plaintext HTTP as appropriate.

Production public origins use HSTS once deployment ownership and HTTPS continuity are reliable.

This rule does **not** require TLS on isolated `127.0.0.1` development/loopback surfaces where the existing local trust model intentionally uses loopback HTTP.

Existing Mesh internal service edges retain their stronger TLS 1.3, identity, fingerprint, and signed-envelope requirements.

### 5.21 Dependency and supply-chain security

Application dependencies require the same disciplined posture already required by repository policy.

Controls include:

- lockfile integrity;
- exact/reviewed dependency updates;
- vulnerability scanning;
- SBOM generation where applicable;
- malicious/typosquat package review;
- install-script review or suppression where possible;
- licensing and maintenance review;
- removal plan for unnecessary dependencies;
- provenance/signature verification where supported;
- CI checks that fail on prohibited high-severity findings according to policy;
- separate treatment for dev-only and production-reachable dependencies.

No application dependency may silently become a Mesh kernel dependency.

### 5.22 Security event redaction

Logs, traces, metrics, audit events, and security alerts must not become a secondary secret or privacy store.

Do not record raw:

- passwords;
- session cookies;
- authorization headers;
- API keys;
- private signing material;
- reset tokens;
- full sensitive request/response bodies;
- unbounded user content.

Security events use controlled vocabularies, bounded identifiers or digests where needed, and documented retention.

## 6. Authorization composition

### 6.1 Web authentication is not Mesh authority

A browser session can establish which human/account is interacting with an application. It does not directly authorize privileged Mesh effects.

Where a hosted application requests a Mesh effect:

1. authenticate the hosted user;
2. authorize access to the hosted resource/action;
3. construct the bounded intent/proposal for the Mesh boundary;
4. enter the existing Gateway authority path;
5. allow Mesh policy, consent, approval, capability, destination, budget, and evidence rules to make the authoritative effect decision.

### 6.2 RLS is not a capability engine

RLS controls database visibility and mutation access. It must not be used to imply that a record automatically grants executable authority.

### 6.3 Bot signals are not identity

A bot challenge result is abuse evidence only. It does not prove legal identity, personhood, trustworthiness, or authorization.

## 7. Error and failure behavior

Security dependencies fail closed.

Examples:

- unknown database policy -> deny;
- missing authenticated principal -> deny;
- ambiguous ownership -> deny;
- missing encryption key -> do not persist plaintext fallback;
- unavailable malware scanner where scanning is mandatory -> quarantine or reject, never silently accept;
- dependency scanner unavailable during a required promotion gate -> no promotion;
- invalid session state -> require reauthentication;
- secret-provider failure -> do not substitute a default credential;
- malformed security header configuration -> fail deployment checks;
- public HTTP exposure where HTTPS is required -> deployment not production-ready.

Failure messages remain useful but do not disclose sensitive internals.

## 8. Verification strategy

The implementation programme should organize tests into four suites rather than twenty disconnected booleans.

### 8.1 Secrets and supply chain

Required evidence includes tests/checks for:

- known secret patterns absent from tracked source;
- generated/browser assets contain no private credentials;
- public-key allowlist contains only intentionally public credentials;
- dependency/lock integrity;
- vulnerability/SBOM policy;
- no unreviewed install-script or dependency expansion;
- old rotated-secret fixtures demonstrably fail authentication where practical.

### 8.2 Authentication and authorization

Negative tests include:

- unauthenticated protected request denied;
- user A cannot read, update, delete, export, attach to, or enumerate user B's records;
- role/owner fields in request bodies cannot elevate access;
- client-side role/session changes do not establish authority;
- expired/revoked sessions fail;
- session fixation attempt fails;
- CSRF attempt against cookie-authenticated mutation fails;
- RLS direct-client bypass attempt fails;
- service-role/admin key is absent from client artifacts.

### 8.3 Input, content, upload, and response boundaries

Negative tests include:

- oversized body rejected before expensive handling;
- unexpected fields rejected or ignored according to explicit schema policy;
- SQL/query injection strings remain data;
- unsupported dynamic sort/query identifiers rejected;
- script-bearing user content renders inert;
- dangerous file types rejected or isolated;
- archive/decompression bomb limits enforced;
- upload filename cannot escape storage namespace;
- API responses omit non-contract fields;
- errors do not expose stack traces, secrets, or foreign-resource existence where protected.

### 8.4 Deployment and browser security

Required evidence includes:

- expected CSP and other headers on success and error responses;
- HTTPS-only public deployment behavior;
- HSTS on promoted public production origin;
- cookie attributes verified;
- no permissive credentialed wildcard CORS;
- redirect targets/origins validated;
- loopback-only surfaces are not falsely required to mimic Internet TLS policy;
- application security controls do not weaken the existing Mesh internal transport boundary.

## 9. Conformance model

A surface is not declared compliant merely because the universal profile exists.

Each application maintains a small conformance manifest identifying:

- which adapters apply;
- which controls are inherited from shared infrastructure;
- which controls are not applicable and why;
- exact tests/evidence for each applicable control;
- deployment exposure state: built, enabled, exposed, promoted;
- residual risks and reviewed exceptions.

Exceptions require an explicit threat-model justification and expiry/review date. An exception cannot silently weaken a non-waivable Mesh invariant.

## 10. Rollout strategy

Implementation should be incremental and avoid combining unrelated authority changes.

Recommended slices:

1. **Baseline conformance framework** — schemas/manifests, shared secret/client-bundle scanning, response/security-header assertions, and control taxonomy.
2. **Axiom One hardening harvest** — map existing Axiom One and Gateway protections into conformance evidence; add only missing controls.
3. **Hosted database adapter** — RLS/default-deny policy templates and negative cross-user tests for any current hosted relational surface.
4. **Hosted authentication/session adapter** — secure cookie/session/CSRF/recovery controls only where reusable hosted sessions exist.
5. **File/content adapter** — upload and untrusted-content controls for surfaces that accept such inputs.
6. **Supply-chain promotion gates** — dependency, SBOM, vulnerability, and artifact-secret checks integrated into supported CI.
7. **Domain adoption** — Education, Circles, Governance, and future apps adopt manifests without duplicating core logic.

Each slice should be separately reviewable and should not claim production promotion until its evidence exists.

## 11. Migration and compatibility

- Existing Mesh bearer-principal and capability flows remain unchanged unless a later reviewed implementation slice explicitly modifies them.
- Existing loopback Axiom One behavior remains valid; public-HTTPS requirements apply only when a surface is actually Internet-exposed.
- Existing encrypted Grid storage remains authoritative and is not migrated into a hosted database merely for consistency.
- Hosted database RLS applies only to stores that support and require that model.
- Password controls are not implemented where the product does not store passwords.
- Bot controls are not added to low-abuse local surfaces without a demonstrated threat.
- Public database keys are not introduced where no direct browser database access exists.

## 12. Non-goals

This design does not:

- create a new authentication provider;
- authorize direct browser access to Grid, Hypervisor, or Sandbox;
- create a second Mesh accounting, consent, governance, or capability engine;
- require Supabase or any particular database vendor;
- require CAPTCHAs everywhere;
- require passwords;
- require a hosted database;
- claim protection against a malicious root/host outside the existing Mesh trust assumptions;
- certify any current surface as production-secure merely by approving this design.

## 13. Residual risks

Even after implementation:

- a malicious or compromised deployment host may bypass application-level controls within the host trust boundary;
- browser extensions or endpoint malware may read user-visible content and interact through the user's legitimate session;
- public anonymous credentials remain public and must be safe under full attacker possession;
- rate limiting and bot controls cannot prove humanity or prevent all distributed abuse;
- dependency scanning cannot prove the absence of unknown supply-chain compromise;
- encryption at rest does not prevent disclosure to an already-authorized compromised process;
- RLS cannot correct a logically over-broad policy without tests and review;
- secure cookies do not protect against every same-origin application compromise.

These risks must remain explicit rather than being hidden behind a generic “secure” claim.

## 14. Acceptance criteria for implementation planning

The design is ready to become an implementation plan when:

1. the universal profile and adapter boundaries are accepted;
2. Mesh authority is explicitly preserved as the stronger privileged-effect boundary;
3. RLS/session/password/public-database-key controls remain conditional on the actual hosted architecture;
4. CSRF and security-event redaction are included as first-class controls;
5. secret remediation requires rotation/revocation before history cleanup;
6. every material control has an executable evidence requirement;
7. the rollout is decomposed into reviewable slices rather than one large security rewrite.

No runtime capability claim changes as a result of this design document alone.
