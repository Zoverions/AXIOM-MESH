# Local Admission Records

**Status:** experimental deployment architecture; no production activation claim.

Safe import is not the same as local adoption.

After an artifact or trust package survives quarantine and review, the receiving institution or owner needs a precise record of **what this specific instance is permitted to install or stage**.

That record is the local admission record.

## Lifecycle

```text
portable trust package
  -> quarantine
  -> scan / review
  -> local policy comparison
  -> local admission record
  -> admitted inert state
  -> separate activation/effect request
  -> runtime
```

The admission record binds exact artifact digests to:

- one target instance;
- one local policy state;
- one protection profile set;
- one deployment topology;
- one named authority source;
- review evidence;
- validity dates;
- a rollback plan.

It does not activate anything.

## Partial admission

A receiving institution should not have to choose between accepting or rejecting an entire package.

It may approve a verifier while rejecting a policy update, or accept a contract template while refusing an executable capsule.

Approved and rejected artifact digests are therefore explicit.

## Instance scoping

An artifact admitted for:

`instance:school-lab-07`

is not automatically admitted for:

`instance:district-production`

even if both belong to the same institution.

This preserves local sovereignty and consequence-specific review.

## Exact versions

Admission is content-addressed. It binds exact digests.

A name such as "latest", a marketplace listing, a vendor recommendation, or a Studio publication cannot silently move the admission to new bytes.

A changed artifact requires another review/admission event.

## Rollback before activation

Deployment safety should be decided before activation, not after failure.

An admission record therefore requires:

- a rollback plan digest;
- a recovery objective;
- explicit admission expiry.

An artifact without an acceptable rollback path may be reviewed but is not eligible for ordinary activation under this profile.

## Activation boundary

The final distinction is:

**admitted != active**

Admission says that exact artifacts are eligible to be staged for this instance under the named conditions.

A separate fresh effect/activation decision still evaluates current policy, current authority, operational health, revocation, and any required human or institutional approval.

## Governing rule

> **Import globally if useful. Admit locally. Activate deliberately.**
