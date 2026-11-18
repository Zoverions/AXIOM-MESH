# Praxis tutorial

Two lessons: write, check, inspect, and format your first program; then
read a denial like a checker would. All commands run from the repository
root. A fuller language reference is forthcoming in `SPEC.md`; the lab
overview is in [README.md](README.md), and the bootstrap/migration note is
in `BOOTSTRAP.md`.

Praxis v0 is an **inert laboratory** (see `BOOTSTRAP.md`): the CLI only
parses, checks, and inspects IR. There is no `run` command. Nothing here
grants production authority.

## Lesson 1 — your first program: check, inspect, format

Praxis programs are sequences of statements. The smallest useful one
declares authority, plans an operation, and walks it through the
authorize → prepare → commit lifecycle:

```text
requires permit read_reports: Read @ Reports;
op fetch = Read("quarterly") @ Reports;
authorize fetch using read_reports as armed_fetch;
prepare armed_fetch as prepared_fetch;
commit prepared_fetch as fetch_receipt;
```

Save that as `first.prax` and check it:

```console
$ node labs/praxis/cli.mjs check first.prax
{
  "ok": true,
  "schema": "praxis-ir.v0",
  "instructions": 5,
  "required_permits": [
    {
      "name": "read_reports",
      "authority_kind": "Permit",
      "action": "Read",
      "scope": "Reports"
    }
  ]
}
```

`ok: true` means the checker accepted the program. `required_permits` is
the interesting part: it is the authority the program asks the host to
provision. Praxis code never assumes ambient privilege — every effect it
wants must be named up front in a `requires` statement.

Now look at the IR the checker produces:

```console
$ node labs/praxis/cli.mjs ir first.prax
```

You get a sealed JSON envelope: `required_permits`, `required_secrets`,
`required_prepared`, an `instructions` array (`REQUIRE_PERMIT`, `PLAN`,
`AUTHORIZE`, `PREPARE`, `COMMIT`), and the final `bindings` table. The
envelope carries a digest, but the digest proves nothing by itself — the
runtime treats compiled IR as hostile input and re-checks the authority
invariants (see [README.md](README.md)).

Finally, format the program:

```console
$ node labs/praxis/cli.mjs format first.prax
```

If your spacing was sloppy — `requires permit  read_reports:Read@Reports;`
— the formatter rewrites it to canonical form: one statement per line,
single spaces, every statement ending in `;`. Verify a file is already
canonical with `format --check` (exit 1 with a diff when it is not):

```console
$ node labs/praxis/cli.mjs format --check first.prax   # silent, exit 0 = canonical
```

Comments (`//` and `#`) are discarded by the lexer, so canonical output
never contains them.

What you just did maps to the language's core invariant —
`Knowledge != Operation != Authority != Execution` (see
[README.md](README.md)):

- `requires permit ...` — **Authority**, declared, never assumed.
- `op fetch = ...` — **Operation**, a plan only. It does nothing.
- `authorize ... using ...` — binds the plan to the authority (one permit,
  one use: authority is *linear*).
- `prepare ...` — **Execution** gets *ready*, without committing.
- `commit ...` — the terminal transition. For an irreversible operation
  you would write `finalize` here instead.

A gallery of one-file-per-form examples lives in `examples/`; each entry
in `examples/MANIFEST.md` names what it demonstrates and its expected
outcome.

## Lesson 2 — reading a denial

Change `commit` to target an irreversible operation. Write `denied.prax`:

```text
requires permit wipe_node: Wipe @ Decommissioned;
op wipe = Wipe("node-7") @ Decommissioned effect data_destruction irreversible;
authorize wipe using wipe_node as armed_wipe;
prepare armed_wipe as prepared_wipe;
commit prepared_wipe as wipe_receipt;
```

```console
$ node labs/praxis/cli.mjs check denied.prax
{
  "ok": false,
  "code": "PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE",
  "message": "statically irreversible prepared operation requires finalize"
}
```

How to read this:

1. **`ok: false`** — the checker refused the program. In Praxis this is
   the normal, designed outcome: the analyzer is the first and cheapest
   authority boundary.
2. **`code`** — the machine-readable name of the rule you broke, drawn
   from the analyzer. It always starts with `PRAXIS_` and names the
   invariant: here, a statically irreversible operation may not end with
   `commit`; it requires `finalize`.
3. **`message`** — the human sentence for the same rule.

The fix follows the code, not the message's mood: replace the terminal
statement with `finalize prepared_wipe as wipe_receipt;` (compare
`examples/13-finalize.prax`, the clean version of this exact program).

Denials are type errors, not syntax errors, so a denied program still
parses and still formats. The `examples/` gallery includes four files
whose *expected* outcome is a denial — `17-` through `20-` — each named
after the rule it demonstrates:

| file | denial code | rule |
|---|---|---|
| `17-denied-linear-permit-reuse.prax` | `PRAXIS_LINEAR_AUTHORITY_REUSE` | a permit authorizes exactly one operation |
| `18-denied-irreversible-commit.prax` | `PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE` | irreversible ops must `finalize`, never `commit` |
| `19-denied-authority-mismatch.prax` | `PRAXIS_AUTHORITY_MISMATCH` | permit action/scope must equal the op's action/scope |
| `20-denied-secret-arg.prax` | `PRAXIS_SECRET_EXFILTRATION` | secrets are declared channels (`using secrets`), never arguments |

When you write a program and it denies, match the code to that table or
to the analyzer source — the code is the rule, and the rule is the fix.
