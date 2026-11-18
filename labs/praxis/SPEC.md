# Praxis Language Specification v0

Normative specification for the Praxis v0 language front end
(lexing, parsing, static checking, canonical formatting, IR emission),
the measured-effect boundary, the authority model it documents, and
the conformance obligations of any implementation claiming Praxis v0
compatibility.

**Status: inert laboratory.** This specification describes the current
P0 language core. It does not confer production status, an authority root,
or a deployment path. See §1 and `BOOTSTRAP.md`.

Where this document and the code disagree, **the code wins**. Known
discrepancies are listed in §11. Points genuinely undecided are marked
**OPEN**.

Conformance keywords (MUST, MUST NOT, SHOULD, MAY) are used in their
normative sense. Normative references in this document:

- `labs/praxis/lexer.mjs` — lexical grammar
- `labs/praxis/parser.mjs` — concrete syntax
- `labs/praxis/analyzer.mjs` — static checker and IR emitter
- `labs/praxis/format.mjs` — canonical formatter
- `labs/praxis/canonical.mjs` — canonical JSON / digests / operation descriptors
- `labs/praxis/errors.mjs` — error classes
- `labs/praxis/policy.mjs` — deterministic policy-premise normalization and evaluation
- `labs/praxis/charter.mjs` — synthetic charters, chartered authority issuance
- `labs/praxis/registry.mjs` — host operation registry
- `labs/praxis/effects.mjs` — measured-effect validation
- `labs/praxis/ledger.mjs` — audit ledger and decision receipts
- `labs/praxis/conformance/semantic-corpus.v0.json` — conformance corpus

---

## 1. Scope and design intent

Praxis v0 is an **inert laboratory** for the hypothesis that the trust
boundaries of the AXIOM system — knowledge, planning, authority, and
execution — can be made into language semantics rather than conventions
repeated in application code. Its core invariant is:

```text
Knowledge != Operation != Authority != Execution
```

The following are normative for every conforming v0 implementation:

1. Praxis v0 is **production-unreachable by design**. It is not enabled as
   an AXIOM runtime, is not network exposed, grants no Mesh, Grid,
   Hypervisor, Sandbox, repository, credential, deployment, spending, or
   external-effect authority, and has no capability-registry entry.
2. The CLI (`labs/praxis/cli.mjs`) supports only `check` (parse + static
   check), `ir` (IR inspection), and `format` (canonical printing). It has
   no command that executes effects.
3. The embedding `run()` function exists solely for conformance testing
   against explicitly injected synthetic hosts. The language runtime
   contains no network, filesystem-write, subprocess, provider, credential,
   or Grid executor.
4. Compiled IR is sealed with a canonical module digest, but the digest
   is **not** proof of compiler trustworthiness. The runtime treats IR as
   hostile input: hand-edited, re-sealed IR is an explicit adversarial
   input class, and the runtime re-checks authority kind, exact-plan
   binding, quorum threshold, information-flow restrictions, and
   prepared-effect terminal linearity before an effect can advance.
5. Rollback is deliberately **not** a generic v0 primitive. Different
   effects have different compensating-action semantics; rollback remains
   an explicit conformance gap (see §8).
6. Nothing in this specification authorizes claiming production status.
   Promotion follows the staged path in `BOOTSTRAP.md` (P0 inert
   laboratory → P1 semantic corpus → P2 differential implementation →
   P3 production-unreachable orchestration → P4 shadow execution →
   P5 constrained authority adapter → P6 protected component replacement →
   P7 authority-root candidacy → P8 self-hosting). Rationale for the
   migration path lives in `BOOTSTRAP.md`, not here.

The epistemic pipeline enforced by the language is:

```text
Observed<T> -> Verified<T, Policy> -> Assessment<T>
Operation -> AuthorizedOperation -> PreparedOperation -> Commit -> Receipt
```

An assessment is never a permit. An operation is inert until explicitly
authorized; authorization alone is not executable; durable preparation
must succeed first; authority is linear; uncertain execution or an
unverified receipt leaves the effect in the prepared state rather than
fabricating completion.

---

## 2. Lexical grammar

The lexer (`labs/praxis/lexer.mjs`) converts source text to a token
stream. The token types are: `string`, `number`, `word`, the punctuation
tokens `:`, `@`, `;`, `=`, `(`, `)`, `,`, and the terminal `eof` token.

### 2.1 Rules, in match order

1. **Whitespace** (`/^[\s]+/`): skipped; not a token. Line/column
   accounting treats `\n` as the line separator.
2. **Comments** (`/^(?:\/\/|#)[^\n]*/`): skipped; not tokens. A comment
   runs to, but not including, the next newline. Comments never reach
   the AST (§7).
3. **String literals** (`/^"(?:\\.|[^"\\])*"/`): the matched text is
   decoded with JSON string semantics. A string that is not valid JSON
   (e.g. an unterminated string, a literal newline inside the quotes, or
   an invalid escape) is a syntax error (`PRAXIS_SYNTAX_ERROR`,
   "invalid string literal").
4. **Number literals** (`/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?/`): an
   optional leading `-`, then `0` or a non-zero digit followed by
   digits, with an optional fractional part. Values become IEEE-754
   doubles. The following are **not** accepted: a leading `+`, leading
   zeros (`007`), exponent notation (`1e3`), hexadecimal, `Infinity`,
   `NaN`. There is no unary-minus operator: `-` outside a number
   literal is not valid syntax.
5. **Words** (`/^[A-Za-z_][A-Za-z0-9_.-]*/`): identifiers and keywords.
   Keywords are recognized by exact value comparison, so they are
   case-sensitive lowercase (`Op`, `REQUIRES`, etc. are not keywords).
   Note that words may contain `.` and `-`, so `foo-bar` and `a.b` are
   single word tokens. `true` and `false` are words that the parser
   converts to boolean literals (see §3).
6. **Punctuation**: the characters `:`, `@`, `;`, `=`, `(`, `)`, `,`
   each produce a token whose type is the character itself.
7. Any other character is a syntax error
   (`PRAXIS_SYNTAX_ERROR`, "unexpected character ...").

### 2.2 Token-stream guarantees

- A final `eof` token with the end position always terminates the
  stream.
