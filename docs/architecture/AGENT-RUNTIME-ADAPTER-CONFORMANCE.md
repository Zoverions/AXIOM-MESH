# Agent Runtime Adapter v1 Contract and Conformance

**Status:** candidate normative contract `1.0.0`; synthetic reference evidence only

**Updated:** 2026-08-11

**Contract:** [Agent Runtime Adapter v1](contracts/agent-runtime-adapter.v1.schema.json)

**Contract SHA-256:** `4954c3d1a49ea57fb0bf5a7eea29140b852e8b5fa2bb11634665f004aca2c19c`

## Purpose and current boundary

This contract defines how a maintained external agent runtime may request AXIOM
capabilities without becoming an authority root. It applies to potential
integrations such as OpenClaw and future replacement runtimes. A runtime may
plan, converse, retrieve memory, call its own tools, or coordinate workers, but
those abilities do not authorize an AXIOM effect.

The current implementation is deliberately synthetic. It loads no external
runtime, uses no real credential, performs no network or user-data filesystem
access, and produces no external effect. It does not change the capability
registry and does not claim MCP, A2A, autonomous-agent, remote-execution, or
production-runtime support.

The governing path remains:

```text
external runtime or machine client
  -> versioned adapter
  -> Gateway-authenticated principal and intent
  -> Hypervisor policy, approval, and grant decision
  -> Sandbox bounded execution
  -> Grid evidence and terminal state
  -> independently consumable receipt
```

No runtime plugin, prompt, tool declaration, skill, model result, local approval
dialog, or compatibility protocol may bypass that path.

## Contract identity and versioning

The manifest schema has these stable identifiers:

- schema: `axiom-agent-runtime-adapter.v1`;
- contract id: `axiom.agent-runtime-adapter`;
- contract version: `1.0.0`;
- schema id: `urn:axiom:contract:agent-runtime-adapter:v1`; and
- exact contract digest shown above.

`mesh/src/lib/runtime-adapter-contract.mjs` pins and verifies the exact schema
bytes. A manifest repeats the contract id, semantic version, and digest. A
receipt repeats the same contract pin and the exact manifest digest. Schema
drift therefore fails the documentation gate, focused tests, release verifier,
and protected workflow before an adapter can present evidence against a
different contract under the same version.

The following changes require a new major schema identifier and contract major
version:

- removing or weakening a required authority, credential, evidence, sandbox,
  revocation, cancellation, retry, or reconciliation bound;
- changing the meaning of an existing field or outcome;
- accepting a previously rejected unknown field or operation;
- replacing a pinned identity or digest with a mutable reference; or
- making a required signature, grant, receipt, or pre-effect authorization
  check optional.

Backward-compatible optional metadata may use a minor contract version only
after old verifiers reject or safely ignore it according to an explicitly
reviewed rule. Corrections that do not change accepted instances may use a patch
version. Every version change requires a schema diff, updated digest, threat
model review, fixtures, migration note, and rollback statement. Editing the
digest constant to make an unexplained schema change pass is not review.

## Source and licensing rule

Adapter review starts from the nearest maintained incarnation:

1. the current AXIOM Gateway and machine-principal contracts;
2. the supported upstream runtime at an immutable commit and, where available,
   an immutable release;
3. the closest maintained protocol or integration boundary;
4. local derivatives such as ZovsIronClaw or earlier OpenClaw experiments; and
5. older ancestors only for provenance, negative tests, or unique recoverable
   work.

The adapter manifest pins the upstream repository, exact source commit,
release reference when available, SPDX licence identifier, adapter artifact
digest, SBOM digest, compatible capsule schemas, and Gateway contract digests.
A branch, `latest` tag, unpinned package range, or mutable image tag is not an
acceptable source pin. Licence compatibility does not remove attribution,
notice, or security-review obligations.

Upstream changes enter as reviewed adapter updates. AXIOM does not need a fused
fork of multiple general agent frameworks to preserve interoperability.

## Trust bootstrap and grants

Installation and discovery grant zero authority. Before accepting any grant,
an adapter must be configured with an independently obtained Gateway trust key
and expected key identifier. The v1 reference contract requires:

- Ed25519 grant signatures;
- an exact pinned grant-verification key;
- replay protection for grant identifiers;
- one authorized request per signed grant, with only exact idempotent replay of
  that request permitted;
- an explicit maximum grant lifetime;
- principal, adapter, runtime, action, scope, destination, and opaque credential
  binding; and
- a second authorization check immediately before the effect boundary.

The synthetic implementation uses an ephemeral in-process key pair representing
the Gateway side of that boundary. The adapter receives only the public key and
key identifier. It rejects missing or altered attestations, grant identifier
replay, a future issue time, expiry, revocation, a lifetime above the manifest
maximum, and any binding mismatch.

This ephemeral key proves code-path conformance only. It is not a deployed
Gateway identity, hardware-backed key, independent signer, or production trust
anchor.

## Capability translation

Every runtime operation has an explicit mapping containing:

