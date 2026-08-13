# AXIOM Host Operating Environment

**Status:** future-compatible reference-host architecture; no current runtime,
OS-image, hardware-attestation, or production-promotion claim

**Specification version:** `0.1.0-draft.1`

**Created:** 2026-08-12

**Applies to:** future personal nodes, managed nodes, appliance deployments,
local agent execution, storage-plane research, hardware-rooted identity, and
high-assurance AXIOM-MESH installations

## Purpose and boundary

AXIOM-MESH is increasingly responsible for authority, evidence, identity,
network policy, scheduling, recovery, agent isolation, storage, and distributed
coordination. Those responsibilities benefit from a known host substrate, but
the Mesh must remain portable and must not become coupled to one operating
system implementation.

This specification therefore introduces **AXIOM Host** as a separate reference
operating environment beneath AXIOM-MESH.

The architectural decision is:

> **AXIOM-MESH remains the portable authority/evidence substrate. AXIOM Host is
> the strongest reference environment on which that substrate may run. Linux is
> the initial kernel implementation, not the AXIOM authority model.**

AXIOM Host is not a new kernel project. The first implementation SHOULD use a
small, image-built Linux userspace and the upstream Linux kernel. A custom or
substantially forked kernel is out of scope unless a later recorded requirement
cannot be satisfied safely through upstream mechanisms.

This document does not change `mesh/config/capabilities.json`, production
policy, current node admission, scheduler authority, supported routes,
production readiness, or the current claim that machine software identifiers
are attribution metadata rather than hardware attestation proof.

## System decomposition

The intended stack is:

```text
+----------------------------------------------------------+
| AXIOM experience                                        |
| AXIOM One | domain products | operator surfaces         |
+----------------------------------------------------------+
| Agent runtime plane                                     |
| capsules | adapters | tools | models | bounded memory   |
+----------------------------------------------------------+
| AXIOM-MESH                                               |
| Gateway | Hypervisor | Sandbox | Grid | policy | sync   |
+----------------------------------------------------------+
| AXIOM Host                                               |
| boot | immutable OS | state | network | isolation       |
| updates | recovery | device mediation | host evidence   |
+----------------------------------------------------------+
| Hardware / firmware                                     |
| UEFI | TPM where present | CPU | RAM | NVMe | GPU/NPU   |
+----------------------------------------------------------+
```

The layers MUST remain independently replaceable where their contracts permit.
In particular:

- AXIOM-MESH MUST continue to run on supported non-AXIOM Linux hosts during
  development and migration;
- Windows, macOS, mobile, cloud, and provider-backed nodes MAY participate at
  assurance levels justified by their own evidence without pretending to be an
  AXIOM Host;
- running AXIOM Host MUST NOT itself grant Mesh capabilities or bypass normal
  admission, policy, grant, sandbox, or Grid paths;
- an agent runtime remains an untrusted client of the Mesh even when it runs on
  AXIOM Host; and
- hardware or boot evidence is one input to policy. It is not proof that an
  arbitrary workload is correct.

## Why a reference host exists

A portable application installed on an arbitrary machine inherits large,
operator-specific uncertainty: boot configuration, update state, package drift,
firewall behavior, storage layout, service ordering, logging, recovery,
privileged users, device permissions, and security-module configuration can all
vary.

AXIOM Host exists to reduce that uncertainty for deployments that need it. It
SHOULD make the following properties reproducible and inspectable:

1. the exact boot artifacts and OS image;
2. the mutable-versus-immutable storage boundary;
3. the update and rollback state;
4. the network topology and default-deny rules;
5. the services allowed to run with host privilege;
6. the isolation primitives available to sandboxes;
7. the device and accelerator mediation policy;
8. the custody and release policy for host-level keys;
9. the evidence available for admission and incident response; and
10. the recovery procedure from failed upgrades or host compromise.

A host profile describes these properties. It does not convert a declaration
into verified fact.

## Initial implementation direction

The reference implementation SHOULD begin with an upstream Linux kernel and a
small systemd-based image. The concrete build tool remains replaceable, but the
first laboratory SHOULD evaluate an image builder that can produce a complete,
reproducible disk image, signed boot artifact, and read-only root from pinned
inputs.

A systemd/mkosi-style build is a strong initial candidate because the upstream
boot architecture supports Unified Kernel Images (UKIs), boot counting,
root-file-system discovery, image generation, measured boot integration,
verity-backed images, and image-oriented update workflows. This is an
implementation candidate, not a permanent protocol dependency.

The host contract MUST describe observable properties rather than require a
specific distribution brand or package manager.

## Boot and root-of-trust model

### UEFI and signed boot

The preferred physical-node path is UEFI firmware followed by a signed boot
artifact. On platforms that support it, Secure Boot SHOULD validate the boot
chain before the Linux kernel is entered.