- Every token carries 1-based `line` and `column`. Syntax errors report
  the position of the offending token (`at line:column`).
- `lex(source)` throws `TypeError` when the source is not a string.

---

## 3. Concrete syntax

Grammar below is EBNF over the token stream of §2. Terminals are written
as token types in `code` (for `string`, `number`, `word`) or quoted
literals for punctuation and keywords. `identifier` is a `word` token
that is not in keyword position. `*` = zero or more, `?` = optional,
`|` = alternation.

```ebnf
program        = { statement } ;
statement      = requires | observe | verify | assess | operation
               | authorize | prepare | cancel | commit | finalize ;

requires       = "requires" , resource ;
resource       = "permit" , identifier , ":" , identifier , "@" , identifier , ";"
               | "lease"  , identifier , ":" , identifier , "@" , identifier , ";"
               | "quorum" , identifier , ":" , identifier , "@" , identifier ,
                 "threshold" , number , "of" , identifier , { "," , identifier } , ";"
               | "secret" , identifier , ":" , identifier , ";"
               | "prepared" , identifier , ":" , identifier , "@" , identifier , ";" ;

observe        = "observe" , identifier , "=" , value , "from" , string , ";" ;
verify         = "verify"  , identifier , "=" , identifier , "with" , identifier , ";" ;
assess         = "assess"  , identifier , "=" , identifier , "with" , identifier , ";" ;

operation      = "op" , identifier , "=" , identifier ,
                 "(" , [ value , { "," , value } ] , ")" ,
                 "@" , identifier , { modifier } , ";" ;
modifier       = "effect" , identifier
               | "irreversible"
               | "egress" , string
               | "using" , "secrets" , identifier , { "," , identifier } ;

authorize      = "authorize" , identifier , "using" , identifier , "as" , identifier , ";" ;
prepare        = "prepare"   , identifier , "as" , identifier , ";" ;
cancel         = "cancel"    , identifier , "as" , identifier , ";" ;
commit         = "commit"    , identifier , "as" , identifier , ";" ;
finalize       = "finalize"  , identifier , "as" , identifier , ";" ;

value          = literal | reference ;
literal        = string | number | "true" | "false" ;
reference      = identifier ;
```

Normative notes (all enforced by `parser.mjs`; code wins):

- `observe` accepts any `value` (literal or reference). `verify` and
  `assess` accept only an identifier on the right-hand side, followed by
  the literal keyword `with`.
- An `operation` accepts zero or more comma-separated values as
  arguments; empty argument lists (`Action()`) are legal.
- Modifiers on `operation` may appear in **any order**, but each may be
  declared **at most once**: a second `effect`, `irreversible`,
  `egress`, or `using secrets` clause is a syntax error.
- `irreversible` or `egress` metadata **requires** an `effect`
  declaration on the same operation; declaring `irreversible` or
  `egress` without `effect` is a syntax error.
- In `requires`, the resource type after the name is one of exactly
  five keywords: `permit`, `lease`, `quorum`, `secret`, `prepared`.
  Any other resource type is a syntax error.
- In `requires quorum`, `threshold` MUST be followed by a `number`
  token; at least one member is required.
- Statement dispatch is on the first word; an unrecognized first word
  is a syntax error ("unknown statement ..."), and a non-word first
  token is a syntax error ("expected statement").
- The AST uses these `kind` values: `RequirePermit`, `RequireLease`,
  `RequireQuorum`, `RequireSecret`, `RequirePrepared`, `Observe`,
  `Verify`, `Assess`, `Operation`, `Authorize`, `Prepare`, `Cancel`,
  `Commit`, `Finalize`; values use `{ kind: "literal", value }` and
  `{ kind: "reference", name }`; programs use `{ kind: "Program", body }`.

---

## 4. Static semantics

The static checker (`analyzer.mjs`, via `compile(source)` =
`analyze(parse(source))`) enforces the following normative rules. A
violation raises `PraxisTypeError` with the given code. Binding kinds
used below are the internal epistemic types the checker tracks:

`Permit`, `Lease`, `Quorum`, `SecretRef`, `PreparedOperation`
(imported), `Observed`, `Verified`, `Assessment`, `Operation`,
`AuthorizedOperation`, `Receipt`, `CancellationReceipt`.

### 4.1 Bindings

- A program MUST NOT bind the same name twice
  (`PRAXIS_DUPLICATE_BINDING`). Every binding MUST be declared before
  use; references to undeclared names raise `PRAXIS_UNKNOWN_BINDING`.

### 4.2 Authority requirements (`requires`)

- **Permit / lease** (`requires permit|lease <name>: <Action> @ <Scope>;`):
  binds a linear (`linear: true`) authority token for exactly one
  action/scope pair. The same binding rules apply to both; the lease
  adds expiry, which the runtime enforces.
- **Quorum** (`requires quorum <name>: <Action> @ <Scope> threshold <N> of <m>, ...;`):
  the threshold MUST be a safe integer with `1 <= N <= member count`,
  and members MUST be unique, otherwise
  `PRAXIS_INVALID_QUORUM`. Members are sorted in the emitted IR, but
  uniqueness is checked on the declared set. The binding is linear.
- **Secret** (`requires secret <name>: <SecretKind>;`): binds a
  `SecretRef` typed by its secret kind. It carries no action or scope.
- **Prepared** (`requires prepared <name>: <Action> @ <Scope>;`):
  binds an *imported* `PreparedOperation` for replay: the host must
  supply a branded prepared reference bound to the exact operation,
  authority evidence, and durable preparation digest. Imported
  prepared bindings have `irreversibility_known: false`; the static
  commit/finalize selection for them is therefore deferred to the
  runtime (§9.6).

### 4.3 Knowledge (`observe` / `verify` / `assess`)

- `observe <name> = <literal> from "<provenance>";` binds `Observed`
  with the given provenance. Copying a reference is allowed only from
  knowledge kinds (`Observed`, `Verified`, `Assessment`, `Receipt`);
  copying any authority or secret kind raises
  `PRAXIS_INFORMATION_FLOW_VIOLATION`.
- `verify <name> = <input> with <policy>;` requires its input to be
  `Observed` or `Verified`, otherwise `PRAXIS_VERIFY_REQUIRES_EVIDENCE`;
  it binds `Verified`.
