# AXIOM-MESH Kernel

**Build:** `0.12.0-dev.3`

**Updated:** 2026-08-12

This directory contains the supported clean-room AXIOM-MESH kernel. It is a
zero-third-party-npm-dependency Node.js runtime with four security
responsibilities: Gateway, Hypervisor, Sandbox, and Grid.

The kernel is a production candidate, not a production-promoted service. The
capability registry at [`config/capabilities.json`](config/capabilities.json)
is authoritative for runnable claims.

## Runtime policy

Supported source runtime:

- Node.js `>=24.14.0 <25`;
- protected CI and `.node-version`: Node.js `24.18.0`;
- candidate production image: Node.js `24.19.0`;
- npm `>=11.0.0 <12`;
- zero third-party npm dependency packages.

The machine-readable source-setup authority is
[`config/setup.json`](config/setup.json). Do not infer the candidate production
pin from `.node-version`: CI and production are intentionally represented as
separate policy fields.

From the repository root:

```bash
npm run doctor
npm run setup
npm run dev
```

From `mesh/` directly:

```bash
npm run doctor
npm run setup
npm run dev
```

`npm run setup` validates the exact runtime/npm policy, installs both committed
zero-dependency locks with lifecycle scripts disabled, proves those locks remain
unchanged, and runs the clean-kernel and release gates. It creates no production
credential and deploys nothing.

## Four responsibilities

| Service | Current responsibility |
|---|---|
| Gateway | Principal authentication, request validation, abuse controls, idempotency, constrained-machine ingress limits, versioned APIs |
| Hypervisor | Intent normalization, deny-dominant policy, machine-authority validation, plan construction, approval checks, grant issuance |
| Sandbox | Grant-bound deterministic operation execution; no ambient supported arbitrary-code or open-network authority |
| Grid | Encrypted durable state, approvals, evidence, consent, memory, governance, portability, recovery, node and conflict records |

The normal supported privileged path is:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

A browser, provider, external runtime, repository operator, remote node, or
administrator does not gain authority merely by existing next to the kernel.

## Machine principals

Authenticated constrained machine principals are human-sponsored and bounded
by finite exact scopes, actions, purposes, destinations, runtime identity,
expiry, non-delegation, execution-time, request-size, request-rate, concurrency,
and response-size ceilings.

For the current built-in operation set, Hypervisor computes the effect
destination from the selected `builtin.*` tool and canonicalizes it to `local`.
That value must remain inside the machine principal's finite destination
allowlist before a grant can be issued; Sandbox verifies the signed destination
again before execution. Unknown provider, remote, or MCP destination semantics
fail closed.

`/v1/machine-discovery` returns only the authenticated constrained machine's
requestable intersection under current policy. Discovery is not authorization.
Every requested effect still re-enters the normal intent and policy pipeline.

Terminal constrained-machine intents may expose owner-scoped Grid-attested
receipts. Those receipts bind canonical request and machine-authority digests,
accepted/terminal Grid evidence anchors, current chain assurance, and terminal
result/error digests without exposing raw output. They prove the signed Grid
statement, not arbitrary external-world truth.

Runtime identifiers and software digests are attribution metadata rather than
TPM/TEE, measured-boot, or remote-attestation proof.

## Grid evidence and continuity

Grid state is authenticated-encrypted and its evidence records are signed and
hash linked. Local verification detects invalid signatures, altered events,
gaps, broken links, and disagreement with the locally stored head.

Local state alone cannot prove that a suffix was not consistently deleted if an
actor can also rewrite the local head and trailing checkpoints. Stronger
truncation assurance uses `axiom-grid-continuity-anchor.v1`, retained outside
`AXIOM_DATA_DIR` and verified against the full chain from genesis. An anchor
commits assurance only through its retained sequence; events after the newest
anchor are not covered by that anchor.

Grid is one transparency log, not replicated BFT consensus.

## Service transport and network policy

Production internal service transport uses TLS 1.3, distinct Ed25519 service
identities, DNS and SPIFFE-style URI checks, exact active-leaf fingerprint
pinning, and signed replay-protected application envelopes.

