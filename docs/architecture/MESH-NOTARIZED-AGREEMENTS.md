# SPEC: Mesh-Notarized Agreements

**Status:** SPEC — **DESIGN-ONLY**. Not implemented. Not merged. No code
accompanies this document. Nothing here changes any capability status.
**Build sign-off is the project owner.**

**Date:** 2026-09-23

## 0. Purpose

Two parties can already form an agreement over email: one writes terms, the
other replies "I agree," and the exchange is the record. That works — but the
record lives in two inboxes, is trivially editable, and proves nothing to a
third party.

Mesh notarization adds a witness that neither party controls and neither has
to trust blindly: the mesh observes the exchange, canonicalizes the agreed
text, hashes it, timestamps its observation, chains it into an append-only
log, and can later prove to any verifier *this exact text was agreed by these
parties no later than this time, and has not changed since.*

This spec designs that capability. It is the mechanism behind the project's
framing: agreements between free parties, verified by infrastructure, with no
intermediary extracting rent or permission.

## 1. Canonicalization

A hash is only as meaningful as the bytes it covers. Before hashing, agreement
text is normalized to a single canonical byte sequence. Any party or verifier
performing the same normalization on the same text must arrive at the identical
bytes.

### 1.1 Canonical agreement text (CAT-v1)

1. **Encoding:** UTF-8, no BOM. Any other encoding is transcoded to UTF-8
   first; transcoding failures abort notarization (never silently substitute).
2. **Line endings:** CRLF and lone CR are converted to LF.
3. **Trailing whitespace:** stripped from every line (spaces and tabs).
4. **Trailing blank lines:** the text ends at the last non-blank line, followed
   by exactly one LF.
5. **No other transformations.** No case folding, no punctuation normalization,
   no smart-quote conversion, no reflow. The text means what it says, byte for
   byte.
6. **Scope of "the text":** the operative terms as sent (the agreement body),
   excluding transport headers, signature blocks that are not part of the
   terms, quoted reply history, and attachments. What counts as "the terms" is
   decided at intake (§3.1) and recorded in the notarization record explicitly
   (`terms_selector`: e.g. `body/plain`, `attachment[0]`).

### 1.2 Canonical record envelope (CRE-v1)

The notarization record itself is JSON, canonicalized before the notary signs
it:

1. UTF-8, no whitespace outside string values (compact form).
2. Object keys sorted lexicographically by UTF-8 code unit order, recursively.
3. Numbers as JSON numbers (no NaN/Infinity); strings as JSON strings with
   minimal escaping (`\"`, `\\`, `\n`, `\r`, `\t`, `\u00XX` for other
   controls).
4. The envelope's own signature field is computed over the envelope *without*
   the signature field present, then inserted.

Both CAT-v1 and CRE-v1 are versioned. A record declares which versions it used
(`canonical_text_version`, `canonical_envelope_version`). Future versions must
be able to verify old records — canonicalization versions are never retired,
only superseded for new records.

## 2. Record structure

```json
{
  "schema": "axiom-notarized-agreement.v1",
  "record_id": "axna-000001",
  "canonical_text_version": "CAT-v1",
  "canonical_envelope_version": "CRE-v1",

  "agreement": {
    "title": "Example: service-level commitment",
    "terms_digest": "sha256:<hex of canonical agreement text>",
    "terms_uri": null,
    "privacy_tier": "hash_only",
    "effective_date": "2026-09-23",
    "supersedes": [],
    "superseded_by": null
  },

  "parties": [
    {
      "role": "offeror",
      "display_name": "Party A (placeholder)",
      "channel": "email",
      "channel_address": "party-a@example.invalid",
      "acceptance": {
        "form": "embedded_in_offer",
        "text_digest": "sha256:<hex of canonical offer text>"
      }
    },
    {
      "role": "acceptor",
      "display_name": "Party B (placeholder)",
      "channel": "email",
      "channel_address": "party-b@example.invalid",
      "acceptance": {
        "form": "email_reply",
        "text_digest": "sha256:<hex of canonical 'I agree' reply>",
        "message_id": "<placeholder>",
        "thread_id": "<placeholder>",
        "transport_time": "2026-09-23T12:00:00Z",
        "transport_time_source": "mail provider Date header + internal date"
      }
    }
  ],

  "evidence": {
    "corroborating": [
      {
        "kind": "email_transport_metadata",
        "message_id": "<placeholder>",
        "proves": "a message with this ID existed in this mailbox at this transport time",
        "does_not_prove": "authorship beyond the email channel; see §9"
      }
    ]
  },

  "notary": {
    "observed_at": "2026-09-23T12:05:00Z",
    "observed_at_source": "mesh-notary clock (NTP-disciplined)",
    "trusted_timestamp": null,
    "prev_record_digest": "sha256:<hex of previous record's sealed envelope>",
    "notary_key_id": "axnotary-2026q3",
    "signature": "ed25519:<base64 over canonical envelope minus signature>"
  },

  "status": "sealed"
}
```