- `assess <name> = <input> with <policy>;` requires its input to be
  knowledge (`Observed`, `Verified`, or `Assessment`, but not `Receipt`),
  otherwise `PRAXIS_ASSESS_REQUIRES_KNOWLEDGE`; it binds `Assessment`.
  **An `Assessment` is never authority** and can never satisfy an
  authority premise (§9.4).

### 4.4 Operations (`op`)

- Any `reference` used as an operation argument MUST be a declared
  binding. Binding kinds `Permit`, `Lease`, `Quorum`, `SecretRef`,
  `AuthorizedOperation`, `PreparedOperation` MUST NOT be embedded as
  ordinary operation arguments: authority kinds raise
  `PRAXIS_AUTHORITY_EXFILTRATION`, secrets raise
  `PRAXIS_SECRET_EXFILTRATION`.
- Secrets pass only through the dedicated channel
  (`using secrets <name>, ...`). Each listed secret MUST be a declared
  `SecretRef`, otherwise `PRAXIS_SECRET_REFERENCE_REQUIRED`; listing
  the same secret twice raises `PRAXIS_DUPLICATE_SECRET_BINDING`.
- The declaration metadata records: `declared_effect` (the `effect`
  identifier, or `null`), `irreversibility_known` (true iff an effect
  was declared), `irreversible` (the flag, or `null` when unknown), and
  `declared_egress` (the egress string, or `null`).

### 4.5 Authorization (`authorize`)

- `authorize <op> using <token> as <name>;` requires `<op>` to be an
  `Operation` (`PRAXIS_AUTHORIZE_REQUIRES_OPERATION` otherwise) and
  `<token>` to be a `Permit`, `Lease`, or `Quorum`
  (`PRAXIS_AUTHORIZE_REQUIRES_PERMIT` otherwise).
- The token's action/scope MUST exactly equal the operation's
  action/scope, otherwise `PRAXIS_AUTHORITY_MISMATCH`.
- Permits, leases, and quorums are **linear**: a token already consumed
  by a previous `authorize` raises `PRAXIS_LINEAR_AUTHORITY_REUSE`.
- The result binds `AuthorizedOperation` (linear), inheriting the
  operation's irreversibility knowledge.

### 4.6 Lifecycle (`prepare` / `cancel` / `commit` / `finalize`)

- `prepare` requires an `AuthorizedOperation`
  (`PRAXIS_PREPARE_REQUIRES_AUTHORITY`); each authorized operation may
  be prepared **at most once** (`PRAXIS_LINEAR_OPERATION_REUSE`).
- `cancel`, `commit`, and `finalize` each require a `PreparedOperation`
  (`PRAXIS_CANCEL_REQUIRES_PREPARATION`,
  `PRAXIS_COMMIT_REQUIRES_PREPARATION`,
  `PRAXIS_FINALIZE_REQUIRES_PREPARATION`).
- Each prepared operation admits **at most one terminal transition**
  (`cancel`, `commit`, or `finalize`); a second terminal transition on
  the same operation raises `PRAXIS_LINEAR_OPERATION_REUSE`.
- Terminal-mode selection is static when irreversibility is known:
  - `commit` of a statically irreversible operation raises
    `PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE`;
  - `finalize` of a statically reversible operation raises
    `PRAXIS_FINALIZE_REQUIRES_IRREVERSIBLE`.
- `cancel` binds `CancellationReceipt`; `commit` and `finalize` bind
  `Receipt` with `finality: "commit"` or `finality: "finalize"`.

An unknown AST node kind is rejected with `PRAXIS_UNKNOWN_AST_NODE`.

---

## 5. IR schema

The checker emits a sealed intermediate representation with
`schema: "praxis-ir.v0"` (`analyzer.mjs`). The module body is:

| Field | Type | Meaning |
|---|---|---|
| `schema` | string | Always `"praxis-ir.v0"`. |
| `required_permits` | array | Authority requirements from `requires permit/lease/quorum`, each `{ name, authority_kind, action, scope }`, plus `threshold` and sorted `members` for `Quorum`. |
| `required_secrets` | array | Each `{ name, secret_kind }`. |
| `required_prepared` | array | Each `{ name, action, scope }`. |
| `instructions` | array | One instruction per statement, in source order (see below). |
| `bindings` | object | Map from binding name to its epistemic type record. |
| `digest` | string | `sha256:<hex>` over the canonical JSON of the module body **excluding** `digest` itself (`irDigestPraxis`). |

### 5.1 Instruction set

Each instruction has an `op` discriminator and these fields:

| `op` | Fields |
|---|---|
| `REQUIRE_PERMIT` | `name`, `action`, `scope` |
| `REQUIRE_LEASE` | `name`, `action`, `scope` |
| `REQUIRE_QUORUM` | `name`, `action`, `scope`, `threshold`, `members` (sorted) |
| `REQUIRE_SECRET` | `name`, `secret_kind` |
| `REQUIRE_PREPARED` | `name`, `action`, `scope` |
| `OBSERVE` | `name`, `value` (`{kind:"literal",value}` / `{kind:"reference",name}`), `provenance` |
| `VERIFY` | `name`, `input`, `policy` |
| `ASSESS` | `name`, `input`, `policy` |
| `PLAN` | `name`, `action`, `scope`, `args` (value nodes), `secrets` (names), `declared_effect` (or `null`), `declared_irreversible` (`true`/`false`, or `null` when no effect declared), `declared_egress` (or `null`) |
| `AUTHORIZE` | `name`, `operation`, `permit` |
| `PREPARE` | `name`, `operation` |
| `CANCEL` | `name`, `operation` |
| `COMMIT` | `name`, `operation` |
| `FINALIZE` | `name`, `operation` |

All emitted structures are deep-frozen. The digest makes accidental
mutation detectable; it is explicitly not a trust root (§1.4) — the
runtime re-verifies every authority-relevant property from the IR
contents (§9.8).

### 5.2 Canonical digests

