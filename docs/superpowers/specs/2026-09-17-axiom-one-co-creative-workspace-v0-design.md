# AXIOM One Co-Creative Workspace v0 — Design

## Status

Implementation tranche for Axiom One programme issue #1610 after C0 Persistent Entity Bundle v0 and C1 Canonical Shared Artifact v0.

## Goal

Give human and agent principals one shared editing model over the same canonical artifact without creating a second authority, persistence, conflict, or execution plane.

The first tranche is intentionally core-only and effect-inert. It proves that human edits, agent edits, rejection, acceptance, stale-base protection, and revert semantics can all share the C1 causal artifact contract before any browser write route or durable workspace capability is promoted.

## Boundary

A co-creative proposal is **not** a canonical revision and confers no authority. It is a bounded reviewed-change object tied to:

- one canonical artifact id;
- one exact canonical artifact digest;
- one current causal head;
- one human or agent principal;
- one proposed payload and its canonical digest;
- one rationale and proposal timestamp.

Every proposal is explicitly:

- `authority_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`.

No service actor may impersonate the human/agent co-creative path in v0.

## Review and commit semantics

`reject` is effect-free and leaves the canonical artifact unchanged.

`accept` is allowed only when all of the following remain true:

1. The proposal targets the same artifact.
2. The canonical artifact digest is unchanged since proposal creation.
3. The current causal head is unchanged.
4. The artifact is active and has exactly one current head.
5. Explicit authorization evidence is supplied by the caller.
6. The resulting appended revision passes the existing C1 semantic validator.

Acceptance therefore does not mint authority. It consumes separately supplied authorization evidence and appends a normal C1 `put` revision through the same canonical history used by human and agent edits.

## Conflict policy

Workspace v0 fails closed when the canonical artifact has multiple current heads. It does not silently choose a winner, linearize concurrent edits, or overwrite a branch. C1 already requires an explicit `resolve` revision naming every current head; a later workspace tranche may expose that operation only after its review UX and authorization path are separately proven.

## Revert policy

Revert is not deletion. A revert proposal copies the payload of an earlier content-bearing revision into a new reviewed proposal. If accepted with explicit authorization evidence, it appends a new canonical revision. All intervening revisions remain in history.

## Browser and Gateway non-claims

This tranche does **not**:

- add a browser persistence route;
- add a Gateway capability;
- add a new Grid record kind;
- activate sharing, Circles, federation, or external AI;
- create a hidden model-edit path;
- claim production promotion.

The browser workspace comes next and must consume this core contract rather than implement its own revision or authority logic. Durable writes must continue to cross the reviewed Gateway → policy → execution → evidence boundary; the browser must never be able to manufacture authorization evidence.

## Verification requirements

Tests must prove:

- human and agent edits use the same proposal contract;
- proposals remain authority/network/runtime inert;
- rejection does not mutate canonical state;
- acceptance without authorization evidence fails closed;
- authorized acceptance produces a valid C1 artifact revision;
- stale proposals cannot overwrite a newer head;
- revert appends history rather than deleting it;
- conflicts and service actors fail closed;
- tampered proposal payloads cannot be committed because C1 content-digest validation rejects them.

## Next tranche

After this core is exact-head green, add the AXIOM One browser workspace as a neutral inspect/edit/review surface. It may display proposal rationale, actor kind, base head, and evidence requirements, but must not add durable mutation until a separately bounded Gateway action can carry an accepted revision through existing authorization and receipt machinery.
