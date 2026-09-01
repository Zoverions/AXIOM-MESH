# Cross-Domain Data Residency and Selective Disclosure

**Status:** experimental interoperability architecture; not a legal-compliance determination.

Recognition answers whether one domain is willing to consider another domain's evidence.

It does **not** answer whether the underlying data may cross the boundary.

AXIOM therefore treats data residency and disclosure as separate policy dimensions.

```text
claim/request
  -> recognition / verifier eligibility
  -> data-class policy
  -> purpose + audience
  -> residency check
  -> disclosure minimization
  -> retention constraint
  -> bounded export / proof / denial
```

## Prefer proof over record movement

If a relying institution only needs to know whether a prerequisite was completed, it should not automatically receive a full transcript.

Where an independently verifiable predicate is sufficient:

```text
full record stays local
  -> proof generated
  -> bounded predicate disclosed
  -> verifier checks proof
  -> local decision
```

This is both a privacy improvement and a trust improvement because fewer systems need custody of sensitive source records.

## Residency is not one bit

Useful modes include:

- unrestricted;
- named jurisdictions only;
- named institutions only;
- local domain only;
- local device/enclave only;
- air-gapped only.

A record can be encrypted and still violate its residency policy.

Encryption protects confidentiality. It does not authorize movement.

## Metadata matters

Derived metadata must be classified separately.

A proof may hide the underlying transcript while still exposing:

- institution identity;
- timestamp;
- verification frequency;
- subject pseudonym;
- network route;
- proof type.

Those can be sensitive and should not be treated as free merely because the payload is cryptographic.

## Retention

Cross-domain disclosure should state:

- whether recipient retention is permitted;
- maximum retention window;
- deletion/expiry policy;
- whether a verifier may cache only the proof or also the disclosed fields.

A recipient's technical ability to retain data is not the same as permission to retain it.

## Offline and air-gapped transfer

Residency and disclosure constraints survive loss of connectivity.

A removable-media transfer into an enclave still requires:

- exact destination authorization;
- permitted data class;
- minimal disclosure;
- confidentiality handling;
- local import quarantine where applicable;
- retention/deletion rules.

## Relationship to recognition

Recognition profiles identify evidence the relying institution may accept.

Disclosure policy separately says what the issuer may reveal.

The safe composition is:

```text
recipient may accept X
    +
sender may disclose only Y
    ->
actual exchange = intersection(X, Y)
```

Neither side can widen the other's policy.

## Governing rule

**Recognize narrowly. Disclose minimally. Keep sensitive source data where it belongs whenever a proof can do the job.**