Digests are `sha256` over canonical JSON (`canonical.mjs`):
object keys sorted, plain records only (no class instances, no
non-enumerable or symbol-keyed state, no sparse arrays, no custom
array properties), `-0` normalized to `0`, non-finite numbers
rejected. Operation digests (`operationDigestPraxis`) cover
`{ schema: "praxis-operation.v0", action, scope, args, secret_references }`,
optionally extended with `host_operation`, `effect`, `irreversible`,
`egress` for measured operations (§9.6).

---

## 6. Error catalog

Errors are raised as typed classes (`errors.mjs`): `PraxisSyntaxError`
(code `PRAXIS_SYNTAX_ERROR`, with `line:column`), `PraxisTypeError`
(carries the specific code), `PraxisRuntimeError` (carries code and
optional details), plus `PraxisFormatError` (code
`PRAXIS_FORMAT_ERROR`) from the formatter. The `run()` embedding and
fuzzer/bench treat `PraxisSyntaxError`/`PraxisTypeError` as the only
fail-closed check-time failure classes.

### 6.1 Lex/parse (PraxisSyntaxError)

| Code | Meaning |
|---|---|
| `PRAXIS_SYNTAX_ERROR` | Any lexical or syntactic violation: unexpected character, invalid string literal, expected-token mismatch, unknown statement, illegal resource type, duplicate `op` modifier, `irreversible`/`egress` without `effect`. |

### 6.2 Static check (PraxisTypeError)

| Code | Meaning |
|---|---|
| `PRAXIS_DUPLICATE_BINDING` | A name is bound twice. |
| `PRAXIS_UNKNOWN_BINDING` | Reference to an undeclared name. |
| `PRAXIS_INVALID_QUORUM` | Threshold not an integer in `[1, member count]`, or duplicate members. |
| `PRAXIS_INFORMATION_FLOW_VIOLATION` | `observe` tried to copy a non-knowledge binding. |
| `PRAXIS_VERIFY_REQUIRES_EVIDENCE` | `verify` input is not `Observed`/`Verified`. |
| `PRAXIS_ASSESS_REQUIRES_KNOWLEDGE` | `assess` input is not knowledge. |
| `PRAXIS_AUTHORITY_EXFILTRATION` | Authority binding embedded as an ordinary operation argument. |
| `PRAXIS_SECRET_EXFILTRATION` | Secret reference embedded as an ordinary operation argument. |
| `PRAXIS_DUPLICATE_SECRET_BINDING` | Same secret listed twice in `using secrets`. |
| `PRAXIS_SECRET_REFERENCE_REQUIRED` | A `using secrets` name is not a `SecretRef`. |
| `PRAXIS_AUTHORIZE_REQUIRES_OPERATION` | `authorize` target is not an `Operation`. |
| `PRAXIS_AUTHORIZE_REQUIRES_PERMIT` | `authorize` token is not Permit/Lease/Quorum. |
| `PRAXIS_AUTHORITY_MISMATCH` | Token action/scope differs from the operation's. |
| `PRAXIS_LINEAR_AUTHORITY_REUSE` | A linear permit/lease/quorum was already consumed. |
| `PRAXIS_PREPARE_REQUIRES_AUTHORITY` | `prepare` target is not `AuthorizedOperation`. |
| `PRAXIS_LINEAR_OPERATION_REUSE` | Re-preparation, or a second terminal transition on one prepared operation. |
| `PRAXIS_CANCEL_REQUIRES_PREPARATION` | `cancel` target is not `PreparedOperation`. |
| `PRAXIS_COMMIT_REQUIRES_PREPARATION` | `commit` target is not `PreparedOperation`. |
| `PRAXIS_FINALIZE_REQUIRES_PREPARATION` | `finalize` target is not `PreparedOperation`. |
| `PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE` | `commit` of a statically irreversible operation. |
| `PRAXIS_FINALIZE_REQUIRES_IRREVERSIBLE` | `finalize` of a statically reversible operation. |
| `PRAXIS_UNKNOWN_AST_NODE` | Checker received an unknown AST node kind. |

### 6.3 Canonical format (PraxisFormatError)

| Code | Meaning |
|---|---|
| `PRAXIS_FORMAT_ERROR` | Non-finite number, malformed AST/value node, or non-`Program` input to the formatter. |

### 6.4 Runtime (PraxisRuntimeError)

These arise only in the synthetic embedding (`host.mjs`, `charter.mjs`,
`policy.mjs`, `registry.mjs`, `canonical.mjs`, `ledger.mjs`):

