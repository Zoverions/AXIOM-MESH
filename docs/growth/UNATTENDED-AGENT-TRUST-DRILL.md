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

## Why this experiment exists

Current agent-builder discussions are converging on the same practical controls: sandboxing, scoped permissions, short-lived access, checkpoints, rollback, tool-call observability, and post-run verification. This experiment tests whether AXIOM's authority/evidence substrate is understandable and useful to those builders without weakening the project's security or promotion boundaries.
