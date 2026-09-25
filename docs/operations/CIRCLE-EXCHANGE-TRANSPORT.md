# Circle exchange transport (laboratory, off by default)

**Updated:** 2026-09-25

**Status:** laboratory. Built and tested, but nothing starts it, and it runs
only from a configuration that sets `"enabled": true`.
**Applies to:** AXIOM-MESH `0.12.0-dev.3` development build
**Code:** `mesh/src/lib/circle-transport.mjs`, `mesh/src/lib/circle-peer.mjs`,
`mesh/src/circle-peer.mjs`
**Non-claim:** this grants no authority, executes no effect, and is not
consensus. It is not wired into the Grid, the Gateway, the supervisor or any
capability. It adds no Gateway route and changes no network policy.

A Circle has many owners. Each member's own node writes only that member's
records. `circle-exchange.mjs` defines how replicas compare heads and exchange
bounded bundles of self-verifying updates, and how every replica derives the
same Circle from them. This transport carries that protocol between members'
nodes over HTTPS.

## Protocol

Two routes, both `POST` with a JSON body of `{ request, payload }`:

- `/circle/v0/pull`: the payload is the caller's heads
  (`axiom-circle-heads.v0`). The node answers `axiom-circle-sync-response.v0`
  with the bundle the caller lacks and the node's own heads.
- `/circle/v0/offer`: the payload is a bundle
  (`axiom-circle-exchange-bundle.v0`) computed from the node's heads. The
  node applies it, checking every update as if it had arrived alone, and
  answers `axiom-circle-sync-receipt.v0` with a summary and its new heads.

Every answer carries a node statement (`axiom-circle-node-statement.v0`),
signed with the serving member's Circle key. It binds:

