<!-- axiom-capability-registry: schema=axiom-capabilities.v1; kernel=0.11.0; digest=9e444ef8312f142fd5233d3ef26df315411628a0eb1cea33b7d49a1f1e4f49cb -->
# AXIOM-MESH

<img src="logo.png" alt="AXIOM-MESH logo" width="150" align="right">

AXIOM-MESH is a local-first capability network: it turns a human or agent
intent into a policy-authorized plan, executes each approved effect inside a
bounded runtime, and emits portable cryptographically linked evidence.

**Current status:** version 0.11 clean-room production candidate. The kernel is
not production-promoted and no live deployment is claimed. The previous
multi-language implementation and iterative design corpus remain as historical
input, but they are not the supported runtime or deployment/audit evidence.

## Supported runtime

The supported implementation is [`mesh/`](mesh/README.md). It keeps the
original four responsibilities as distinct processes:

| Service | Authority |
|---|---|
| Gateway | Public authentication, validation, abuse controls, and user/operator API |
| Hypervisor | Intent normalization, policy decision, explicit plan, and short-lived grant issuance |
| Sandbox | Grant-bound deterministic execution with no arbitrary code or ambient network authority |
| Grid | Transactional state, signed hash-linked evidence, registries, consent, and export |

Every privileged mutation follows:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Grid is currently a **single-node transparency log**, not BFT consensus.
Blockchain settlement, bridges, tokens, arbitrary containers, external AI,
messaging, health, education, government, finance, and embodied systems are
disabled or adapter-required until their controls and evidence exist.

## Run and verify

Local requirements: Node.js `>=24.14.0 <25`. The candidate production image
pins Node.js 24.18.0. The kernel has no third-party runtime dependencies.

```bash
npm run dev
```

In a second terminal:

```bash
node mesh/src/cli.mjs status
node mesh/src/cli.mjs capabilities
node mesh/src/cli.mjs intent system.echo '{"message":"hello"}'
node mesh/src/cli.mjs audit
```

Run all clean-kernel checks:

```bash
npm run check
npm run release:verify
```

## Canonical documentation

- [Technical white paper](docs/whitepapers_and_research/WHITEPAPER.md)
- [Current project status](docs/PROJECT-STATUS-2026.md)
- [Production-grade definition](docs/PRODUCTION-GRADE.md)
- [Production readiness tracker](docs/PRODUCTION-READINESS-TRACKER.md)
- [Active execution queue](docs/MASTER-TODO.md)
- [Phased roadmap](docs/ROADMAP.md)
- [Documentation authority and index](docs/README.md)
- [Security policy](SECURITY.md)

When documents conflict, the executable
[`mesh/config/capabilities.json`](mesh/config/capabilities.json) registry and
the governing rebuild requirements control. Historical documents are research
or traceability inputs unless a current capability and its evidence say
otherwise.

The candidate production package is
[`mesh/compose.production.yml`](mesh/compose.production.yml), with its
provisioning and verification runbook in
[`mesh/PRODUCTION.md`](mesh/PRODUCTION.md). It runs the four responsibilities
as independent supervised processes in one hardened, no-egress container so
internal plaintext traffic remains loopback-only.

The machine-readable
[`mesh/config/capabilities.json`](mesh/config/capabilities.json) file is the
source of truth for runnable claims. Only entries marked `implemented` are
advertised as runnable. Other entries are explicitly `experimental`,
`adapter_required`, `specified`, or `disabled`.

The generated [capability status](docs/rebuild/STATUS.md), Constitution, and
governing rebuild documents must match that registry's schema, kernel version,
and digest. The verifier checks implemented-feature evidence, migration
checksums, the dependency-free lock, rollback coverage, governing-document
claim markers, and that only the clean-kernel workflow is active.

The authenticated operator API and command-line client are implemented. The
historical browser dashboards are not a supported control surface; a new
dashboard remains specified until it has the same authorization, negative-path,
and release evidence as the API.

