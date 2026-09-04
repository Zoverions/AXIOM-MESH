# ProveX / ZKP2P Tie-In Assessment

**Status:** exploratory interoperability assessment; not an endorsement, dependency decision, token recommendation, or production integration claim.

## Why it is relevant

The PulseChain-associated ProveX project describes a peer-to-peer fiat/crypto settlement model using zero-knowledge proofs so that one party can prove an external payment condition without disclosing bank credentials to the counterparty. Public PulseChain coverage describes ProveX as a fork of ZKP2P. The underlying ZKP2P project has public repositories, including a current V2 contracts repository and an archived V1 monorepo.

The architectural pattern is relevant to AXIOM-MESH because it addresses a recurring institutional problem:

> how can one domain prove a narrowly scoped fact about an external system without transferring the underlying sensitive data or requiring the verifier to trust a human intermediary?

That pattern can apply beyond payments: eligibility proofs, credential predicates, institutional attestations, bounded compliance claims, selective disclosure, and evidence-gated workflows.

## Potential AXIOM fit

The useful integration point is not the token or chain dependency. It is a **proof-bearing external assertion adapter**.

A generic adapter could accept:

- proof system/profile identifier;
- statement type;
- issuer/source domain;
- subject binding;
- verifier identity;
- resource/audience;
- time/currentness window;
- public inputs;
- proof;
- verifier implementation digest/version;
- trust-anchor or circuit/program identifier;
- result and limitations.

AXIOM would then distinguish:

```text
proof verifies
    !=
claim is globally true
    !=
claim grants authority
```

A valid proof may become a verified input to local policy. It never bypasses local purpose, destination, consent, authority, expiry, or institutional review requirements.

## Transparency gate

Because the target use is trust infrastructure, functional usefulness alone is insufficient.

Before ProveX itself could become a trust-critical dependency, AXIOM should be able to independently inspect or verify, as applicable:

1. proof statement semantics;
2. verifier logic/contracts;
3. circuit/program/source provenance;
4. build/deployment reproducibility;
5. trust anchors and administrative control;
6. upgrade authority;
7. revocation/currentness semantics;
8. privacy leakage and metadata exposure;
9. audit history;
10. chain-specific assumptions;
11. external payment-data capture assumptions;
12. failure/dispute behavior.

If those are unavailable, the correct response is not automatically to reject the underlying idea. It is to use the research-allocation gate:

- request missing transparency;
- integrate an independent verifier where possible;
- use the open ZKP2P lineage as reference prior art;
- isolate opaque pieces behind a bounded adapter;
- reimplement only the minimum trust-critical surface if necessary and justified.

## What is promising

- selective proof instead of credential disclosure;
- local generation of proofs about external events;
- composability of verified predicates;
- potential to reduce repeated KYC/credential disclosure;
- compatibility with the Mesh principle that evidence can be strong without becoming authority;
- plausible institutional applications beyond finance.

## What remains unresolved

The public ProveX material located during this assessment is primarily product/marketing and beta coverage. A GitHub search did not locate a clearly official ProveX repository. Public coverage identifies it as derived from ZKP2P, whose public source is available, but this does not establish that ProveX deployment code, circuits, verifier configuration, upgrade keys, or trust assumptions are identical to the open upstream.

Therefore AXIOM should classify ProveX as:

**candidate: augment / interoperate after transparency verification**

rather than:

**dependency: trusted infrastructure**

## Research direction

Build the generic proof-bearing assertion boundary first.

That lets AXIOM interoperate with ProveX, ZKP2P, future zkTLS/notary systems, verifiable credentials, institutional proof systems, or other selective-disclosure technologies without hard-coding any one chain, token, proof system, or vendor into the core.

The novel AXIOM contribution would be the composition layer:

**proof verification + source transparency + currentness + local policy + authority separation + evidence receipt**

rather than rebuilding zero-knowledge cryptography itself.