The preferred first laboratory layout is a signed Unified Kernel Image
containing the kernel, initrd, command line or equivalent boot policy, and the
metadata required to identify the image. The exact signing and key-custody
process MUST be documented separately before any production claim.

Legacy BIOS MAY be supported for development or low-assurance nodes, but it
MUST be represented as such in the host profile and MUST NOT be described as
providing the same boot assurance.

### Measured boot

Where a TPM 2.0 is present and supported, the host SHOULD measure boot artifacts
and relevant boot phases into named PCRs. Policy MAY later require evidence
bound to those measurements.

Measured boot and Secure Boot are distinct. A measurement records state; it
does not automatically establish that the state is approved. A signed boot
chain establishes a signature-based authorization path; it does not establish
that every runtime process behaves correctly.

Current AXIOM-MESH does not verify a hardware attestation chain. Until an exact
attestation verifier and trust policy are implemented and promoted, any TPM or
PCR fields in a future host profile remain declared or laboratory-observed
evidence.

### Immutable system image

The preferred root operating-system image is read-only at runtime. A candidate
implementation uses dm-verity or an equivalent authenticated read-only block
mapping for the system image.

The root-image authenticity chain MUST bind the approved image identity to an
operator- or release-trusted signature. A Merkle root or block hash alone is an
integrity value, not a statement about who approved the image.

Normal host operation SHOULD NOT use mutable in-place package installation to
change the system image. Host updates SHOULD replace or stage complete signed
images or signed extensions through an explicit update mechanism.

## Mutable state model

AXIOM Host separates immutable operating-system bytes from mutable state.

A target layout is:

```text
EFI / boot artifacts        signed, minimal, separately writable
immutable system image      read-only, integrity protected
host state                   encrypted mutable state
AXIOM durable state          encrypted, policy-owned, backed up explicitly
sandbox/worktree storage     bounded execution storage
scratch                      bounded ephemeral storage
recovery reserve             not allocatable to ordinary workloads
```

The exact partition layout is implementation-specific until the image
laboratory fixes one, but the logical classes are not.

### Encryption

Mutable private state SHOULD be encrypted at rest. On hardware that supports it,
a later profile may bind key release to TPM state. Recovery MUST remain possible
through a separately protected recovery method; TPM binding must not create an
unrecoverable single point of failure.

Disk encryption protects data at rest. Once the host is running and a volume is
unlocked, it does not isolate one privileged process from another. AXIOM's
normal service, sandbox, secret, and authority boundaries remain required.

### Storage-plane relationship

AXIOM Host is the natural place to implement future storage profiles such as
immutable shared bases, private writable layers, reflink/COW, OverlayFS, or
block-level deduplication. Those mechanisms remain subordinate to the separate
agent-worktree storage-plane research and its empirical gates.

The host MUST reserve hard physical capacity independent of expected
compression or deduplication savings. A dedupe estimate MUST NOT become a
safety-critical capacity promise.

Private cross-owner deduplication is disabled by default. Storage sharing MAY
occur inside a declared trust/dedupe domain only when the side-channel,
encryption, deletion, recovery, and quota consequences are understood.

## Update, rollback, and recovery

AXIOM Host SHOULD use image-oriented updates with the following properties:

- release artifact identity is cryptographically bound;
- update metadata and payloads are authenticated;
- the candidate image is staged without destroying the last known-good image;
- reboot into the candidate is counted and assessed;
- a failed candidate automatically returns to a previous known-good image where
  the platform supports that mechanism;
- the Mesh durable state schema is checked for forward/backward compatibility
  before destructive migration;
- state migration is separately reversible or backed up before activation; and
- rollback does not silently roll back security-relevant state such as nonce,
  revocation, evidence, or credential-history records.

OS rollback and application-state rollback are therefore different operations.
A bootable old image is not sufficient if its interpretation of durable state
would weaken current security semantics.

A release is considered boot-successful only after the required AXIOM host
health checks reach a named completion target. Merely reaching a login prompt
or PID 1 is insufficient for a promoted node profile.

## Network model

The host network is deny-first.

A high-assurance AXIOM Host SHOULD expose no listening service that is not part
of an explicit host or Mesh communication graph. Loopback, internal service
segments, management, owner-LAN, VPN, and public egress are separate policy
classes.

Host-level firewall policy MUST NOT replace Mesh authorization. The firewall
limits packet reachability; the Gateway and Hypervisor decide AXIOM authority.

The reference host SHOULD support:

- default-deny unsolicited ingress;
- default-deny service-to-public egress unless explicitly required;
- exact service-to-service allow rules;
- independent management/recovery access with separate credentials;
- deterministic DNS/NTP/update destinations or approved relays where feasible;
- rate and connection bounds; and
- signed or otherwise durable evidence of the active network-policy profile.