| Code | Meaning |
|---|---|
| `PRAXIS_IR_MALFORMED` / `PRAXIS_IR_TAMPERED` / `PRAXIS_IR_DUPLICATE_BINDING` / `PRAXIS_UNKNOWN_INSTRUCTION` | IR failed structural validation (includes re-sealed hostile IR). |
| `PRAXIS_RUNTIME_UNKNOWN_BINDING` | IR references an undeclared binding. |
| `PRAXIS_HOST_AUTHORITY_REQUIRED` / `PRAXIS_HOST_AUTHORITY_MISMATCH` / `PRAXIS_HOST_AUTHORITY_PLAN_MISMATCH` / `PRAXIS_HOST_AUTHORITY_EXPIRED` / `PRAXIS_HOST_AUTHORITY_REVOKED` / `PRAXIS_HOST_AUTHORITY_CONSUMED` | Absent, mismatched, wrong-plan, expired, revoked, or consumed authority token. |
| `PRAXIS_HOST_QUORUM_MISMATCH` / `PRAXIS_HOST_QUORUM_INSUFFICIENT` | Quorum envelope membership/threshold mismatch. |
| `PRAXIS_HOST_SECRET_REQUIRED` / `PRAXIS_HOST_SECRET_KIND_MISMATCH` | Missing or wrong-kind opaque secret reference. |
| `PRAXIS_HOST_PREPARED_REQUIRED` / `PRAXIS_HOST_PREPARED_MISMATCH` / `PRAXIS_HOST_PREPARED_CONSUMED` | Imported prepared reference missing, mismatched, or consumed. |
| `PRAXIS_CHARTER_SIGNATURE` | Charter signature/digest/trust failure (also used for invalid charter bodies). |
| `PRAXIS_CHARTER_REQUIRED` | Chartered measured effect requires the signed charter. |
| `PRAXIS_CHARTER_KEYS` | One public key bound to multiple principals/seats. |
| `PRAXIS_POLICY_UNPINNED` / `PRAXIS_VERIFIER_UNPINNED` | Policy/verifier missing from or drifted against the signed charter. |
| `PRAXIS_POLICY_SUBJECT_REQUIRED` / `PRAXIS_POLICY_SUBJECT_INVALID` | Missing or malformed operation descriptor for policy evaluation. |
| `PRAXIS_POLICY_PREMISE` / `PRAXIS_POLICY_ERROR` / `PRAXIS_POLICY_REQUIRE` | Malformed premise definition, evaluation failure, or unsatisfied predicate. |
| `PRAXIS_POLICY_VETO` | Pinned advisor vetoed. |
| `PRAXIS_ADVISOR_REQUIRED` | Pinned advisor missing, malformed, throwing, or non-conforming. |
| `PRAXIS_EVIDENCE_REQUIRED` / `PRAXIS_EVIDENCE_AMBIGUOUS` / `PRAXIS_EVIDENCE_STALE` / `PRAXIS_UNVERIFIED` / `PRAXIS_VERIFIER_ORIGIN` / `PRAXIS_VERIFIER_REQUIRED` / `PRAXIS_VERIFICATION_DENIED` / `PRAXIS_OBSERVATION_MISMATCH` | Evidence not kernel-verified, duplicated, stale, wrong origin/signer, or denied. |
| `PRAXIS_ASSESSMENT_DENIED` / `PRAXIS_ASSESSOR_REQUIRED` | Assessment lane failures. |
| `PRAXIS_QUORUM` | Approval-request binding failures (digest mismatch, expiry, self-approval, invalid signature, unmet threshold/human minimum). |
| `PRAXIS_UNKNOWN_PRINCIPAL` | Requester is not a chartered principal or agent. |
| `PRAXIS_PREPARER_REQUIRED` / `PRAXIS_PREPARATION_UNCOMMITTED` / `PRAXIS_PREPARATION_EVIDENCE_INVALID` | Durable preparation missing or unbound. |
| `PRAXIS_EXECUTOR_REQUIRED` / `PRAXIS_COMPLETER_REQUIRED` | Injected executor/completion recorder missing. |
| `PRAXIS_EXTERNAL_OUTCOME_UNCERTAIN` / `PRAXIS_EXTERNAL_RECEIPT_UNVERIFIED` / `PRAXIS_COMPLETION_UNCOMMITTED` / `PRAXIS_COMPLETION_EVIDENCE_INVALID` / `PRAXIS_CANCELLATION_UNCOMMITTED` / `PRAXIS_CANCELLATION_EVIDENCE_INVALID` / `PRAXIS_CANCELER_REQUIRED` | Terminal-transition evidence failures; uncertain outcomes never promote to completion. |
| `PRAXIS_HOST_OPERATION_REQUIRED` / `PRAXIS_HOST_OPERATION_AMBIGUOUS` / `PRAXIS_HOST_OPERATION_REGISTRY` | Missing, ambiguous, or malformed host operation contract/registry. |
| `PRAXIS_LINK_MISMATCH` | Prepared operation no longer matches the host-measured contract. |
| `PRAXIS_EFFECT_AUTHORITY_REQUIRED` | Measured effect presented without chartered authority. |
| `PRAXIS_EFFECT_ENVELOPE_REQUIRED` | Measured effect with no signed requester envelope. |
| `PRAXIS_EFFECT_ENVELOPE` | Measured effect outside the requester's signed envelope. |
| `PRAXIS_EFFECT_REQUIRED` | A requester with a signed envelope attempted the unmeasured path. |
| `PRAXIS_EFFECT_UNDECLARED` | Terminal execution of a measured effect the program did not declare. |
| `PRAXIS_PROGRAM_UNPINNED` | IR digest absent from the charter's pinned program digests. |
| Ledger: `PRAXIS_LEDGER_REQUIRED` / `PRAXIS_LEDGER_GENESIS` / `PRAXIS_LEDGER_ENTRY_INVALID` / `PRAXIS_LEDGER_KIND` / `PRAXIS_LEDGER_CHAIN_INVALID` / `PRAXIS_LEDGER_DIGEST_MISMATCH` / `PRAXIS_LEDGER_DUPLICATE_PREPARATION` / `PRAXIS_LEDGER_UNKNOWN_PREPARATION` / `PRAXIS_LEDGER_TERMINAL_EXISTS` / `PRAXIS_LEDGER_FINALITY_MISMATCH` / `PRAXIS_LEDGER_RECEIPT_INVALID` / `PRAXIS_LEDGER_RECEIPT_MISMATCH` | Audit-ledger structural and chain failures; finality mismatch preserves terminal mode. |

Decision denial codes recorded in `praxis-decision-receipt.v0` are the
closed, stable set in `ledger.mjs` (`POLICY_UNPINNED`,
`SUBJECT_INVALID`, `EVIDENCE_UNVERIFIED`, `PREMISE_FAILED`,
`ADVISOR_VETO`, `QUORUM_INSUFFICIENT`, `EFFECT_ENVELOPE_DENIED`,
`PROGRAM_UNPINNED`, `REQUEST_MALFORMED`, `AUTHORITY_EXPIRED`,
`AUTHORITY_REVOKED`, `OPERATION_MISMATCH`, `ISSUANCE_UNAVAILABLE`,
`INTERNAL_ERROR`).

---
## 7. Canonicalization rules

The canonical formatter (`format.mjs`) defines the unique canonical
text of every program. A conforming v0 implementation MUST format
exactly as follows (code wins on every detail):

1. **One statement per line, in source order.** A single trailing
   newline terminates a non-empty program. An empty program formats
   to the empty string `''`.
2. **Single spaces** between tokens; every statement ends with `;`.
3. **`op` modifiers always print in the fixed order:** `effect`,
   `irreversible`, `egress`, `using secrets` — regardless of source
   order.
4. **Values:** strings via `JSON.stringify`; numbers as plain decimals
   with no exponent notation (the shortest round-trip representation,
   with any exponent form expanded, so the printed literal always
   parses back to the identical double — e.g. `-0` prints as `-0`,
   `1e22`-scale overflow literals print expanded); booleans as
   `true`/`false`; references as their bare name.