### 2.1 What each timestamp proves (and its limits)

| Timestamp | Source | Proves | Does NOT prove |
|-----------|--------|--------|----------------|
| `transport_time` (Date header / internal date) | Mail provider | A message with this ID passed through this mailbox around this time | That the Date header wasn't forged (headers are trivially spoofable); the *event* time of agreement |
| `observed_at` | Mesh notary clock | The notary first saw the complete exchange no later than this time | Anything about when the parties actually agreed — only an upper bound on observation |
| `trusted_timestamp` (optional, §8) | RFC 3161 TSA | The record digest existed at this time, per an independent authority | Anything about content or parties — only existence-at-time |

**Rule:** the mesh never presents a transport timestamp as the agreement time.
The agreement's effective date comes from the terms text itself; the mesh only
attests *observation* time. Conflating the two is the most likely way this
system could mislead, so the record keeps them in separate fields with separate
semantics, and verification output (§4) labels each one.

### 2.2 Party identifiers

v1 identifies parties by **channel + address** (e.g. `email:party@example`).
This is deliberately weak identity, honestly labeled: it proves control of an
inbox at observation time, nothing more. Stronger identity (key-bound,
attested) is a defined extension point (§7.3), not a v1 claim.

## 3. Notarization flow

From "I agree" exchange to sealed record:

1. **Intake.** A party (or their agent) submits the exchange to the notary:
   the offer message and the acceptance message(s), in full (headers + body).
   Intake records `received_at` immediately.
2. **Terms selection.** The submitter identifies which part is the operative
   terms (`terms_selector`). The notary canonicalizes per CAT-v1 and computes
   `terms_digest` (SHA-256). If the two parties' copies of the terms
   canonicalize differently, notarization **aborts** — the notary never picks a
   winner between conflicting texts.
3. **Acceptance binding.** Each acceptance is canonicalized (the reply text,
   e.g. "I agree") and hashed; the hash is bound to the party's channel
   address and the message/thread IDs that carried it. An acceptance is valid
   only if it references the same `terms_digest` it accepts — for email, this
   means the reply must be in the same thread as, or explicitly quote, the
   terms (the notary checks thread linkage; a bare "I agree" in an unrelated
   thread does not bind).
4. **Completeness check.** The record seals only when the required acceptance
   set is complete (§7). For the 2-party "I agree" pattern: one offer + one
   acceptance.
5. **Chaining.** The notary sets `prev_record_digest` to the sealed digest of
   the most recent record, forming a hash chain over the whole log.
6. **Sealing.** The notary canonicalizes the envelope (CRE-v1), signs it with
   the active notary key (Ed25519), appends it to the log, and returns the
   `record_id` + sealed digest to the submitter.
7. **Notification.** Each party's channel address receives a sealed-receipt:
   record ID, terms digest, sealed digest, and a verification bundle (§4.2).
   The receipt itself is ordinary email — it is a convenience, not part of the
   trust model.

**Failure modes are explicit, never silent:** conflicting term texts, missing
acceptance, broken thread linkage, and clock anomalies each produce a named
rejection (`TERMS_MISMATCH`, `ACCEPTANCE_INCOMPLETE`, `THREAD_UNLINKED`,
`CLOCK_ANOMALY`) returned to the submitter and logged.

## 4. Verification flow

Given a claimed agreement (a piece of text someone says is the agreed terms)
and a `record_id`:

1. **Fetch** the sealed record by ID.
2. **Re-canonicalize** the claimed text per the record's declared
   `canonical_text_version`.