A future remote management plane MUST NOT share unrestricted credentials with
agent sandboxes.

## Service and privilege model

AXIOM Host SHOULD run the minimum host services required for boot, storage,
networking, updates, logging, hardware mediation, and AXIOM service supervision.

The Mesh remains decomposed into independently bounded services. Host `root` is
not an acceptable application authority boundary. Services SHOULD use separate
OS identities, capability sets, filesystem views, cgroups, syscall filters,
and network scopes where the selected Linux mechanisms support them.

A host service MUST NOT gain ambient access to AXIOM secrets merely because it
is installed by the same image.

Interactive root access SHOULD be absent from ordinary operation. Emergency
operator access, when enabled, MUST be separately authenticated, time-bounded or
physically controlled as appropriate, auditable, and treated as a high-impact
maintenance event.

## Sandbox and agent isolation

Agent code remains untrusted even on an owner-controlled personal node.

The host SHOULD provide the isolation primitives required by the Mesh sandbox
contract, including process/resource control, syscall restriction, mount and
filesystem isolation, network isolation, and optional virtual-machine
boundaries.

The implementation MAY use Linux namespaces/cgroups/seccomp/LSM policy for
lower-risk workloads and a microVM or equivalent hardware-virtualization
boundary for stronger profiles. The exact choice is a profile property and must
be justified by tests.

No sandbox receives the host's boot-signing keys, disk-unlock secrets, update
keys, node identity private keys, shared cache-write authority, or unrestricted
device access.

## Accelerators and device mediation

GPU, NPU, camera, microphone, USB, serial, radio, and other device access MUST
be mediated explicitly.

A sandbox receiving an accelerator does not thereby receive access to unrelated
host devices, host display/session memory, arbitrary DMA, or another sandbox's
buffers. Device passthrough, shared drivers, and vendor runtimes have different
attack surfaces and require separate conformance profiles.

The first AXIOM Host prototype MAY expose no GPU to sandboxes. CPU-only
correctness and isolation evidence is preferable to prematurely widening the
trusted computing base.

## Host profile contract

[`axiom-host-profile.v1.schema.json`](contracts/axiom-host-profile.v1.schema.json)
defines the documentation-only draft host profile.

The profile records:

- image and kernel identity;
- firmware/boot mode and Secure Boot declaration;
- immutable-root and integrity mechanism;
- mutable-state encryption and recovery properties;
- update/rollback behavior;
- network default policy;
- sandbox/isolation primitives;
- storage-profile relationship;
- device/accelerator mediation;
- TPM/measured-boot/attestation declarations; and
- evidence references and freshness.

The profile is complementary to the existing
[`Compute Node Profile v1`](contracts/compute-node-profile.v1.schema.json).
The Compute Node Profile describes placement-facing compute/runtime resources;
the Host Profile describes the operating-environment assurance substrate.
Neither profile grants admission, execution, or policy authority.

## Host evidence and admission semantics

A future admitted node may provide host evidence to policy, but the following
states MUST remain distinct:

1. **declared** — an operator or image manifest states a property;
2. **measured** — local tooling observed a property;
3. **verified** — a named AXIOM verifier validated the evidence under an exact
   trust policy;
4. **admitted** — node admission policy accepted the node for a bounded role;
5. **scheduled** — placement selected the node for a specific request; and
6. **authorized** — the ordinary Mesh authority path granted the request.

None of these states implies the next.

A future remote-attestation verifier MUST bind evidence to freshness,
challenge/nonce, node identity, expected platform profile, exact trust roots,
and replay protection. It MUST state what the underlying hardware or firmware
actually attests and what remains outside that claim.

## Reference build stages

### Stage H0 — contract and build laboratory

- freeze Host Profile v1 draft fields;
- select a pinned upstream Linux distribution/package source for the laboratory;
- create an image build in CI or a reproducible build runner;
- produce a bootable VM image from declared inputs;
- generate an image manifest/SBOM and cryptographic digests;
- prove the image contains no production credentials.

**Exit:** two clean builds from the same pinned inputs produce explainable,
reviewed artifact identities and a VM can boot the image in a disposable lab.

### Stage H1 — immutable VM appliance

- boot a signed or test-signed UKI in UEFI VM mode;
- use a read-only/integrity-protected system image;
- separate mutable AXIOM state from the system image;
- run current Mesh verification inside the appliance;
- implement deterministic reset/reprovision for the lab.

**Exit:** corrupting the protected system image is detected or fails closed;
AXIOM state survives an OS-image replacement according to the declared state
contract.

### Stage H2 — update and rollback

- stage image-based updates;
- retain a known-good boot target;
- exercise failed-boot rollback;
- exercise application-state compatibility and restore;
- bind update evidence to exact release artifacts.

**Exit:** power loss or an intentionally broken candidate image does not leave
the node silently running an unverified partial upgrade.