5. **Comments are not preserved.** The lexer discards `//` and `#`
   comments, so canonical text strips them.
6. Statement shapes (exact spacing):
   - `requires permit <name>: <Action> @ <Scope>;`
   - `requires lease <name>: <Action> @ <Scope>;`
   - `requires quorum <name>: <Action> @ <Scope> threshold <N> of <m1>, <m2>;`
   - `requires secret <name>: <SecretKind>;`
   - `requires prepared <name>: <Action> @ <Scope>;`
   - `observe <name> = <value> from "<provenance>";`
   - `verify <name> = <input> with <policy>;`
   - `assess <name> = <input> with <policy>;`
   - `op <name> = <Action>(<args>) @ <Scope>[ effect <E>][ irreversible][ egress "<d>"][ using secrets <s>, ...];`
   - `authorize <op> using <token> as <name>;`
   - `prepare <op> as <name>;`
   - `cancel <op> as <name>;`
   - `commit <op> as <name>;`
   - `finalize <op> as <name>;`

Guarantees (all tested in `mesh/test/praxis-format-v0.test.mjs`):

- **Idempotent:** `format(format(x)) === format(x)`.
- **Round-trip stable:** `parse(format(x))` deep-equals `parse(x)`.
- **Deterministic:** no timestamps, no randomness.
- **Total over finite inputs:** never throws on valid source; invalid
  source surfaces the parser's `PraxisSyntaxError` unchanged. The one
  documented exception is a non-finite numeric value (only producible
  by an overflow literal, e.g. a 400-digit integer, which no Praxis
  literal denotes exactly); that raises `PRAXIS_FORMAT_ERROR`.
- `isCanonical(source)` is true iff `format(source) === source`.
- `formatCheckReport(source, label)` returns `null` for canonical
  input, otherwise a `-`/`+` diff-style report.

The formatter never evaluates, authorizes, or executes. The CLI
exposes it as `format [--check] [file.prax|-]`, reading stdin when no
file is given; `--check` exits 1 with a diff when the input is not
canonical.

---

## 8. Conformance requirements

`labs/praxis/conformance/semantic-corpus.v0.json` (schema
`praxis-semantic-conformance.v0`, version `0`, status
`inert-laboratory-corpus`) is the normative conformance corpus. It
contains three parts:

1. **`coverage`**: 30 named invariants with a status each
   (`covered`, `covered-as-epistemic-value`, or suffixed coverage
   notes). **OPEN:** the `rollback` invariant is explicitly
   `pending-operation-specific-semantics`. The corpus is deliberately
   allowed to say `pending`; missing semantics MUST remain visible
   rather than being inferred from passing adjacent tests.
2. **`compile_cases`**: 22 cases, each with `name`, `source`, and
   `expect`. An expectation is either `{ ok: true, instruction_ops:
   [...] }` (the exact emitted instruction-op sequence) or `{ ok:
   false, code: <PraxisTypeError code> }`.
3. **`canonical_fixtures`**: 5 fixtures over canonical JSON with
   expected normalized values (including negative-zero normalization
   and record key ordering).

### 8.1 Implementer obligations

- **MUST** pass every `compile_cases` expectation with the exact
  `ok`/`code`/`instruction_ops` outcome. The instruction-op sequences
  are normative: e.g. a minimal permit→plan→authorize→prepare→commit
  program MUST emit exactly
  `REQUIRE_PERMIT, PLAN, AUTHORIZE, PREPARE, COMMIT`.
- **MUST** reproduce the `canonical_fixtures` normalizations exactly
  (key sorting, `-0` → `0`, array order preserved).
- **MUST** preserve every `covered` invariant as a tested denial or
  acceptance behavior. For `pending` invariants, an implementation MUST
  NOT claim coverage: it MUST either fail closed or document the gap
  exactly as the corpus does.
- **SHOULD** run the same adversarial fixture classes as
  `mesh/test/praxis-adversarial-ir-v0.test.mjs`: hand-edited,
  re-sealed IR attempting to weaken kind, flow, linearity, quorum, and
  effect/finality checks.
- **SHOULD** remain transport-surface clean: `mesh/test` scans assert
  that the interpreter modules perform no network, filesystem,
  subprocess, or other transport calls. Any v0-compatible
  implementation MUST NOT add a transport call reachable from program
  input, and SHOULD keep the same surface scan passing.
- **MAY** extend coverage with new corpus cases, but MUST NOT silently
  downgrade a `covered` invariant to `pending` without a recorded
  rationale and a tracked re-coverage plan.

---

## 9. Authority model (normative summary)

The authority machinery documented here (P0.2 chartered authority, P0.3
deterministic policy premises, P0.4 measured effects, the decision
ledger) lives **outside governed `.prax` source**. Governed source
declares requirements and plans; it never mints authority. The rules
below are normative; the rationale remains in `BOOTSTRAP.md`.

### 9.1 Charter pinning

- A synthetic charter (`createSyntheticCharter`) has schema
  `praxis-signed-charter.v0` and pins: `principals` (kinds `human`,
  `agent`, `service`, each with an Ed25519 public key), `agents`
  (agent→principal bindings), `policies` (pinned, digest-covered
  definitions), `verifiers` (pinned, digest-covered definitions),
  `effect_envelopes` (per-principal, sorted, duplicate-free), and
  `program_digests` (deduplicated, sorted `sha256:<hex>` digests).
- One public key MUST NOT be bound to multiple principals
  (`PRAXIS_CHARTER_KEYS`).
- Policy/verifier content digests are part of the signed charter body:
  changing a quorum, evidence requirement, verifier origin, or advisor
  changes the pin and is refused (`PRAXIS_POLICY_UNPINNED`,
  `PRAXIS_VERIFIER_UNPINNED`).
- Verification (`verifySyntheticCharter`) requires the signed schema,
  a valid body, a matching digest, a trusted root signer, and a valid
  Ed25519 signature; any failure raises `PRAXIS_CHARTER_SIGNATURE`.

### 9.2 Evidence

- Authority-grade observations are separately signed. A
  charter-pinned verifier checks the observation signer, exact origin,
  and freshness before producing a runtime-branded `Verified` value.