3. **Recompute** SHA-256 and compare to `terms_digest`. Match → the text is
   byte-identical to what was notarized. Mismatch → the text differs;
   verification **fails**, and the verifier learns nothing about *how* it
   differs (no diff oracle — see §9.4).
4. **Verify the chain:** recompute the sealed digest of the envelope, check the
   notary signature against the published notary key, and walk
   `prev_record_digest` links back as far as the verifier cares to (full walk
   = full log integrity).
5. **Check status:** `sealed` (current), `superseded` (replaced — follow
   `superseded_by`), `revoked` (§5.3).

### 4.1 What a verifier learns

A successful verification tells the verifier exactly four things, and the
verification output states all four with nothing implied:

1. This exact text (by digest) was submitted as the terms.
2. These channel addresses accepted it (by their acceptance digests +
   message IDs).
3. The notary observed the complete exchange no later than `observed_at`.
4. The record has not been altered since sealing (signature + chain intact).

It does **not** tell the verifier the text is fair, legal, enforceable, or
understood — §9.

### 4.2 Verification bundle (offline)

Sealing returns a self-contained bundle: the canonical terms text, the sealed
record, the notary public key, and the chain of digests back to a genesis the
verifier trusts. Anyone holding the bundle can verify without contacting the
mesh. **Availability of verification must not depend on availability of the
mesh.**

### 4.3 No diff oracle

On mismatch, the verifier learns only "not identical." The notary never
answers "how close is this text?" — that would leak information about the
sealed terms to anyone holding a guess.

## 5. Supersede and revocation: version chains, never delete

### 5.1 The supersede pattern

When new terms explicitly replace earlier terms between the same parties, the
mesh models this as:

- The earlier terms, if submitted, become their own record (e.g.
  `axna-000000`), status `sealed`.
- The new record carries `agreement.supersedes: ["axna-000000"]`.
- On sealing the new record, the notary sets `axna-000000.status =
  "superseded"`, `superseded_by = "axna-000001"`.
- `axna-000000` remains in the log, fully verifiable, forever. **Supersede
  hides nothing; it only marks currency.**

If the earlier terms were never submitted, the new record's `supersedes` may
reference them descriptively — an unattested claim, labeled as such, not a
chain link.

### 5.2 General rules

- Records are **immutable once sealed**. There is no edit, no delete.
- Currency is a pointer (`superseded_by`), not erasure. The full history is
  always walkable.
- A superseding record must itself be fully notarized (complete acceptance
  set) — a unilateral "I replace this" with no counterparty acceptance seals
  as a *claim*, status `sealed`, but does not move the `superseded_by` pointer
  on the old record. Both sides' acceptance is what retires the old terms.

### 5.3 Revocation

Distinct from supersede: revocation ends an agreement with no replacement
(e.g. a 30-days-notice termination clause). Revocation is itself a notarized
record — a signed termination statement referencing the record ID — which
flips the target's status to `revoked`. Same immutability: the revoked record
stays verifiable; only its currency changes.

## 6. Privacy tiers

Parties choose per agreement, at intake. The tier is recorded in the sealed
envelope and cannot be changed afterward (changing it would change the record).

| Tier | Mesh log holds | Third parties learn | Use for |
|------|---------------|---------------------|---------|
| `hash_only` (default) | Digests only: `terms_digest`, acceptance digests, metadata digests | That an agreement with this digest existed between these channel addresses at this time; **nothing about content** | Most agreements |
| `encrypted_content` | Above + terms encrypted to the parties' public keys (X25519 sealed box per party) | Same as hash_only, plus ciphertext they cannot read | Agreements where parties want mesh-held backup without mesh-readable content |
| `plaintext` | Above + canonical terms in clear | The full terms, on request / by policy | Public commitments, open licenses — explicit opt-in only |

**Rules:**
- The mesh never stores plaintext unless the tier is `plaintext` — no
  "temporary" copies, no debug logs containing terms.
- `encrypted_content` key management is the parties' responsibility in v1: the
  notary holds ciphertext it cannot read and makes no promise about key
  recovery. Lost keys = unrecoverable content (the digest still verifies
  against a party-held copy).
- Tier downgrade (more disclosure) is a *new* record superseding the old,
  never a mutation.
