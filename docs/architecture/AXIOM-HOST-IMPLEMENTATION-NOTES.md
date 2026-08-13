# AXIOM Host Implementation Notes

**Status:** research notes subordinate to
[`AXIOM-HOST-OPERATING-ENVIRONMENT.md`](AXIOM-HOST-OPERATING-ENVIRONMENT.md)

This file intentionally does not define a supported runtime or production
configuration. It records the first implementation laboratory so that the
architecture can move from prose to reproducible evidence without coupling
AXIOM-MESH to one Linux distribution or build tool.

## First laboratory target

The first target is a **bootable UEFI virtual-machine appliance**. It should be
small enough to rebuild frequently and contain only what is required to boot,
run the current AXIOM-MESH verification surface, collect host evidence, and
exercise replacement/rollback.

The laboratory should evaluate a systemd/mkosi-style image build because the
upstream systemd stack can assemble Linux OS images and UKIs and can participate
in boot counting, root-file-system discovery, verity-backed layouts, and
measured-boot workflows. This is a candidate implementation, not a normative
AXIOM dependency.

## Build-input contract

A build is not reproducible merely because a script can be run twice. The
laboratory must record at least:

- source commit for AXIOM-MESH;
- exact image-build configuration commit;
- Linux distribution/repository snapshot identity;
- exact architecture;
- kernel package/version and resulting kernel digest;
- boot-artifact digest;
- root-image digest;
- package inventory and SBOM reference;
- builder/tool versions;
- build timestamp policy and other known nondeterministic inputs;
- signing mode (`unsigned-lab`, `test-signed`, or later approved signing);
- confirmation that no production credential is embedded.

If two builds differ, the result is not automatically a failure. The laboratory
must identify whether the difference is expected metadata nondeterminism,
upstream package nondeterminism, signing randomness, filesystem-image layout,
or unexplained drift. Unexplained drift blocks a reproducibility claim.

## VM gate sequence

The first VM campaign should proceed in this order:

1. build the image without production secrets;
2. boot it under UEFI virtual firmware;
3. verify the expected image/kernel/boot identifiers from inside the guest;
4. run `npm run setup:check` and `npm run check` against the embedded or mounted
   exact AXIOM source state;
5. prove the system root cannot be mutated through the normal runtime path;
6. prove AXIOM durable state is on a separate writable class;
7. shut down and replace the system image while preserving declared durable
   state;
8. boot a deliberately broken candidate and exercise fallback/rollback;
9. corrupt a protected root-image block or equivalent laboratory artifact and
   verify fail-closed behavior;
10. export a host-profile evidence package without private keys.

## Explicitly deferred from the first VM

The first VM does not need to solve:

- production Secure Boot key custody;
- physical TPM endorsement/attestation roots;
- GPU passthrough;
- cross-owner deduplication;
- production remote management;
- arbitrary third-party agent runtimes;
- high-availability host clustering;
- firmware update orchestration; or
- a graphical desktop.

Each of those materially expands the trusted computing base or operational
surface and should be introduced only against a recorded requirement and test.

## Repository placement

When implementation begins, host-image build material should live under a
separate top-level or clearly isolated build directory rather than inside the
Mesh kernel source tree. A candidate shape is:

```text
host/
  README.md
  image/
  packages/
  systemd/
  policies/
  tests/
  evidence/
```

The `host/` tree should build the reference appliance. `mesh/` remains the
portable AXIOM authority/evidence kernel. The host build may package the Mesh;
the Mesh must not require that host build to exist in order to run on supported
generic environments.

## Stop conditions

Stop the laboratory and open a security/recovery finding before proceeding if:

- an image artifact contains a private production credential;
- a normal agent/sandbox can mutate the host system image;
- rollback reintroduces revoked credentials or rewinds replay/security state;
- a failed update destroys the only recoverable durable-state copy;
- sandbox access reaches host signing/unlock/node-identity keys;
- the build requires disabling an existing AXIOM deny-first network or authority
  control;
- measured-boot data is presented as verified remote attestation without an
  implemented verifier and trust policy; or
- the image can no longer run the ordinary AXIOM verification suite.

## Decision rule

The first implementation milestone is complete only when there is a bootable
VM artifact, an exact build manifest, a host-profile instance, corruption and
rollback evidence, and a documented list of remaining nondeterminism and
non-claims.
