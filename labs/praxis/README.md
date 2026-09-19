# Praxis language laboratory v0

Praxis is an experimental AXIOM-oriented programming language.

Its core invariant is:

```text
Knowledge != Operation != Authority != Execution
```

The purpose of this laboratory is to test whether those boundaries can be made
language semantics rather than conventions implemented repeatedly in
application code.

## Current state

Praxis v0 is **built only as an inert laboratory**.

The P0 language core exists. Initial P1 semantic-corpus and P2 pure differential
evidence also exist, but those are research/conformance milestones, not runtime
promotion. Praxis remains production-unreachable.

It is not enabled as an AXIOM runtime, is not network exposed, is not
production promoted, and grants no Mesh, Grid, Hypervisor, Sandbox, repository,
credential, deployment, spending, or external-effect authority.

The CLI supports only parsing, static checking, and IR inspection. It has no
`run` command.

Compiled IR is sealed with a canonical module digest, but the runtime does not
treat that digest as proof that the compiler was trustworthy. Hand-edited,
re-sealed IR is an explicit adversarial input: the runtime re-checks authority
kind, exact-plan binding, quorum threshold, information-flow restrictions, and
prepared-effect terminal linearity before an effect can advance.

The embedding API contains a `run()` function solely for conformance testing
and future host integration. A consequential operation must cross both
`authorize` and `prepare` before `commit`. Preparation fails closed unless
the host returns durable evidence bound to the exact operation digest. Commit
then requires an injected executor plus a separate durable completion recorder.
The language runtime itself contains no network, filesystem-write, subprocess,
provider, credential, or Grid executor.

## Why this exists

Conventional languages usually let code discover information and immediately
turn it into side effects if the process happens to possess ambient privilege.
Praxis instead represents the transitions explicitly:

```text
Observed<T>
    |
    v
Verified<T, Policy>
    |
    v
Assessment<T>
    |
    +--------------------+
                         |
Operation ---------------+
    |
    v
AuthorizedOperation
    |
    v
PreparedOperation
    |
    v
Commit
    |
    v
Receipt
```

An assessment is never a permit. An operation is inert until explicitly
authorized, and authorization alone is still not executable. Durable
preparation must succeed first. Authority is linear. Uncertain execution or an
unverified receipt leaves the effect in the prepared state rather than
fabricating completion.

## Small example

```prax
requires permit deploy_prod: Deploy @ Production;

observe source_commit = "sha256:abc123" from "git:main";
verify verified_source = source_commit with GitIntegrity;
assess release_candidate = verified_source with ReleasePolicy;

op release = Deploy(verified_source) @ Production;
authorize release using deploy_prod as armed_release;
prepare armed_release as prepared_release;
commit prepared_release as release_receipt;
```

The source code does not mint `deploy_prod`. It declares an authority
requirement. A host must provide a matching authority token bound to the exact
operation digest that may be armed.

Time-bounded authority is expressed as a lease:

```prax
requires lease deploy_window: Deploy @ Production;
op release = Deploy("artifact") @ Production;
authorize release using deploy_window as armed_release;
prepare armed_release as prepared_release;
```

The embedding host must provide a matching `createHostLease(...)` token. The
runtime denies it when expired, explicitly revoked, mismatched, or previously
consumed.

Collective authority is explicit rather than emergent:

```prax
requires quorum release_gate: Deploy @ Production
    threshold 2 of Operator, Security, Provider;

op release = Deploy("artifact") @ Production;
authorize release using release_gate as armed_release;
```

A host `createHostQuorum(...)` envelope must match the exact member set,
threshold, and operation digest. Ordinary permits are not pooled, votes are not
authority by themselves, and a quorum for one action/scope/plan cannot
authorize another.

`createHostPermit(...)` and `createHostLease(...)` are laboratory embedding
APIs. Each laboratory token is bound to one exact operation digest. They are
not a secure production issuer and must never be exposed to untrusted Praxis
source, agents, plugins, or remote callers. A future AXIOM adapter must derive
these runtime objects only from already-authorized AXIOM evidence; the factory
functions themselves do not create AXIOM authority.

### P0.2 chartered authority path

The stronger synthetic authority path lives outside governed `.prax` source.
`createSyntheticCharter(...)` produces an Ed25519-signed charter that pins
principal kinds, optional agent→principal bindings, policy definitions and
verifier definitions. Policy/verifier content digests are part of the signed
charter, so changing a quorum, evidence requirement, verifier origin or
advisor changes the pin and is refused.

Authority-grade observations are separately signed. A charter-pinned verifier
checks the observation signer, exact origin and freshness before producing a
runtime-branded `Verified` value. That verified evidence may satisfy a pinned
authority premise; an `Assessment` cannot. Legacy `observe` plus a generic
host verifier may still create an ordinary `Verified` value for P0
compatibility, but it is not runtime-branded authority evidence and cannot
satisfy a chartered authority premise. Evidence freshness is checked when
chartered authority is issued and again immediately before `commit` invokes
the synthetic executor.