- Evidence freshness is checked at authority issuance **and** again
  immediately before terminal execution (`PRAXIS_EVIDENCE_STALE`).
- Evidence must belong to the same charter (`PRAXIS_EVIDENCE_REQUIRED`
  otherwise), use verifiers pinned by that charter, and be
  unambiguous (one value per verifier; `PRAXIS_EVIDENCE_AMBIGUOUS`).
- Observation values are canonical immutable snapshots: mutating the
  caller's object after signing cannot change the evidence.
- A legacy `observe` plus generic host verifier may still create an
  ordinary (non-runtime-branded) `Verified` value for P0 compatibility;
  it MUST NOT satisfy a chartered authority premise.

### 9.3 Quorum authority

- For chartered quorum authority, approvers sign an exact request
  containing charter/policy digest, operation digest, evidence
  digests, requester, nonce, and expiry.
- Issuance verifies: request binding (digests, requester, expiry;
  `PRAXIS_QUORUM` on any mismatch), Ed25519 approval signatures,
  distinct principals, **requester self-exclusion**, one-key-one-seat,
  the policy threshold, and any human minimum.
- The older raw laboratory constructors (`createHostPermit`,
  `createHostLease`, `createHostQuorum`) remain solely to preserve
  the P0 embedding/conformance surface. They are **not** the
  authority-grade path and MUST NOT arm a host-measured effect.

### 9.4 Deterministic policy premises (P0.3)

- A charter policy may contain a conjunction of deterministic
  `require` predicates. Granting operands are restricted to: (a) a
  runtime-branded `Verified` evidence value from a verifier declared
  in the policy's `requires_evidence`; (b) fields of an exact
  canonical operation descriptor (path head restricted to `action`,
  `scope`, `args`, `operation_digest`); (c) canonical constants.
  **An `Assessment` can never satisfy a premise.**
- Comparators: `eq`, `neq`, `lt`, `lte`, `gt`, `gte`. Missing paths,
  ambiguous duplicate evidence, mixed-type ordered comparisons,
  malformed predicates, or any false predicate deny issuance
  (`PRAXIS_POLICY_REQUIRE` and friends).
- The normalized predicate AST is covered by the charter-pinned
  policy digest: governed source cannot remove an artifact match,
  swap a verifier, or replace a verified premise with an assessment
  without invalidating the signed policy.
- Premise operands over operation fields require an exact
  `createOperationDescriptorPraxis(...)` subject; a digest string
  alone is insufficient. The issuer recomputes the digest before
  evaluation.
- Successful authority records only the digests of predicates that
  evaluated `true`. Prepared replay preserves and re-validates those
  predicate digests against the currently pinned policy.
- A pinned advisor runs at issuance and is **veto-only**; a missing,
  malformed, or throwing advisor fails closed
  (`PRAXIS_ADVISOR_REQUIRED`, `PRAXIS_POLICY_VETO`).

### 9.5 Decision ledger

- The synthetic audit ledger (`praxis-audit-ledger.v0`) appends
  entries of kinds `genesis`, `authority_decision`, `authority_issued`,
  `prepared`, `terminal_completed`, `terminal_uncertain`,
  `terminal_cancelled`, in a hash-chained, signature-verified sequence.
- Decision receipts (`praxis-decision-receipt.v0`) record grants and
  denials against a closed, stable denial-code set (see §6.4).
- The ledger records **authorization facts** (decisions, digests,
  finality), not private payloads. Terminal finality is preserved in
  receipts: a ledger MUST reject a terminal entry whose finality does
  not match the preparation (`PRAXIS_LEDGER_FINALITY_MISMATCH`).

### 9.6 Measured effects (P0.4)

Ported from the abandoned P0.4 effect-envelope branch
(`origin/feat/praxis-p0-4-effect-envelope`, docs commits `e8bd5b78`,
`10db62aa`, `4e68dfd8`), adapted to the winning measured-effects
line. The abandoned branch's separate "measured effect envelope"
helper design is **not** revived; the error-code namespace it used
(`PRAXIS_EFFECT_MEASUREMENT`, `PRAXIS_EFFECT_TAMPER`, etc.) does not
exist in the winning line.

1. **Declaration vs. measurement.** A governed program may declare
   what it expects an operation to do (`effect`, `irreversible`,
   `egress` on `op`), but it MUST NOT define the authoritative effect
   classification. The authoritative contract is measured by the
   synthetic host registry (`createHostOperationRegistry`), which
   binds action, scope, effect label, reversible/irreversible
   classification, and egress class/destination **outside governed
   source**.
2. **Exact match.** At terminal use, an effect-declaring operation
   MUST resolve to exactly one host contract for its action/scope.
   A missing or ambiguous mapping fails closed
   (`PRAXIS_HOST_OPERATION_REQUIRED`,
   `PRAXIS_HOST_OPERATION_AMBIGUOUS`), and the source declaration
   MUST match the host contract exactly — relabeling fails with
   `PRAXIS_LINK_MISMATCH`. The measured metadata is incorporated
   into the operation descriptor and exact operation digest.
3. **Effect envelopes are upper bounds.** A charter-root-signed
   effect envelope is a hard upper bound over measured effects for
   one chartered principal. It is not authority and cannot grant an
   operation by itself.
4. **Positive authority still comes only through the chartered
   permit/quorum path** (§9.1–§9.4): exact-operation policy
   premises, verified evidence, quorum rules, advisor vetoes, and
   freshness checks remain canonical.
5. **Measured effects require chartered authority.** Raw laboratory
   Permit/Lease/Quorum tokens are compatible only with unmeasured
   P0 operations. Presenting a measured operation without chartered
   authority is `PRAXIS_EFFECT_AUTHORITY_REQUIRED`; with chartered
   authority but no signed requester envelope it is
   `PRAXIS_EFFECT_ENVELOPE_REQUIRED`; a measured effect outside the
   envelope is `PRAXIS_EFFECT_ENVELOPE`. When an envelope exists, the
   older unmeasured path cannot be used to bypass it
   (`PRAXIS_EFFECT_REQUIRED`).
6. **Terminal finality.** Reversible measured effects terminate with
   `commit`; irreversible measured effects terminate with
   `finalize`. The static checker enforces this for declared effects
   (§4.6); the runtime enforces it for measured effects — `commit`
   of a host-measured irreversible effect is denied and `finalize`
   of a reversible or unmeasured effect is denied.