## Rebuild documents

- [`docs/rebuild/PRODUCT-DEFINITION.md`](docs/rebuild/PRODUCT-DEFINITION.md) —
  reconciled product definition extracted from the complete iterative corpus.
- [`docs/rebuild/REQUIREMENTS.md`](docs/rebuild/REQUIREMENTS.md) — normative
  security, functionality, portability, governance, and operations
  requirements.
- [`docs/rebuild/BASELINE-AUDIT.md`](docs/rebuild/BASELINE-AUDIT.md) — evidence,
  contradictions, security findings, and the rebuild decision.
- [`docs/rebuild/SOURCE-TRACEABILITY.md`](docs/rebuild/SOURCE-TRACEABILITY.md) —
  source groups, extracted requirements, conflict resolution, and feature
  coverage across the iterative document corpus.

Historical documents remain valuable design sources. Where they conflict with
the rebuild documents or executable capability registry, the rebuild sources
control.

Former root installers, Compose files, dev-container setup, contract tooling,
monitoring configuration, test runners, and CI/deployment workflows are
archived under `docs/historical/`. They are inert reference material, not
supported entrypoints.

## Security

- Only Gateway is intended for public exposure; internal services bind to
  loopback.
- Service calls use Ed25519 signatures, body digests, audience binding,
  timestamps, and one-use nonces.
- Execution grants are signed, short-lived, single-use, and bound to the
  principal, intent, plan, policy, tool, and Sandbox audience.
- Runtime policy layers are deny-dominant, internal interface versions are
  signed, and high-risk effects require a one-use approval from an independent
  authenticated principal.
- Durable JSON is authenticated-encrypted at rest; the supported kernel also
  includes consent-scoped content-addressed memory and local balanced
  double-entry accounting without enabling token or chain settlement.
- Signed exports can be staged, deterministically diffed, and independently
  approved into an isolated foreign-provenance store; imports cannot overwrite
  native state or impersonate locally signed evidence.
- Canonical exports support time, type, object, and capsule selection. Optional
  X25519 recipient encryption keeps bundle records opaque to transport and
  storage while retaining a signed, independently verifiable manifest.
- Encrypted signed Grid snapshots support exact-digest offline restore,
  tamper detection, preservation of the replaced database, and signed recovery
  evidence on restart.
- Owner-bound admitted nodes can exchange independently verifiable signed
  causal-update bundles. Version vectors preserve concurrent heads, replays and
  node-counter equivocation fail closed, and conflict resolution must name
  every current head; no peer discovery, transport, or federation is claimed.
- Local governance now drives live but authority-reducing policy overlays
  through human voting, finalization, timelock, independently approved
  activation, verification, rollback, expiring emergency review, and appeal.
- Capsule manifests are immutable, content-addressed, signed, versioned, and
  include constraints, schemas, provenance, and an SBOM digest.
- Economic, chain, bridge, autonomous research, and embodied effects fail
  closed.
- Production startup rejects local credential bootstrap and non-loopback
  plaintext internal transport.
- The production container uses a digest-pinned Node.js base, a non-root user,
  read-only root filesystem, dropped capabilities, explicit resource ceilings,
  mounted secrets, and readiness-based health checks. Its source policy is
  verified; image-build and runtime-drill evidence remain pending.
- Authenticated bounded-cardinality operations and OpenMetrics surfaces cover
  all four services without placing principals, prompts, payloads, tokens, or
  object identifiers in metric labels.

Report vulnerabilities using [`.github/SECURITY.md`](.github/SECURITY.md).

## Legacy code

The historical `gateway/`, `hypervisor/`, `sandbox/`, `grid/`, contracts,
root Compose files, and installers are retained for traceability while migration
continues. They are not part of the supported launch path. No production,
mainnet, regulatory, BFT, post-quantum, “proof of truth,” or independent-audit
claim should be inferred from their presence.
