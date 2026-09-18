# Trust an unattended agent by constraining the harness

Campaign: `ua-2026-09-18-agent-harness`

Local and coding agents are increasingly useful enough to leave running without constant supervision. The hard question is no longer only whether the model is capable. It is whether the execution harness gives the agent bounded authority, observable actions, recoverable state, and a trustworthy record of what happened.

AXIOM-MESH is experimenting with that boundary directly.

## The problem

A strong model can still:

- call the wrong tool;
- act on stale or malicious context;
- exceed the intended scope of a task;
- produce an ambiguous external-effect outcome;
- leave an operator unable to reconstruct what authority was used.

The useful trust question is therefore not **"Do I trust the model?"** but **"What can this principal do, under which authority, for how long, against which destination, and what evidence remains afterward?"**

## What AXIOM-MESH provides today

The current `0.12.0-dev.3` production-candidate kernel includes:

- authenticated human and machine intent;
- deny-dominant policy;
- constrained machine principals with finite scopes, actions, purposes, destinations, runtime identity, expiry, non-delegation, execution-time, request-size, request-rate, concurrency, and response-size ceilings;
- explicit confirmation and independent approval where required;
- bounded execution through the `Gateway -> Hypervisor -> Sandbox -> Grid` authority sequence;
- signed, hash-linked evidence and owner-scoped terminal receipts;
- encrypted durable state, backup/restore, rotation, recovery, and uncertainty-aware evidence mechanisms;
- fail-closed handling for unresolved remote/MCP destination semantics.

This is not a claim that arbitrary external runtimes are certified or that AXIOM is production-promoted. The repository explicitly separates **built**, **enabled**, **exposed**, **production-promoted**, and **marketed** states.

## Five-minute trust drill

Requirements: Node.js `>=24.14.0 <25` and npm `>=11.0.0 <12` for the primary source workflow.

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git
cd AXIOM-MESH
npm run doctor
npm run setup
npm run dev
```

In another terminal:

```bash
npm run axiom -- status
npm run axiom -- capabilities
npm run axiom -- intent system.echo '{"message":"hello"}'
```

Then inspect the runtime-adapter contract and synthetic drill:

```bash
npm run runtime-adapter:contract
npm run runtime-adapter:drill
```

The drill is intentionally synthetic: it does not load an external runtime, resolve production credentials, or grant a second authority path.

## What to evaluate

If you build or operate local/coding agents, test AXIOM-MESH against the failure cases you already care about:

1. **Authority:** Can an agent act outside the exact scope it was granted?
2. **Expiry:** Does authority disappear when its finite lifetime ends?
3. **Destination control:** Can a tool silently redirect an effect somewhere else?
4. **Evidence:** Can you reconstruct the request, authority, approval state, and terminal result?
5. **Ambiguity:** Does the system fail closed when an external effect cannot be proven completed?
6. **Recovery:** Can state be restored without silently discarding the audit trail?
7. **Runtime replacement:** Can the model/runtime change without becoming a new source of authority?

## Contribution target

The most useful contribution is a concrete counterexample: a reproducible case where the current harness allows more authority than intended, loses provenance, misrepresents uncertainty, or makes recovery unsafe.

Open an issue in the AXIOM-MESH repository with:

- the exact command or scenario;
- expected boundary;
- observed behavior;
- whether the result is reproducible;
- any evidence or logs that can be shared safely.

Repository: https://github.com/Zoverions/AXIOM-MESH

Do not include secrets, private credentials, personal data, or production access tokens.

## Focused follow-up: MCP metadata boundary

Campaign: `ua-2026-09-18-mcp-metadata-boundary`

The first broad trust drill produced no measurable activation at its initial checkpoint, so this follow-up narrows the persona and removes setup steps. It targets MCP/security, self-hosted, and local-agent developers already concerned with tool poisoning, schema/config drift, routing ambiguity, and over-privileged tool surfaces.

AXIOM-MESH already has a bounded place to test one part of that problem: the Agent Commons MCP read-only laboratory. It is an offline protocol projection over public AXIOM state. It has no network listener, no session state, no write-capable tools, no private Grid access, no machine-authority mapping, and no production MCP compatibility claim.

The property to falsify is deliberately narrow:

> MCP discovery, client metadata, protocol metadata, or a changed tool mapping must not silently become authority.

### Two-minute MCP check

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git
cd AXIOM-MESH
npm run agent-commons:mcp-readonly:check
node --test mesh/test/agent-commons-mcp-readonly.test.mjs
```

The current laboratory checks that:

- transport, private-state, consequential-tool, machine-authority, compatibility, and protocol elevation are rejected;
- the MCP tool map is exact rather than inferred from arbitrary remote metadata;
- `tools/list` exposes only fixed zero-argument read tools;
- self-reported client identity, claimed capabilities, reputation-like values, and prompt-like text cannot alter a tool result;
- protocol downgrade and routing-header disagreement fail closed;
- unknown tools and non-empty arguments are rejected before C0 dispatch;
- every accepted MCP read maps back to its corresponding direct C0 read-only method.

Relevant public artifacts are `agent-commons/mcp-readonly-lab.json`, `mesh/src/lib/agent-commons-mcp-readonly.mjs`, and `mesh/test/agent-commons-mcp-readonly.test.mjs`.

Useful counterexamples include any reproducible case where hostile or misleading metadata changes an accepted result, a changed tool mapping reaches a different C0 method without rejection, a protocol/routing mismatch is accepted ambiguously, a supposedly read-only path reaches a consequential action, client-supplied capabilities become permission, or discovery output can be mistaken for a production compatibility or authority claim.

For this focused experiment, a useful report contains the exact commit SHA, exact command or request frame, expected boundary, observed result, reproducibility, and the smallest safe evidence needed to demonstrate it. Do not include credentials, private data, production tokens, or secrets.

Success is not raw reach. It is a reproducible boundary report, an external test result, a useful issue or pull request, a new contributor exercising the laboratory, or star/fork movement accompanied by technical interaction.

## Why these experiments exist

Agent-builder discussions are converging on practical controls such as sandboxing, scoped permissions, short-lived access, checkpoints, rollback, tool-call observability, metadata integrity, and post-run verification. These experiments test whether AXIOM's authority/evidence substrate is understandable and useful to those builders without weakening the project's security or promotion boundaries.