### Stage H3 — physical reference node

- repeat the build on selected UEFI hardware;
- enable Secure Boot under controlled keys;
- enable full mutable-state encryption;
- exercise recovery keys and disaster recovery;
- inventory firmware, CPU, storage, NIC, and accelerator identifiers;
- measure thermals, power, sleep/reboot behavior, and device reset.

**Exit:** the same Host Profile can be reproduced on at least one named physical
reference platform with signed evidence.

### Stage H4 — measured boot and host attestation laboratory

- measure boot artifacts and phases on TPM 2.0 hardware where available;
- implement challenge-bound evidence collection;
- define explicit trust roots and revocation;
- add verifier negative fixtures for stale/replayed/mismatched measurements;
- keep admission disabled until the verifier is independently reviewed.

**Exit:** laboratory attestation evidence can be verified and rejected
fail-closed without claiming that arbitrary workload results are trusted.

### Stage H5 — storage and sandbox profiles

- integrate the separately tested worktree/storage profile;
- add hard capacity floors and recovery reserve enforcement;
- qualify sandbox and optional microVM profiles;
- qualify accelerator/device mediation independently;
- run long-duration reclaim, crash, OOM, and upgrade tests.

**Exit:** one candidate host profile has bounded resource, recovery, and
isolation evidence suitable for a disposable pilot.

### Stage H6 — pilot promotion decision

Only after authentic hardware evidence, recovery drills, threat-model update,
independent security review, operational runbooks, and the ordinary AXIOM
production gates may a specific Host Profile be considered for production
promotion.

## Security decisions that remain open

The first build laboratory must not hide unresolved choices. At minimum, the
following require explicit design records before a promoted image exists:

- image signing key custody and rotation;
- Secure Boot key enrollment/recovery;
- whether system-image confidentiality is required in addition to integrity;
- exact LUKS/TPM/recovery-key model for mutable state;
- update metadata format, freshness, rollback protection, and mirror trust;
- whether `/etc` is image-owned, state-owned, or generated deterministically;
- host logging retention and privacy;
- emergency operator access and break-glass policy;
- firmware update authority;
- GPU/vendor-driver trust and update cadence;
- microcode provenance;
- remote-attestation trust roots and revocation;
- storage dedupe/encryption/integrity ordering; and
- factory reset versus cryptographic erase semantics.

## Compatibility and sovereignty

AXIOM Host is an assurance option, not a participation tax.

A sovereign owner MUST be able to run AXIOM-MESH on their own supported Linux
host, build the reference image from published inputs where licences permit,
or operate a different conforming environment while accepting the assurance
properties actually demonstrated by that environment.

Managed providers MAY offer AXIOM Host nodes, but provider control of hardware
does not convert into user authority. The user-visible policy, data scope,
provider identity, routing, and receipts remain part of normal Mesh semantics.

National or organizational deployments MAY maintain their own approved image
and signing roots while preserving protocol compatibility. Federation must not
require one global root key or one vendor-controlled operating-system image.

## Promotion gates and non-claims

The following are explicit **non-claims** until separately implemented and
verified:

- AXIOM-MESH is not currently a standalone operating system;
- no AXIOM Host bootable image is currently a supported release;
- no custom AXIOM Linux kernel exists or is required by this specification;
- no current capability requires Secure Boot, TPM 2.0, dm-verity, UKI, mkosi,
  systemd-boot, or a specific Linux distribution;
- current machine metadata is not hardware remote-attestation proof;
- the Host Profile schema is not loaded by the current runtime;
- no storage optimization is selected for production by this document;
- no host evidence bypasses Gateway -> Hypervisor -> Sandbox -> Grid;
- an immutable or measured host does not prove model or workload correctness;
- a successful VM laboratory is not physical-hardware or operational evidence;
  and
- documentation or CI conformance alone does not production-promote AXIOM Host.

The first implementation target is therefore deliberately smaller than "build
an OS": **build and verify one reproducible, minimal, immutable Linux appliance
that runs AXIOM-MESH without weakening any current authority or evidence
boundary.**

## Upstream technical references

These are implementation references, not AXIOM trust authorities:

- systemd boot/root-filesystem architecture and image-building overview:
  <https://systemd.io/ROOTFS_DISCOVERY/>
- systemd automatic boot assessment and rollback behavior:
  <https://systemd.io/AUTOMATIC_BOOT_ASSESSMENT/>
- systemd measured-boot phase support:
  <https://www.freedesktop.org/software/systemd/man/devel/systemd-pcrphase.service.html>
- Linux kernel dm-verity documentation:
  <https://www.kernel.org/doc/html/latest/admin-guide/device-mapper/verity.html>
- Linux kernel fs-verity documentation:
  <https://www.kernel.org/doc/html/latest/filesystems/fsverity.html>