For chartered quorum authority, approvers sign an exact request containing the
charter/policy digest, operation digest, evidence digests, requester, nonce and
expiry. The issuer verifies Ed25519 signatures, distinct principals, requester
self-exclusion and any human minimum. A pinned advisor is run by the issuer and
may veto only; missing, malformed or throwing advice fails closed.

The older raw host-token constructors remain available solely to preserve the
P0 embedding/conformance surface. They are **not** the authority-grade path.
A chartered token carries its charter/policy/evidence bindings and the runtime
refuses to use it unless the same signed charter is supplied under a trusted
root.

A charter may also pin one or more exact `praxis-ir.v0` module digests.
When program pins are present, the runtime refuses any source or re-sealed IR
whose module digest is absent from the signed charter. This is separate from
the IR's self-digest: self-sealing detects accidental mutation, while the
charter pin says which reviewed program the operator actually approved.
Runtime invariant re-checks remain mandatory even for pinned IR.

Secrets are represented separately from values:

```prax
requires secret signing_key: SigningCredential;
op sign = Sign("sha256:...") @ Local using secrets signing_key;
```

The host supplies an opaque `createHostSecretRef(...)` surrogate. Praxis source
cannot read secret bytes, observe the secret as knowledge, or pass the secret
reference as an ordinary operation argument. The operation carries only the
opaque reference identifier and declared secret kind. The factory is a
laboratory reference constructor, not a secret manager or credential resolver.

Durably prepared effects can also be re-imported for replay:

```prax
requires prepared prior: Deploy @ Production;
commit prior as receipt;
```

The host must supply a branded `createHostPreparedRef(...)` bound to the exact
operation, authority evidence, and durable preparation digest. The preparation
digest becomes the executor idempotency key. An uncertain replay does not
consume the prepared reference; successful completion or durable cancellation
does. This supports recovery without minting a second permit.

Cancellation is a terminal transition:

```prax
requires prepared prior: Deploy @ Production;
cancel prior as canceled;
```

Rollback is deliberately **not** a generic v0 primitive. Different effects have
different compensating-action semantics, so rollback remains an explicit
conformance gap rather than pretending every effect can be reversed uniformly.

## v0 grammar

```text
requires permit <name>: <Action> @ <Scope>;
requires lease <name>: <Action> @ <Scope>;
requires quorum <name>: <Action> @ <Scope> threshold <N> of <member>, ...;
requires secret <name>: <SecretKind>;
requires prepared <name>: <Action> @ <Scope>;
observe <name> = <literal-or-reference> from "<provenance>";
verify <name> = <knowledge> with <Policy>;
assess <name> = <knowledge> with <Policy>;
op <name> = <Action>(<args...>) @ <Scope> [using secrets <name>, ...];
authorize <operation> using <permit-or-lease> as <name>;
prepare <authorized-operation> as <name>;
cancel <prepared-operation> as <cancellation-receipt>;
commit <prepared-operation> as <receipt>;
```

Comments begin with `//` or `#`.

## Static guarantees in v0

The compiler rejects:

- committing before durable preparation;
- preparing an operation without authority;
- authorizing with an assessment, receipt, or other non-authority value;
- action/scope mismatches between an operation and permit/lease/quorum;
- invalid quorum thresholds or duplicate member declarations;
- reuse of a linear permit or lease in one program;
- repeated preparation or multiple terminal transitions of a linear operation;
- embedding a permit, lease, prepared operation, or secret reference as an ordinary operation argument;
- binding a non-secret value through the secret-reference channel;
- verification of non-evidence values;
- undeclared bindings and duplicate bindings.

The runtime additionally rejects:

- tampered or malformed IR before interpretation;
- hand-edited IR that attempts to bypass runtime kind, flow, or linearity checks;
- absent, forged, mismatched, expired, revoked, already consumed, or wrong-plan host authority tokens;
- quorum envelopes with the wrong membership, threshold, or insufficient approvals;
- untrusted/tampered charters, policy/verifier pin drift, or one key occupying multiple charter seats;
- forged, wrong-origin, stale, or wrong-signer authority-grade observations;
- chartered authority built from non-Verified evidence or used without its trusted charter;
- approval replay, requester self-approval, invalid signatures, or failure of a pinned human minimum;
- missing/malformed pinned advisor results and explicit advisor vetoes;
- absent, forged, or wrong-kind opaque host secret references;
- missing verifier or assessor implementations;
- verification/assessment results without explicit `ok: true`;
- preparation without a host durable preparer;
- preparation evidence not bound to the exact operation;
- `commit` without both an executor and durable completion recorder;
- uncertain executor outcomes or unverified receipts as completed effects;
- completion evidence not bound to the same operation and preparation;
- reuse of an imported prepared effect after durable completion or cancellation.

