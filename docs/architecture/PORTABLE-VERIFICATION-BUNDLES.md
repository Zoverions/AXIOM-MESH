# Portable Verification Bundles

**Status:** experimental architecture; no production packaging or cryptographic claim.

A local or air-gapped AXIOM deployment should not need a permanent connection to a central verifier merely to check evidence it is already equipped to verify.

At the same time, offline operation must not turn cached trust into permanent trust.

A portable verification bundle packages the **verification context**, not the authority.

It can carry:

- verifier identities and exact implementation/artifact digests;
- assertion profiles;
- trust-anchor digests;
- local trust-profile identifiers;
- policy digest;
- freshness and expiry rules;
- revocation/currentness requirements;
- offline validity window;
- limitations.

This enables a school, research lab, field team, government administrative enclave, or air-gapped review environment to verify bounded claims locally while keeping the distinction between:

```text
proof can be checked offline
        !=
external state is still current
        !=
requested effect is authorized
```

## High-consequence rule

If local policy says a decision requires fresh external currentness or revocation state, then disconnection cannot convert that requirement into success.

The permitted outcomes are explicit:

- deny the required proof;
- hold the operation pending reconnect;
- downgrade the evidence to advisory use only.

## Reconnection

When connectivity returns, the node should revalidate required currentness/revocation material and append reconciliation evidence. It should not rewrite history to pretend the original offline verification included checks that were unavailable at the time.

## Why this matters

Portable verification helps avoid central-service lock-in while preserving transparency and institutional autonomy.

It also gives independent verifiers practical value: the exact verifier implementation can be carried into a controlled environment, reproduced, inspected, and run locally.

That is particularly useful for institutions whose trust requirements make opaque online-only verification unacceptable.

## Authority boundary

The bundle itself has:

```text
authority_effect = none
```

A successful local verification becomes an evidence input. Consequential actions still require ordinary local effect admission.
