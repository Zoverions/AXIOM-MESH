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

## Focused MCP metadata boundary

Campaign: `ua-2026-09-18-mcp-metadata-boundary`

The broad harness drill produced no measurable activation at its initial checkpoint, so this follow-up narrows the test surface to an existing offline read-only MCP laboratory.

The intended property is:

> MCP discovery, client metadata, protocol metadata, or a changed tool mapping must not silently become authority.

Run:

```bash
npm run agent-commons:mcp-readonly:check
node --test mesh/test/agent-commons-mcp-readonly.test.mjs
```

The laboratory has no network listener, no session state, no write-capable tools, no private Grid access, no machine-authority mapping, and no production MCP compatibility claim. Useful counterexamples include hostile metadata changing an accepted result, changed tool maps reaching a different C0 method without rejection, protocol/routing disagreement being accepted, or client-supplied capabilities becoming permission.

Public challenge: https://github.com/Zoverions/AXIOM-MESH/issues/1685

## Physical-action authority challenge

Campaign: `ua-2026-09-18-physical-action-authority`

Current MCP adoption is moving agent calls into physical environments. Google Home's Home MCP early access, for example, exposes device discovery, state/history access, and a `run_home_actions` tool while explicitly warning that connecting a real home to an AI agent can produce unexpected or undesired behavior.

AXIOM-MESH does **not** claim Google Home compatibility. The acquisition experiment uses that current problem class only as a falsification target for an existing merged authority primitive.

PR #1707 added an inert **Plural Capability Lease candidate evaluator**. It evaluates exact bounded scope, threshold approvals, required authority classes, distinct authority domains, expiry/currentness, duration ceilings, and scope-digest binding while returning no executable authority:

- `authority_effect: none`
- `runtime_activation: false`
- `capability_registry_change: false`
- `requires_effect_admission: true`

Run its hostile tests:

```bash
node --test mesh/test/plural-capability-lease.test.mjs
```

For a smart-home, robotics, IoT, or physical-agent scenario, try to make a low-consequence approval authorize a different or higher-consequence effect; reuse an approval against a different scope digest; satisfy a threshold with duplicate/same-domain approvals; accept revoked, expired, unknown-currentness, or overlong approvals; or smuggle runtime activation, authority effects, registry promotion, or renewal into the candidate.

Relevant public artifacts:

- evaluator: `mesh/src/lib/plural-capability-lease.mjs`
- hostile tests: `mesh/test/plural-capability-lease.test.mjs`
- merged implementation: https://github.com/Zoverions/AXIOM-MESH/pull/1707
- public challenge: https://github.com/Zoverions/AXIOM-MESH/issues/1712
- current external problem context: https://developers.home.google.com/mcp/home

The property to preserve is simple: **discovery and model intent must remain separate from authority to cause a physical effect.**

## One-command local-agent authority check

Campaign: `ua-2026-09-19-local-is-not-authority`

Local execution is useful for privacy and latency, but it does not itself establish what an agent is authorized to do. This lower-friction follow-up combines two existing inert security surfaces into one source-level check. The command is pinned to exact verified repository commit `a978c90a11b63e0e8b8441876378a26304aea46a` so a reported result is reproducible rather than silently following moving `main`:

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git && \
cd AXIOM-MESH && \
git checkout --detach a978c90a11b63e0e8b8441876378a26304aea46a && \
node --test mesh/test/agent-commons-mcp-readonly.test.mjs mesh/test/plural-capability-lease.test.mjs
```

The first surface tests that client/discovery metadata, claimed capabilities, routing ambiguity, protocol mismatch, unknown tools, and non-empty arguments cannot silently enlarge the fixed MCP read-only map or become permission. The second tests exact scope binding, threshold and distinct-domain requirements, expiry/currentness, duration ceilings, and attempts to smuggle runtime activation or authority effects into an inert plural-capability-lease candidate.

A passing run is only the baseline. The useful result is a reproducible counterexample: metadata changes an accepted mapping/result, approval evidence is reusable against a different scope, duplicate/same-domain approvals satisfy independence, stale/revoked evidence is accepted, or an inert/read-only path reaches consequential authority.

Report the exact commit SHA, exact command or request frame, expected boundary, observed result, and the smallest safe evidence needed to reproduce it. This remains a source-level falsification exercise: no production MCP compatibility, live deployment, remote-attestation, smart-home integration, or external-effect authority is claimed.

## Contribution target

The most useful contribution is a concrete counterexample: a reproducible case where the current harness allows more authority than intended, loses provenance, misrepresents uncertainty, or makes recovery unsafe.

Open an issue in the AXIOM-MESH repository with:

- the exact command or scenario;
- expected boundary;
- observed behavior;
- whether the result is reproducible;
- any evidence or logs that can be shared safely.

Repository: https://github.com/Zoverions/AXIOM-MESH

Do not include secrets, private credentials, personal data, household/camera data, OAuth tokens, or production access tokens.

## Why these experiments exist

Current agent-builder discussions are converging on practical controls such as sandboxing, scoped permissions, short-lived access, metadata integrity, checkpoints, rollback, tool-call observability, independent approval, and post-run verification. These experiments test whether AXIOM's authority/evidence substrate is understandable and useful to builders facing those problems without weakening the project's security or promotion boundaries.