## IR

Praxis compiles to `praxis-ir.v0`. Its initial instruction set is deliberately
small:

```text
REQUIRE_PERMIT
REQUIRE_LEASE
REQUIRE_QUORUM
REQUIRE_SECRET
OBSERVE
VERIFY
ASSESS
PLAN
AUTHORIZE
PREPARE
CANCEL
COMMIT
```

This is intended to remain inspectable by humans, policy engines, formal tools,
and AI reviewers before any future lowering into an executable backend.

## CLI

Check a program:

```bash
node labs/praxis/cli.mjs check labs/praxis/examples/release.prax
```

Inspect the IR:

```bash
node labs/praxis/cli.mjs ir labs/praxis/examples/release.prax
```

There is intentionally no CLI command that executes effects.

## Hypothesis

A language that separates epistemic state, proposed operations, authority, and
execution can make AXIOM's core trust boundaries easier to audit and harder to
bypass than implementing those boundaries only through framework conventions.

## Threat model for this slice

The laboratory assumes source text may be malicious or agent-generated.

It specifically defends against:

- a program treating an AI assessment as authority;
- accidental ambient privilege;
- authority reuse;
- action/scope substitution;
- authority smuggling inside operation arguments;
- secret-reference smuggling into ordinary value channels;
- external I/O before durable preparation;
- uncertain operator outcomes being promoted to success;
- synthetic success from a missing or malformed executor receipt;
- completion being claimed without durable completion evidence;
- governed source or re-sealed IR weakening a charter-pinned quorum;
- evidence expiring between authorization/preparation and external execution.

This slice does not claim protection from a malicious embedding host,
compromised Node.js runtime, hardware compromise, or an executor that lies while
still producing a structurally valid receipt. It also does not claim formal
compiler correctness. Instead, the current authority/runtime invariants are
tested against hand-edited, re-sealed IR so a compiler defect cannot by itself
turn those tested violations into authority.

## Ground-up AXIOM rewrite boundary

Praxis may eventually become a candidate implementation language for parts of
AXIOM-MESH. That is **not** the current state.

A ground-up rewrite must not begin by allowing Praxis to bypass the existing
authority path. Instead, migration should proceed through differential
conformance:

1. express existing AXIOM authority/evidence contracts in Praxis;
2. run Praxis and the current implementation against the same adversarial
   fixtures;
3. require identical deny/allow/uncertain outcomes and receipt bindings;
4. prove that Praxis cannot mint authority, skip durable preparation, or invent
   external success;
5. migrate one production-unreachable component at a time;
6. only after independent evidence may Praxis become an implementation substrate
   for a protected component;
7. changing the canonical authority path remains a separate architecture and
   promotion decision.

At that point, the question is not whether new Praxis code "bypasses" the old
implementation. The question becomes whether the Praxis implementation
**preserves or replaces the invariant with an equally explicit, verified
authority root**.

A rewrite that merely recreates AXIOM behavior behind a new unchecked runtime
would fail this experiment.

## Failure criteria

The experiment fails if any tested program or hand-edited IR can:

- commit without a host-supplied matching, exact-plan permit/lease/quorum and durable preparation;
- convert knowledge or assessment directly into authority;
- use one linear authority token more than once;
- expose an opaque secret reference as an ordinary value;
- invoke the synthetic executor before preparation is durably evidenced;
- convert an uncertain outcome into completion;
- cause the built-in CLI/runtime to perform an undeclared external effect;
- accept a receipt or completion record not bound to the exact prepared operation.

Any such result should halt promotion and be treated as a language/runtime
security defect.

## Halt procedure

Praxis currently has no capability registry entry and no production route.
Halting the experiment requires only stopping use of `labs/praxis/` and
reverting its isolated files/tests. No production service, credential, Grid
state, or deployment path depends on it.

## Reproducibility

Run the focused tests through the existing Mesh test harness:

```bash
node --test mesh/test/praxis-language-v0.test.mjs
node --test mesh/test/praxis-conformance-v0.test.mjs
node --test mesh/test/praxis-adversarial-ir-v0.test.mjs
node --test mesh/test/praxis-charter-evidence-v0.test.mjs
```

The semantic corpus is stored at
`labs/praxis/conformance/semantic-corpus.v0.json`. Its coverage table is
deliberately allowed to say `pending`; missing semantics must remain visible
rather than being inferred from passing adjacent tests.

Or run the full repository test command:

```bash
npm test
```

No dependency install beyond the repository's existing Node.js requirements is
introduced by Praxis v0.