The alternate four-unit single-host topology uses four internal network
segments. The machine-readable default-deny service policy authorizes **40
exact current-build caller/destination/method/route combinations** and derives
allowed mTLS peers from that same graph. The policy removes unrelated adjacency
and is enforced before outgoing request signing and again by the receiving
service.

The compact candidate keeps `network_mode: none` and exposes Gateway to the host
through a permission-restricted Unix socket. Neither topology is a multi-host,
automatic-failover, or consensus claim.

## Repository-effect prototype boundary

The kernel source contains an evidence-first repository-document effect chain
for future AXIOM Intent remediation. It is built and adversarially tested but
**production-unreachable**.

The chain includes signed read-only repository planning, resolver-backed input
resolution/admission, resolved target policy and independent approval, durable
prepared-effect evidence, an external-effect outbox, and a credential-isolated
GitHub docs operator.

The outbox durably records preparation before invoking the operator. An
unresolved operator result or unverified receipt remains durably prepared rather
than becoming synthetic success. A verified receipt may then be bound into
`external.effect.completed` evidence.

The docs operator independently verifies Grid-durable preparation before any
GitHub request. It is restricted to the fixed AXIOM-MESH repository, exact
planned documentation paths/content, a deterministic effect branch, and an
**open draft pull request**. It contains no merge operation and reports
`merge_performed: false` and `base_branch_content_changed: false`.

Production activation remains closed because
[`config/intent-remediation-executors.json`](config/intent-remediation-executors.json)
contains no mappings, production [`config/policy.json`](config/policy.json)
contains no `repository.docs.pull-request.create` action, and no supported
public/runtime route invokes the chain.

## Agent Runtime Adapter v1

The byte-pinned Agent Runtime Adapter v1 contract defines a future boundary for
replaceable external agent runtimes. A synthetic 28-case reference drill covers
signed grants, capability mapping, one-use authorization, cancellation,
revocation, idempotency, fallback, uncertain outcomes, receipts, and rollback.

The reference loads no external runtime, resolves no real runtime credential,
opens no external runtime connection, performs no external effect, and does not
certify OpenClaw, Hermes, Agent Zero, MCP, A2A, or any third-party runtime.

An external runtime may coordinate work, but it may not become an alternate
authority path around Gateway -> Hypervisor -> Sandbox -> Grid.

## Production-candidate operations

The kernel includes bounded drills and verifiers for:

- recovery, backup retention, restore, and rollback;
- SLO/load and request-pressure/dependency-loss behavior;
- telemetry relay and alert delivery;
- transport and service-unit isolation;
- service/API credential and data-protection-key rotation;
- admitted-node discovery/scheduling and causal exchange;
- deployment-independent secret/policy providers;
- deny-egress/container boundaries;
- incident tabletop evidence;
- pilot dossier/package intake;
- independent-security-review intake; and
- Agent Runtime Adapter contract/reference conformance.

Synthetic evidence proves mechanism behavior and rejection paths. It does not
supply a live pilot, external custody, an independent audit, external-runtime
certification, or production promotion.

## Commands

```bash
npm run doctor
npm run setup
npm run check
npm test
npm run release:verify
npm run runtime-adapter:contract
npm run runtime-adapter:drill
```

Operational drills are exposed through the root command surface as documented
in [`PRODUCTION.md`](PRODUCTION.md) and the current
[documentation index](../docs/README.md).

## Non-claims

The kernel does not currently claim:

- live production or a completed authentic pilot;
- remote workload dispatch, authenticated remote results, federation, BFT, or
  Sybil resistance;
- an autonomous-agent runtime, machine delegation, MCP/A2A endpoint, or
  certified third-party runtime;
- a production-enabled repository resolver/operator action;
- direct-main repository mutation or merge authority;
- production AI, messaging, identity, storage-transfer, payment, or regulated
  domain adapters;
- arbitrary-code sandbox security;
- operational settlement/tokens/bridges/liquidity;
- secure embodied autonomy or end-to-end post-quantum security; or
- proof that a model result or external-world effect is true merely because an
  AXIOM receipt is cryptographically intact.