- Email intake is inherently plaintext-over-transport: the privacy tier
  governs what the *mesh stores*, and the spec is honest that the email
  channel itself already exposed the text to mail providers.

## 7. Multi-party countersigning

The "I agree" pattern generalizes: an agreement seals when a **required
acceptance set** is complete.

### 7.1 Acceptance set

- The offer declares `required_acceptors`: a list of channel addresses (v1)
  whose acceptance is required. Default for the email pattern: every party
  except the offeror.
- Each acceptance is an independent signed statement over the same
  `terms_digest`: `{terms_digest, acceptor_channel, acceptance_text_digest,
  message_refs}`.
- The notary seals when every required acceptor has a valid, thread-linked
  acceptance (§3.3). Partial sets are never sealed; there is no "mostly
  agreed" state.

### 7.2 Asymmetric acceptance

An offer may already contain the offeror's written acceptance ("I wrote these
terms and agree to all of them"). The model handles this: the offeror's
acceptance is recorded with `form: "embedded_in_offer"` — bound to the offer
message itself rather than a separate reply. The record still waits for the
remaining required acceptors before sealing. **A record with only the
offeror's acceptance is `pending`, not sealed, and verifies as such.**

### 7.3 Identity hardening (extension, not v1)

v1 binds acceptance to channel addresses. The envelope reserves
`party.identity_proof` for stronger bindings later: PGP-signed acceptance,
WebAuthn-bound keys, or in-person attestation — without changing the record
schema. v1 must not claim these exist.

## 8. Enterprise hardening

### 8.1 Append-only audit trail

- The notarization log is **append-only by construction**: hash-chained
  records (§3.5), immutable once sealed, no delete API. The only mutations the
  system permits are status-pointer updates (`superseded_by`, `revoked`) on
  *other* records, which are themselves chained log entries.
- Every notary action — intake, rejection, sealing, status change — is a log
  entry. Rejections (§3) are logged with their reason codes: a failed
  notarization attempt is itself auditable.
- Log integrity is checkable by anyone holding the genesis digest + notary
  public keys: recompute the chain offline.

### 8.2 Key management

- **Notary signing keys:** Ed25519, one active key per rotation period
  (proposed: calendar quarter). Public keys published in a signed key
  directory; private keys in a hardware-backed store (HSM or equivalent —
  requirement, not implementation).
- **Rotation:** new key per period; old keys retained (read-only) forever so
  old records stay verifiable. Key compromise procedure: publish revocation of
  the key ID, rotate immediately, and re-anchor the chain head under the new
  key; records sealed under the compromised key remain verifiable but carry a
  `key_status: revoked` annotation from the revocation point.
- **Party keys (v1):** none required — the email channel is the identity.
  `encrypted_content` tier uses ephemeral X25519 per-party boxes; long-term
  party key management is explicitly out of v1 scope.

### 8.3 Retention and export

- **Retention:** sealed records are retained indefinitely by default —
  agreements are the kind of thing people need to prove decades later.
  Retention policy is per-deployment configuration, but any deletion (if
  configured) must itself be a logged, authorized, multi-party-approved
  action; silent expiry is forbidden.
- **Export:** any party can export the full verification bundle for their
  records (§4.2) at any time, in an open format (JSON + canonical text).
  Export includes everything needed for offline verification. No proprietary
  lock-in on proof.

### 8.4 Availability

- Verification bundles (§4.2) make day-to-day verification independent of mesh
  uptime.
- The log itself should be replicated across mesh nodes (replication design is
  out of scope for this spec; the requirement is that no single node's loss
  destroys the log).
- **Degraded-mode rule:** if the notary cannot reach quorum/time sources, it
  rejects new notarizations (`NOTARY_DEGRADED`) rather than sealing records
  with weak timestamps. A questionable seal is worse than no seal.

## 9. Threat model and honest limits

### 9.1 What notarization defends against

| Threat | Defense |
|--------|---------|
| A party quietly edits the terms after agreeing | `terms_digest` mismatch on verification — detectable |
| A party claims "we never agreed" | Sealed acceptance digests + thread-linked message IDs |
| A party backdates or postdates the agreement | `observed_at` upper-bounds observation; trusted timestamp (if used) anchors existence |
| Log tampering (record altered/deleted) | Hash chain + notary signatures — detectable by anyone walking the chain |
| A forged "I agree" injected into the thread | Thread-linkage check at intake; message-ID corroboration — raises the bar, see 9.3 |