7. **Replay revalidates.** Prepared replay re-links measured
   operation metadata against the current host registry and
   re-checks the signed effect envelope before terminal execution;
   replay cannot switch terminal mode, change effect/egress
   metadata, or run without the required registry.
8. **Inert boundary.** The P0.4 slice performs no external effect.
   Failing closed on malformed/tampered seals, host/program
   relabeling, missing declarations, envelope widening, unpinned
   program identity, operation substitution, stale/invalid evidence,
   or terminal-mode drift. Rollback is deletion of the isolated
   module, tests, and documents — no production state or credential
   exists to unwind.
9. **Claim boundary (inherited).** This work does not claim production
   promotion, formal verification, generic rollback, live irreversible
   effects, network/provider execution, secret-byte access, or a second
   authority engine. Existing AXIOM authority remains separate; the
   chartered authority issuer remains the only positive authority
   source.

### 9.7 Secrets

Secrets are represented separately from values. The host supplies an
opaque `createHostSecretRef(...)` surrogate; Praxis source cannot read
secret bytes, observe a secret as knowledge, or pass a secret
reference as an ordinary operation argument (§4.4). The factory is a
laboratory reference constructor, not a secret manager or credential
resolver. Absent, forged, or wrong-kind secret references are denied
at runtime (`PRAXIS_HOST_SECRET_REQUIRED`,
`PRAXIS_HOST_SECRET_KIND_MISMATCH`).

### 9.8 Hostile IR

Compiled IR is untrusted. The runtime re-validates structural
integrity, binding kinds, exact-plan authority binding, quorum
threshold, information-flow restrictions, and prepared-effect
terminal linearity on every use — including hand-edited, re-sealed
IR. A charter may additionally pin exact `praxis-ir.v0` module
digests; when program pins are present, any source or re-sealed IR
whose digest is absent from the signed charter is refused
(`PRAXIS_PROGRAM_UNPINNED`). Pinning never relaxes the mandatory
runtime invariant re-checks.

---

## 10. Versioning policy

1. **v0 status.** This specification describes Praxis v0, the inert
   laboratory. Breaking changes to the grammar, static semantics, IR
   schema, canonical form, or digest rules are expected while the
   version is 0 and MUST be recorded here with a dated rationale.
2. **Schema identifiers.** Every wire/persistence schema carries an
   explicit version suffix and MUST change the suffix on any
   incompatible change: `praxis-ir.v0`, `praxis-charter.v0`,
   `praxis-signed-charter.v0`, `praxis-operation.v0`,
   `praxis-observation.v0`, `praxis-approval-request.v0`,
   `praxis-audit-ledger.v0`, `praxis-decision-receipt.v0`,
   `praxis-host-operation-registry.v0`, `praxis-semantic-conformance.v0`.
3. **Corpus versioning.** The conformance corpus schema and `version`
   field MUST advance together on incompatible corpus changes;
   `status` MUST remain `inert-laboratory-corpus` until a staged
   promotion decision (see `BOOTSTRAP.md`) explicitly changes it.
4. **Compatibility.** A v0 implementation MUST reject input claiming
   a newer schema version it does not implement rather than guessing.
   New optional surface (e.g. new `op` modifiers) SHOULD be additive;
   removing or redefining accepted syntax is a breaking change and
   MUST be treated as such.
5. **Promotion gates.** Evidence maturity (corpus coverage) and
   runtime authority are separate axes: P1/P2 work may advance while
   the authority stage remains P0. No stage transition is implied by
   this specification.

---

## 11. Known discrepancies (code wins)

1. **CLI format subcommand undocumented in README.** `README.md`
   describes the CLI as supporting only parsing, static checking, and
   IR inspection, but `cli.mjs` (since the formatter lane) also
   supports `format [--check] [file.prax|-]`. This spec documents the
   code's behavior in §7.
2. **`index.mjs` re-export surface.** The README examples imply a
   single public surface; in fact `index.mjs` deliberately does not
   re-export `format.mjs` (nor `ledger.mjs`, `effects.mjs`,
   `fuzz.mjs`, `bench.mjs` — following the `ledger.mjs` precedent,
   non-core utilities stay deep-importable but outside the public
   surface). This spec does not bless either choice; it records the
   code.
3. **Abandoned-branch error codes.** The salvaged P0.4 docs used an
   error-code namespace (`PRAXIS_EFFECT_MEASUREMENT`,
   `PRAXIS_EFFECT_TAMPER`, `PRAXIS_EFFECT_PROGRAM_UNPINNED`,
   `PRAXIS_EFFECT_TERMINAL_MODE`, `PRAXIS_EFFECT_UNDECLARED`) that
   was never merged. The winning line expresses the same denials
   with the codes in §6.4 (`PRAXIS_LINK_MISMATCH`,
   `PRAXIS_HOST_OPERATION_REQUIRED`, `PRAXIS_EFFECT_AUTHORITY_REQUIRED`,
   `PRAXIS_EFFECT_ENVELOPE[_REQUIRED]`, `PRAXIS_EFFECT_REQUIRED`,
   `PRAXIS_EFFECT_UNDECLARED`, `PRAXIS_PROGRAM_UNPINNED`,
   `PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE` /
   `PRAXIS_FINALIZE_REQUIRES_IRREVERSIBLE`). Porting maps the
   substance onto these codes, not the abandoned ones.

## 12. OPEN items

1. **Rollback semantics.** Explicitly pending in the conformance
   corpus (`pending-operation-specific-semantics`). No generic
   rollback primitive is specified; per-effect compensating semantics
   are undecided.
2. **Production executor ABI.** The `run()` injection surface
   (preparer, executor, completion recorder, canceler) is synthetic
   only. A production ABI, if any, is a separate staged decision.
3. **Pinned program digests vs. iterative development.** How
   `program_digests` charter pins interact with rapid
   edit-review cycles (pin granularity, pin lifecycle) is undecided.
4. **Human-minimum quorum semantics for non-interactive principals.**
   The `humans` field exists and is enforced, but which workflows
   legitimately require a human seat is policy, not language.
