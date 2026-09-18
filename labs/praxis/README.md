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

It is not enabled as an AXIOM runtime, is not network exposed, is not
production promoted, and grants no Mesh, Grid, Hypervisor, Sandbox, repository,
credential, deployment, spending, or external-effect authority.

The CLI supports only parsing, static checking, and IR inspection. It has no
`run` command.

The embedding API contains a `run()` function solely for conformance testing
and future host integration. A `commit` statement fails closed unless the host
explicitly injects both a matching authority token and an executor. The
language runtime itself contains no network, filesystem-write, subprocess,
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
Commit
    |
    v
Receipt
```

An assessment is never a permit. An operation is inert until explicitly
authorized. Authority is linear. Execution requires an injected host boundary
and a receipt bound to the exact operation digest.

## Small example

```prax
requires permit deploy_prod: Deploy @ Production;

observe source_commit = "sha256:abc123" from "git:main";
verify verified_source = source_commit with GitIntegrity;
assess release_candidate = verified_source with ReleasePolicy;

op release = Deploy(verified_source) @ Production;
authorize release using deploy_prod as armed_release;
commit armed_release as release_receipt;
```

The source code does not mint `deploy_prod`. It declares an authority
requirement. A host must provide a matching authority token.

## v0 grammar

```text
requires permit <name>: <Action> @ <Scope>;
observe <name> = <literal-or-reference> from "<provenance>";
verify <name> = <knowledge> with <Policy>;
assess <name> = <knowledge> with <Policy>;
op <name> = <Action>(<args...>) @ <Scope>;
authorize <operation> using <permit> as <name>;
commit <authorized-operation> as <receipt>;
```

Comments begin with `//` or `#`.

## Static guarantees in v0

The compiler rejects:

- committing an ordinary operation without authority;
- authorizing with an assessment, receipt, or other non-permit value;
- action/scope mismatches between an operation and permit;
- reuse of a linear permit in one program;
- repeated commit of the same authorized operation;
- embedding a permit or authorized operation as an operation argument;
- verification of non-evidence values;
- undeclared bindings and duplicate bindings.

The runtime additionally rejects:

- absent, forged, mismatched, or already consumed host authority tokens;
- missing verifier or assessor implementations;
- verification/assessment results without explicit `ok: true`;
- `commit` when no executor was injected;
- executor success without a receipt bound to the exact operation digest.

## IR

Praxis compiles to `praxis-ir.v0`. Its initial instruction set is deliberately
small:

```text
REQUIRE_PERMIT
OBSERVE
VERIFY
ASSESS
PLAN
AUTHORIZE
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
- synthetic success from a missing or malformed executor receipt.

This slice does not claim protection from a malicious embedding host, compiler
subversion, compromised Node.js runtime, hardware compromise, or an executor
that lies while still producing a structurally valid receipt.

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

The experiment fails if any tested program can:

- commit without a host-supplied matching permit;
- convert knowledge or assessment directly into authority;
- use one linear authority token more than once;
- cause the built-in CLI/runtime to perform an undeclared external effect;
- accept an executor result that is not bound to the exact planned operation.

Any such result should halt promotion and be treated as a language/runtime
security defect.

## Halt procedure

Praxis currently has no capability registry entry and no production route.
Halting the experiment requires only stopping use of `labs/praxis/` and
reverting its isolated files/tests. No production service, credential, Grid
state, or deployment path depends on it.

## Reproducibility

Run the focused test through the existing Mesh test harness:

```bash
node --test mesh/test/praxis-language-v0.test.mjs
```

Or run the full repository test command:

```bash
npm test
```

No dependency install beyond the repository's existing Node.js requirements is
introduced by Praxis v0.