- the Circle's genesis digest and the operation;
- the digest of the exact request it answers;
- the digest of the exact answer (bundle or summary, and the node's heads);
- the time it was issued.

The caller checks the bindings before using an answer, so an answer changed
in transit, or one written for another request, is refused before anything
applies. It checks the signature after applying a pull, because the bundle
may be what introduces the node's key. A node key the caller still cannot
place leaves the answer unattributed. Its updates still apply, since each
verifies on its own. A statement signed under the node's name with another
key is refused. The node's latest verified statement is kept with the
caller's encrypted state and shown by `status`.

A sync with one peer pulls until the node's bundle is complete, then offers
until the node has everything. A round that makes no progress stops the sync
instead of looping, and a sync has at most 64 rounds. Offer lets a member
whose node accepts no connections, such as a laptop, still publish its updates.

## Who may sync

The Circle decides. Every request (`axiom-circle-sync-request.v0`) is signed
with the caller's Circle key and binds:

- the Circle's genesis digest;
- the operation (a pull cannot be replayed as an offer);
- the digest of the exact payload;
- a time within two minutes of the node's clock;
- a fresh nonce.

The node checks the signature against the key announced for that principal.
It then derives its own view as of now, and answers only if:

- the Circle established the key (the creator's key, or one an administrator
  endorsed with proof of possession, or a rotation of it);
- the key is still active (not revoked or rotated);
- its principal is either a member in standing, or someone endorsed to join
  who has never held a membership. Such a person's acceptance lives in their
  own log, so they must be able to publish it.

A former member (exit or ended membership, in any charter period), a revoked
or rotated key, and a stranger are refused. A request is refused before its
nonce is recorded, so a refused request cannot burn a member's nonce, and an
unauthenticated one costs a signature check, not a view.

Each Circle key has a request budget of 120 requests, refilled at 2 per
second. The budget is checked after authentication, so a stranger cannot
spend a member's budget. A request over budget is refused before its nonce is
recorded, so it can be retried unchanged.

Refusals: `401 unauthenticated`, `401 stale`, `401 payload_mismatch`,
`403 not_a_member`, `404 unknown_circle`, `409 replayed`,
`429 rate_limited`, `400 wrong_operation` or `malformed`, `413` when a
request exceeds about 1.1 MB, `503 busy` when replay protection is full.

## What the transport does not protect

- **Withholding is attributable, not prevented.** A node can still leave
  updates out of what it serves. Its signed statements record what it
  claimed to hold (its heads) and when, so a member holding a newer update
  from that node's own log, or seeing another node serve more, has signed
  evidence. Nothing compares statements automatically yet. Syncing with
  several members' nodes narrows withholding, and the per-key hash chains
  make gaps inside a log visible.
- **Read access is membership, not role.** Any member in standing, or anyone
  endorsed to join, can read the whole Circle. There is no per-record
  disclosure yet.
- **Clocks.** A node's clock decides both the two-minute window and who is in
  standing "now".
- **Capacity.** A replica holds at most 4,096 updates and 1,024 pending ones.
  The transport inherits those bounds.

## Running a node

The command accepts HTTPS only. Plain HTTP exists only for the in-process
tests and cannot be selected from the command.

```bash
npm run circle:peer -- status /abs/path/circle-peer.json
npm run circle:peer -- sync   /abs/path/circle-peer.json   # one pass with every peer
npm run circle:peer -- serve  /abs/path/circle-peer.json   # serve, and sync every interval
```

Example configuration (`axiom-circle-peer-config.v0`). It and every secret
it names must be private files (not group- or other-readable), and every
path must be absolute:

```json
{
  "schema": "axiom-circle-peer-config.v0",
  "enabled": true,
  "genesis_file": "/srv/circle/genesis.json",
  "member": { "principal_id": "bob", "private_key_file": "/srv/circle/member.pem" },
  "state_file": "/srv/circle/state/circle.sealed",
  "state_key_file": "/srv/circle/state.key",
  "listen": {
    "host": "0.0.0.0",
    "port": 8443,
    "tls_key_file": "/srv/circle/tls.key.pem",
    "tls_cert_file": "/srv/circle/tls.cert.pem"
  },
  "peers": [
    {
      "origin": "https://alice-node.example:8443",
      "ca_file": "/srv/circle/alice-ca.pem",
      "server_name": "alice-node.example"
    }
  ],
  "sync_interval_seconds": 300
}
```

- `enabled` must be the literal `true`. Anything else, including a missing
  field, refuses to start.
- `member.private_key_file` is the member's Ed25519 Circle key (PKCS#8 PEM).
  It signs requests. Keep it on the member's own node.
- `state_key_file` holds 32 random bytes (base64url). The replica is stored
  sealed under it, bound to this Circle's genesis. On load, every stored
  update is checked again.
- `listen` is optional (a node that only syncs out needs none). It requires
  a TLS key and certificate and serves TLS 1.3 only.
- Each peer is an exact `https://` origin. `ca_file` pins a private CA, since a
  member's node rarely has a public certificate. `server_name` names the
  certificate identity when the origin is an address.
- One process owns the state at a time: `serve` holds a lock beside the
  state file, so a concurrent `sync` is refused instead of overwriting
  updates the server accepted. Saves within that process are serialized, so
  an older snapshot cannot finish after and replace a newer one.
- If a peer disconnects after a pull has accepted updates, the node saves
  those updates before reporting the peer as failed. A later sync can resume
  from the persisted heads.

## Evidence

`mesh/test/circle-transport.test.mjs`:

- Members' nodes converge over pull and offer, including a member who has not
  joined anywhere yet. Any member's node can serve another.
- Refusals are covered:
  - strangers;
  - a forged signature under a member's key id;
  - one key speaking for another principal;
  - a swapped payload;
  - a pull replayed as an offer;
  - stale and future times;
  - a replayed nonce;
  - another Circle;
  - malformed input.
- A refused request records no nonce, and a stranger's offer changes nothing.
- Former members and revoked keys are refused after their exit or revocation
  takes effect, and answered before it.
- Two nodes sync over HTTPS with a pinned CA through the command. Their state
  survives a restart, is unreadable without its key, and a peer outside the
  pinned CA fails without stopping the others. The serving node's lock
  refuses a concurrent sync.
- The configuration gate refuses:
  - `enabled` other than `true`;
  - plain HTTP;
  - a listener without TLS;
  - a non-origin URL;
  - a group-readable key.
- The HTTP layer answers only its two routes, `POST` and JSON only, and
  bounds request size.
- Accepted updates survive a later failure in the same peer sync.
- Every answer is a node statement for exactly its request and answer:
  - an answer with an update withheld in transit is refused before anything
    applies;
  - a genuine answer to another request is refused;
  - a statement signed under the node's name with another key is refused;
  - an unplaceable node key leaves the answer unattributed while its updates
    apply.

  The latest verified statement is kept in the encrypted state.
- Each key's budget is its own:
  - strangers never touch a member's budget;
  - an over-budget request is answered once the bucket refills, with the same
    nonce.

Each of these fails when its protection is removed:

- the signature check;
- the membership check;
- the former-member rule;
- the endorsed-to-join rule;
- the operation binding;
- the clock window;
- the payload binding;
- replay refusal;
- recording the nonce only after authentication;
- the `enabled` gate;
- the state lock;
- persisting an offer;
- the statement's answer binding;
- the statement's request binding;
- the statement signature check;
- checking the bindings before applying;
- the request budget;
- spending the budget before recording the nonce;
- keeping the latest statement.

## Before activation

This transport opens network connections between people's own nodes, so
running it anywhere beyond a test is an activation decision. Open questions
before that decision:

- per-record disclosure;
- comparing statements across nodes to flag withholding automatically;
- a registry entry under the capability lifecycle.

Per-member rate limits and signed answers, which were earlier on this list,
are now built (above).