### 9.2 What notarization does NOT prove (no overclaiming)

1. **Legal enforceability.** The mesh is a witness, not a court. Whether an
   email exchange constitutes a binding contract is a legal question in a
   jurisdiction; this system offers no opinion and its outputs must never be
   presented as legal proof without counsel.
2. **Identity beyond the channel.** `email:party@example` proves control of an
   inbox, not that a specific human typed the words. Phished inboxes, shared
   accounts, and delegates all break this binding, and the spec says so.
3. **Comprehension or consent quality.** "I agree" proves the reply text
   existed, not that the party read, understood, or freely chose the terms.
   Coercion, confusion, and misclicks are outside the threat model.
4. **Completeness of the agreement.** The mesh notarizes what was submitted.
   Side agreements, verbal amendments, and "but we also discussed…" are
   invisible to it unless submitted.

### 9.3 Residual risks (acknowledged, not solved in v1)

- **Email channel compromise:** if an attacker controls a party's inbox, they
  can forge acceptance. Mitigation in v1 is detection-shaped (unusual timing,
  thread anomalies flagged at intake) not prevention-shaped. Prevention is the
  identity-hardening extension (§7.3).
- **Notary key compromise:** covered procedurally in §8.2, but a compromised
  notary key lets an attacker seal false records until revocation propagates.
  Dwell time is the risk; rotation bounds it.
- **Timestamp authority trust:** `observed_at` trusts the notary's clock;
  `trusted_timestamp` (if adopted) trusts the TSA. Both are trust assumptions,
  stated in the record.
- **The "two inboxes" problem in reverse:** if the parties' email copies
  differ and only one is submitted, the notary seals the submitted one. §3.2
  aborts on *known* conflict; *unknown* conflict (one side never submits their
  copy) is undetectable. Mitigation: sealed receipts go to *both* parties
  (§3.7) so a discrepancy surfaces immediately.

### 9.4 Privacy notes

- `hash_only` records still leak metadata: who agreed with whom, and when. For
  sensitive agreements this is itself informative — parties should choose
  accordingly.
- No diff oracle (§4.3): verification answers match/no-match only.

## 10. Non-goals for v1

1. **No legal opinions.** The system never characterizes enforceability,
   jurisdiction, or contractual validity.
2. **No identity verification.** Beyond channel-address binding; no KYC, no
   biometrics, no "verified human."
3. **No dispute resolution.** The mesh witnesses; it does not arbitrate.
4. **No automatic execution.** Notarized terms do not self-execute (no
   smart-contract behavior). Execution is a separate system that may *read*
   notarized records.
5. **No on-chain anchoring.** Public-blockchain timestamping is a possible
   later anchor alongside RFC 3161, not a v1 dependency. The design must not
   require any chain, token, or fee.
6. **No redaction.** Once sealed, content cannot be selectively redacted —
   choose the privacy tier accordingly at intake.
7. **No retroactive notarization of ambiguous history.** Records work when the
   exchanges are complete and explicit. Reconstructing "we agreed in a call
   last month" from notes is out of scope.

## 11. Open questions

1. **Trusted timestamping:** adopt RFC 3161 TSA timestamps on every sealed
   record (independent existence proof, small per-record cost/dependency), or
   rely on notary-observed time alone for v1?
2. **Notary key custody:** who holds the notary signing keys, and on what
   hardware? This is the single most concentrated trust point in the design.
3. **Retention horizon:** indefinite retention is the default in this spec. Any
   agreement type that should expire instead?
4. **Plaintext tier policy:** is there any agreement class that should
   *default* to plaintext (e.g. public commitments), or should plaintext
   always require explicit per-agreement opt-in?
5. **Who may submit:** either party, or either party's agent?

## 12. Status and labels

- **Label: DESIGN-ONLY.** No implementation, no tests, no capability-registry
  entry, no production surface. Research and roadmap documents do not promote
  capabilities or change readiness status.
- Nothing in this document is a claim about any real agreement, party, or
  deployment. Examples use placeholder identities.

---

*End of spec. DESIGN-ONLY — nothing here is built, merged, or deployed.*
