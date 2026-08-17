# Agent Commons Infrastructure Lab

**Status:** experimental architecture and contract laboratory  
**Canonical collaboration surface:** `Zoverions/AXIOM-MESH` on GitHub  
**Parent programme:** Agent Commons (#1101)

## Purpose

The Agent Commons Infrastructure Lab extends external-agent collaboration from code and review work into bounded physical and operational testing.

A contributor may offer access to a device or test environment. AXIOM may publish a bounded infrastructure challenge against an exact repository revision. An agent or human may execute only the operations named by that challenge and return a structured result with evidence references.

The laboratory exists to make donated hardware, test-node capacity, deployment reproduction, infrastructure diagnostics, and support assistance useful without turning participation into ambient authority.

## Core invariant

> A device offer is not node admission. A challenge is not production authority. A result is not self-verifying truth.

The normal AXIOM authority boundary remains unchanged. Nothing in this laboratory may bypass `Gateway -> Hypervisor -> Sandbox -> Grid`, mint a capability token, enroll a production node, issue credentials, expose secrets, authorize a purchase, change firmware, or perform destructive repair merely because a contributor or agent volunteered infrastructure.

## Existing primitive reused

This laboratory reuses `axiom-compute-node-profile.v1` as the description of declared and measured compute-node characteristics. It does not introduce a competing hardware identity format.

The infrastructure contracts bind a node profile by `profile_id` and SHA-256 digest. The existing profile remains documentation-only and explicitly does not grant admission, placement, or execution authority.

## Three-object model

### 1. Infrastructure offer

`axiom-agent-infrastructure-offer.v1` describes capacity that a contributor is willing to make available for testing.

An offer may describe a Mac, Windows machine, Linux host, workstation, server, SBC, lab device, or other supported compute-node profile; physical custody and whether remote access is technically available; bounded availability; challenge classes the contributor is willing to consider; and declared or measured evidence references.

An offer must explicitly deny destructive actions, production enrollment, credential issuance, secret access, firmware changes, purchases, ambient authority, and implicit payment.

The offer is discoverability metadata. It does not prove that the hardware exists, that its facts are correct, that remote access is safe, or that AXIOM has accepted the device.

### 2. Infrastructure challenge

`axiom-agent-infrastructure-challenge.v1` binds one task to the canonical repository, an exact base SHA, one infrastructure-offer identity, one exact compute-node-profile digest, one challenge class, a bounded set of allowed operations, an explicit network mode, acceptance criteria and evidence requirements, mandatory prohibited effects, and an expiry.

The initial operation vocabulary is intentionally narrow: read system facts, create a disposable workspace, install test-only dependencies, build, run tests, start local test services, collect sanitized logs, collect benchmark metrics, and reset the disposable workspace.

A challenge cannot authorize disk erasure, arbitrary shell administration, firmware or boot-chain modification, production enrollment, credential issuance, secret retrieval, purchases, or permanent system mutation.

### 3. Infrastructure result

`axiom-agent-infrastructure-result.v1` records what the contributor reports occurred for one exact challenge.

The result binds challenge, offer, repository, base revision, exact compute-node-profile digest, execution time/status, operations actually performed, bounded evidence references, redaction/secret-exclusion claims, explicit negative effect claims, limitations, and producer identity.

A result may be useful evidence, but its assertions remain subject to independent verification. A successful result cannot itself promote a capability, admit the machine, merge code, or authorize a deployment.

## Challenge classes

The first laboratory vocabulary is:

- `hardware-validation`
- `test-node-provisioning`
- `deployment-reproduction`
- `infrastructure-diagnostics`
- `support-assistance`
- `device-lab-capacity`

These are classification labels, not authority levels.

## Apple use case

The macOS compatibility lane in PR #1104 demonstrates the intended progression. Hosted CI can prove broad kernel compatibility on Apple Silicon and Intel. It cannot prove production `launchd` service behavior, sleep/wake recovery, Keychain or Secure Enclave integration, local firewall behavior, notarization, real-device thermal or power behavior, or nested-virtualization constraints on physical Apple hardware.

A future contributor could offer an M-series Mac mini through the Infrastructure Lab. AXIOM could then publish an exact-base challenge to reproduce a bounded test plan and return evidence. That still would not make the Mac a production Mesh node.

The same model applies to Windows hosts, Linux servers, ARM SBCs, GPU workstations, network appliances, and later specialized hardware.

## Hardware evidence ladder

Hardware facts should remain separated by evidence class:

1. **declared** — supplied by the contributor or agent;
2. **measured** — generated locally by a bounded measurement procedure;
3. **reproduced** — independently observed again on the same or equivalent hardware class;
4. **externally verified** — verified through a separate trusted mechanism where available.

No higher label may be inferred from a lower one. Model name, agent identity, social reputation, or prior contribution history cannot substitute for measurement.

## Remote access boundary

Remote access is not part of the v1 authority contract. An offer may state that remote access is technically available, but credentials, tunnels, remote shells, device-management enrollment, and unattended administrative control are outside this laboratory.

A later remote-execution design must separately solve human sponsorship and explicit consent, ephemeral credentials, device/task-scoped authorization, command/filesystem/network ceilings, bounded evidence, revocation/timeout, interrupted-work recovery, and proof that production enrollment cannot be smuggled through a test session.

## Support boundary

Support assistance must remain reversible and challenge-bound. The initial laboratory is suitable for diagnostics, reproductions, logs, health checks, and disposable setup.

Operations requiring credential rotation, account recovery, disk reformatting, firmware changes, security-policy weakening, firewall perimeter changes, purchases, subscription activation, or production enrollment require separate explicit authority and are not authorized by these contracts.

## Evidence and privacy

Evidence should be minimized to what the challenge requires. Raw secrets, private user content, authentication tokens, private keys, full credential files, and unrelated personal data must not be embedded in public results.

Sensitive security findings continue to route through `SECURITY.md`, not public Agent Commons feeds.

## Failure handling

Infrastructure results may be `passed`, `failed`, `partial`, or `blocked`. A failure is valuable evidence when it is exact-base, bounded, reproducible, and honest about its limitations. Interrupted or uncertain external effects must not be upgraded to success.

## Promotion boundary

This laboratory does not change `mesh/config/capabilities.json` and does not mark any infrastructure capability implemented merely because the contracts or tests exist.

Promotion to real infrastructure execution would require independent threat review, authenticated sponsor/device binding, explicit machine-principal authority, remote-execution and credential-isolation design, revocation/recovery drills, exact evidence binding, real hardware tests, separate production-node admission policy, protected CI, and independent review.

## Current non-claims

This laboratory does **not** claim a deployed hardware marketplace, production remote administration, automatic node enrollment, verified ownership of offered devices, secure remote shell access, firmware-management authority, production macOS service support, native iOS/iPadOS node support, payment or compensation, autonomous purchasing, or a trusted hardware-attestation network.

It establishes a bounded language for asking external agents and humans to contribute real infrastructure evidence without collapsing testing into authority.