- runtime operation and AXIOM action identifiers;
- effect class;
- input and output schema references;
- permitted scopes;
- permitted destinations; and
- permitted opaque credential handles.

The adapter checks the request independently against both the immutable mapping
and the signed grant. A broad grant cannot widen a narrow adapter mapping, and
a broad mapping cannot widen a narrow grant. Unknown operations and fields are
denied. Tool names, prompts, runtime permission labels, or model classifications
are not used to infer an action at execution time.

Credentials remain opaque identifiers. The reference receipt binds the grant
attestation digest but never includes credential handles, raw input, or secret
values.

## Execution, cancellation, and uncertain outcomes

The contract requires an explicit sandbox boundary, finite request and response
sizes, timeout and concurrency ceilings, cancellation, bounded retry, and a new
grant for fallback. Direct host-tool and direct credential access are false.

Authorization is checked before work and again after the synthetic pre-effect
hook. Cancellation or revocation during that interval preempts completion. A
transport loss after dispatch is recorded as `uncertain`; it is never converted
to success or blindly retried. Reconciliation is required before retrying an
orphaned effect.

Idempotency stores the first outcome for an exact request fingerprint. The same
key and fingerprint returns the same signed receipt. Reusing the key with a
different request is denied.

## Synthetic reference drill

Run the byte-pinned contract verifier and reference drill from the repository
root:

```text
npm run runtime-adapter:contract
npm run runtime-adapter:drill
```

Protected CI invokes the underlying drill with `--require-commit-bound`. That
mode rejects a missing or malformed `GITHUB_SHA`, binds the evidence to the
workflow revision, and uploads
`axiom-runtime-adapter-reference-conformance-evidence-${{ github.sha }}` from
the required `verify` job.

The drill currently proves 28 synthetic cases:

1. exact contract digest pin;
2. fail-closed manifest constants;
3. installation grants no authority;
4. unsigned grant rejection;
5. grant replay rejection;
6. signed-grant single-use enforcement;
7. exact granted synthetic completion;
8. no external-effect claim;
9. missing grant denial;
10. unknown-operation denial;
11. action mismatch denial;
12. mapping scope widening denial;
13. mapping destination widening denial;
14. mapping credential widening denial;
15. future grant denial;
16. expired grant denial;
17. revoked grant denial;
18. mid-flight revocation preemption;
19. cancellation preemption;
20. stable idempotent replay;
21. idempotency conflict denial;
22. same-grant fallback denial;
23. fresh fallback grant acceptance;
24. uncertain transport-loss outcome;
25. unexpected request-field rejection;
26. receipt-tampering rejection;
27. secret-material exclusion; and
28. explicit production-conformance non-claim.

Focused tests also reject unexpected nested receipt fields and verify the
contract and evidence signatures.

## Evidence trust and limitations

Each receipt and drill result is signed with an ephemeral Ed25519 key and
includes its public key. This detects mutation after generation, but it is
self-contained verification, not independent identity proof. In protected CI,
trust additionally comes from the pinned workflow revision, required job,
commit binding, and GitHub artifact association. A consumer must verify that
workflow and artifact provenance; the embedded ephemeral key alone is
insufficient.

The synthetic receipt binds the contract digest, manifest digest, source
revision, adapter artifact digest, runtime source commit, request digest,
signed-grant attestation digest, outcome, provider/model labels, zero synthetic
cost, latency fixture, and fallback state. It explicitly states that no external
runtime was loaded, no external effect occurred, and production conformance was
not claimed.

## Adoption sequence

1. Keep the v1 contract byte-pinned and review all semantic changes.
2. Preserve the 28-case synthetic drill in the required `verify` workflow.
3. Pin one current upstream runtime and complete source, licence, dependency,
   and threat-model review.
4. Implement one read-only, no-secret channel or health operation through the
   existing native Gateway semantics.
5. Prove native-versus-adapter authorization parity and direct-service denial.
6. Add one reversible effect only after idempotency, cancellation, uncertain
   outcome, reconciliation, and credential isolation pass against the real
   adapter boundary.
7. Compare at least two implementations before extracting a shared adapter
   repository.
8. Promote capability status only after independent review and normal release
   gates.

The next implementation target is step 3 and the read-only portion of step 4.
It must use an immutable upstream source pin and must not import runtime
authority, reusable owner credentials, or ambient host access.

## Current non-claims

This work does not claim that OpenClaw or another named runtime is installed,
secure, licence-compatible for every use, AXIOM-conformant, or production-ready.
It does not prove a live Gateway route, real provider, real credential,
container isolation, operating-system mediation, external network policy,
hardware trust, accessibility, performance, privacy, or recovery behavior.

It also does not claim that a successful GitHub workflow by itself proves a
production deployment or independent security review. Capability registry,
deployed trust anchors, external-runtime conformance, pilot evidence, and
production promotion remain separate gates.

The in-memory synthetic grant replay and consumption records are not a durable
restart-safe production ledger. A live adapter must bind grant consumption to
the authoritative Gateway/Grid lifecycle and prove restart, partition, and
reconciliation behavior before any effect is exposed.
