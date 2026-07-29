# Deprecated Credential-History Revocation

**Status date:** 2026-07-29

**Scope:** repository trust for the `0.12.0-dev.0` supported development build

**Archived boundary:** `archive/legacy-main-pre-clean-room-2026-05-21` at
`e65041cb6828a8923e87a3678a104ac40bbf0970`

This record separates a result that the repository can prove from work that
only a former credential custodian can prove. AXIOM-MESH can deterministically
inventory credential candidates in deprecated Git objects, revoke them from
the supported trust boundary, and reject their reuse in the supported tip. It
cannot infer whether a historical value was installed at an outside provider
or deployment, nor can it manufacture that provider's revocation receipt.

## Repository trust result

The versioned
[`credential-revocations.json`](../../mesh/config/credential-revocations.json)
ledger covers 32 distinct credential-candidate fingerprints across every
reachable object in the immutable pre-clean-room archive graph. The scan
inspected 9,630 objects, including the annotated archive tag, and all 3,466
blobs, including provider-token pattern checks in archived binaries. No
reachable blob exceeds the 64-MiB content bound; an oversized high-risk path
would fail the audit rather than be silently skipped.

The conservative inventory includes:

- four private-key candidates;
- two provider-token pattern matches;
- three otherwise-unparsed high-risk secret files;
- 24 sensitive configuration assignments.

Categories may overlap for one value, so their counts do not sum to the
distinct total. Test and example constants may be present in the conservative
set; inclusion does not claim that a candidate was ever live.

All 32 identifiers are marked `revoked` under the
`supported-clean-room-trust-boundary` authority. This means no value in the
ledger may authenticate a supported service, API client, data store, provider,
or release process. The protected workflow rescans the deprecated graph,
requires exact agreement with the ledger and immutable deprecated tip, scans
the current supported tree, and fails if any historical identifier is
reintroduced.

## Safe fingerprint design

The scanner never writes a token, password, private key, or secret-bearing Git
object to logs or evidence. Each candidate is normalized in memory and
identified as:

```text
HMAC-SHA256(audit-key, "AXIOM-CREDENTIAL-HISTORY-V1\0" || candidate)
```

The 256-bit audit key is a GitHub Actions secret named
`AXIOM_CREDENTIAL_AUDIT_KEY`. It is not a deployment credential and grants no
runtime authority. Keeping it outside the repository prevents the committed
ledger from becoming a practical offline oracle for low-entropy passwords.
The ledger records only the SHA-256 identifier of that random audit key so CI
can reject the wrong key.

Safe ledger metadata consists of the keyed identifier, candidate class,
configuration label, historical path, bounded occurrence count, repository
revocation result, and external disposition. Git object identifiers and
candidate values are not evidence fields.

## Continuous verification

Protected CI uses a full-history checkout and runs:

```bash
npm run credential-history:audit
```

The command fails closed when:

- the audit key is missing, malformed, or different from the ledger key;
- the immutable archive tag or recorded tip cannot be resolved;
- a high-risk blob exceeds the scanner's safe size bound;
- a candidate is missing, added, reordered, or has changed metadata;
- an entry is not revoked from repository trust;
- a deprecated fingerprint appears in the supported tip;
- an external disposition or claimed receipt is malformed.

Success emits Ed25519-attested, secret-free JSON. The protected workflow binds
the artifact name to the source commit and retains it for 90 days. The
ephemeral evidence signer proves artifact integrity; the protected workflow
and commit provide provenance. It is not an external provider attestation.

Local operators who possess the audit key may set
`AXIOM_CREDENTIAL_AUDIT_KEY` and
`AXIOM_GIT_EXECUTABLE` when Git is not on `PATH`. Never place the key in a
command argument, shell history, repository file, workflow log, or support
ticket.

## External attestation procedure

Every initial entry is `attestation-required`. That is deliberately
conservative: repository evidence cannot distinguish a fixture that never
left source control from a credential installed in an old provider account.
Production promotion remains blocked until an accountable security owner
disposes each entry.

For each keyed entry:

1. Use only its labels and historical paths to identify the likely system and
   custodian. Do not restore or print the historical value.
2. Search authorized provider, secret-manager, deployment, and incident
   records for the matching credential context.
3. If it was externally usable, revoke or disable it at the authority that
   accepted it. Obtain a time-bound provider or custodian receipt.
4. Store the receipt in the approved restricted evidence system. Add only its
   stable reference, SHA-256 digest, and verification timestamp to the ledger;
   do not commit the receipt if it contains sensitive account data.
5. Set the entry to `verified` only after an independent reviewer confirms the
   receipt and digest.
6. Use `not-applicable` only when the owner and reviewer can establish that
   the candidate was a non-credential fixture or never had an accepting
   authority. Record a specific rationale; do not use a blanket assertion.
7. Rerun protected CI and retain its signed summary.

An entry left `attestation-required` does not weaken repository revocation,
but it remains a production-promotion blocker. The ledger summary must report
zero pending entries before external revocation is described as complete.

## Audit-key rotation and incident handling

Rotate the audit key if workflow logs, runner isolation, or maintainer access
could have exposed it. Generate a new random 32-byte key, regenerate the
complete ledger without changing reviewed external dispositions, update the
GitHub Actions secret through standard input, and merge both changes through
the protected workflow. Never attempt to derive a replacement from the prior
key.

A failed reuse comparison is a security event. Do not add an allowlist for the
matching identifier. Remove the candidate from the supported tree, provision
new credentials outside Git, determine whether the value was accepted
anywhere, rotate affected trust, and attach the resulting external evidence.

## Residual limits

The scanner detects private-key blocks, provider-token formats, sensitive
assignments, basic-auth URLs, and high-risk secret files in bounded Git blobs.
It does not prove the absence of steganographic, encrypted, split, compressed,
or unknown credential formats. GitHub secret scanning and independent review
remain complementary controls.

The current result is therefore precise: repository trust revocation is
complete for the immutable archived inventory; outside-provider and
prior-deployment revocation is not complete while any entry remains
`attestation-required`.
