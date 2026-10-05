# Offline machine holder presentation v0

This source slice verifies that the private key corresponding to an existing
issuer-signed machine identity credential answered one verifier challenge. It is
an offline, synthetic evidence helper in `mesh/src/lib/machine-holder-presentation.mjs`.
It adds no route or authority and does not change the `identity.ssi` registry
status (`specified`).

The verifier supplies the full credential, an independently pinned issuer
Ed25519 public key and issuer ID, expected principal ID, audience ID, purpose,
unpredictable fresh nonce, and evaluation time. The holder signs the credential
digest and key identity, audience, purpose, domain-separated nonce digest, and
an issuance/expiry interval no longer than five minutes. The verifier checks
the issuer credential with the existing machine identity verifier, confirms
the holder signature with the credential's operational key, and enforces the
exact challenge, audience, purpose, and time window.

The verifier may supply issuer-signed revocations and previously consumed proof
or nonce digests. Every supplied revocation is verified, and one effective against this
credential rejects the proof. The caller must obtain and maintain complete
revocation evidence from its chosen source; this helper cannot discover missing
revocations or prove global currentness. The caller must persist consumed nonce
digests across requests to reject a newly signed proof for the same challenge;
consumed proof digests only reject replay of identical signed bytes. A fresh,
unpredictable nonce and an `at` value from the verifier's own trusted clock are
the verifier's responsibility. Backdating `at` can accept an otherwise expired
proof. A returned `valid` result does not claim that any caller-supplied
evidence set is complete.

The full issuer credential is supplied separately and remains visible to the
verifier; there is no selective disclosure. A valid result asserts possession
of one credential-bound machine key under the supplied trust anchor and
challenge. It asserts no DID, legal identity, personhood, reputation, present
credential status across other sources, delegation, runtime permission, or
production deployment. In particular, credential contents and signature do
not grant execution authority.
