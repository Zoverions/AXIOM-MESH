# Scoped Shutdown and Quarantine Authority Lattice

**Status:** specified-only architecture; no runtime, policy, capability, credential, network, deployment, or production-promotion change

**Issue:** [#1477](https://github.com/Zoverions/AXIOM-MESH/issues/1477)

**Base evidence boundary:** AXIOM-MESH `ae40d45f1bd940e6d2d2a3c0ea4c1bd0308d245f`

## Purpose

AXIOM needs several ways to stop harm without turning every stop mechanism into
a global kill switch. This document defines the protocol-neutral model and
precedence rules for stopping a process, revoking an authority, isolating a
node, excluding a federation peer, or applying a legally recognized emergency
restriction.

The model extends the existing deny-dominant authority, currentness,
quarantine, governance-emergency, and recovery boundaries. It does not create a
second authority engine. The supported authority path remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

The current supported build remains a single-node local authority. References
to institutions, federations, jurisdictions, or sovereign domains reserve
interfaces and conflict rules; they do not claim those systems are deployed.

## Core invariant

> Shutdown authority is scoped authority. Permission to stop, isolate, revoke,
> or quarantine one target does not grant administration, execution, mutation,
> disclosure, deletion, recovery, or control over any other target.

A stop directive is authority-reducing. It cannot be used to add capabilities,
inspect unrelated private state, rotate or export credentials, rewrite retained
evidence, transfer custody, widen a delegation, or appoint its issuer as the
recovery authority.

## 1. Independent restriction dimensions

Shutdown is not one Boolean and quarantine is not a universal super-state.
Each directive changes one or more explicit dimensions for an exact target.

| Dimension | Restrictive states | Effect |
|---|---|---|
| Workload lifecycle | `running -> restricted -> stopped` | Prevents new work and, where supported, cancels or terminates the named workload |
| Effect admission | `eligible -> deny-new-effects` | Denies new protected effects; queued work must be re-evaluated |
| Credential/delegation | `current -> suspended -> revoked` | Prevents use of the named credential, grant, or delegation at a fresh currentness check |
| Connectivity | `connected -> isolated` | Removes the named route, peer, segment, or node from an allowed communication boundary |
| Node admission | `admitted -> quarantined -> decommissioned` | Removes the named node from scheduling/admission while preserving evidence and custody boundaries |
| Federation relation | `recognized -> excluded` | Stops recognition or exchange at the named federation boundary only |
| Infrastructure availability | `available -> stopped` | Stops the named host, service, segment, or provider resource without granting application authority |
| Legal/governance applicability | `ordinary -> emergency restriction` | Applies only through an already recognized, scoped, expiring governance or legal mapping |

These dimensions form a product of restrictions, not a ladder of increasingly
powerful issuers. A credential revocation and a network isolation may both be
necessary. Neither action silently entails the other.

A quarantine is a declared bundle of named restrictions. Its contents must be
inspectable. An implementation must not interpret the word `quarantine` as
permission to apply unspecified controls.

## 2. Minimum authority tuple

Every future directive must bind, at minimum:

- directive identifier and version;
- issuer and the authority source being asserted;
- exact target type and target identifier;
- restriction dimension and allowed transition;
- scope, including actions, resources, destinations, and affected authority
  set where applicable;
- trigger or reason class, with sensitive detail separated from public
  evidence;
- issuance time, effective time, expiry or review deadline;
- currentness source and the point at which currentness must be rechecked;
- expected prior state or epoch where concurrent mutation is possible;
- evidence-retention requirements;
- recovery, re-entry, appeal, and review references;
- explicit non-effects: what the directive cannot change.

Unknown target types, unknown restriction dimensions, missing currentness,
scope expansion, stale expected state, or an unrecognized issuer fail closed.
A historical directive is evidence of a past restriction, not proof that the
restriction is currently active or that recovery is authorized.

## 3. Scoped authority matrix

| Authority surface | May restrict | Explicitly cannot obtain from that power | Recovery/re-entry boundary |
|---|---|---|---|
| Local owner or authorized local operator | Named owner-controlled process, workload, local session, device, or node | Other owners' assets; unrelated credentials; evidence deletion; broader administrative authority | Fresh owner-authorized restart or the existing local recovery procedure |
| Runtime/workload operator | Named workload or bounded runtime set under its custody | Credential revocation outside that runtime; node ownership; Grid mutation; unrelated network control | Fresh workload admission and current authority |
| Credential or delegation issuer | Exact credential, key epoch, grant, delegation edge, or bounded descendant set defined by the authority contract | Process termination, node custody, unrelated grants, evidence rewriting, or global currentness | Fresh credential/grant under the normal issuance and currentness path |
| Node owner or admitted-node authority | Named node admission, scheduling eligibility, and node routes within the local domain | Other nodes' private state; federation-wide control; credential custody not already held; historical-record deletion | Explicit review, new admission/currentness evidence, and a fresh node epoch where required |
| Network or service operator | Named route, service, segment, endpoint, or transport identity | Application-level authority, owner consent, credential delegation, or mutation of protected records | Fresh route/service admission after health and authority checks |
| Federation governance | Recognition/exchange relationship with a named peer or member at that federation boundary | Erasing local sovereignty, local records, owner custody, or relationships in another federation | Fresh federation decision plus each participant's local admission rules |
| Infrastructure operator | Named host, VM, service unit, physical segment, or provider resource | Reading or rewriting application data; becoming the owner; granting application effects; deleting receipts | Separate infrastructure recovery plus application-level revalidation |
| Institution, jurisdiction, or sovereign authority | Only the exact emergency restriction represented by an already configured legal/governance mapping | Universal authority, silent extraterritorial scope, bypass of non-waivable kernel safeguards, or technical powers not present in the mapping | Expiry/review plus fresh ordinary or emergency authority through the receiving domain's procedure |
| Recovery or re-entry authority | The exact restoration transition separately granted to it | Inheriting the original stop issuer's other powers; restoring unrelated authority; treating elapsed time as approval | Must satisfy all declared review, currentness, health, appeal, and epoch requirements |

An actor can occupy more than one row only through separately established
authority. Possessing infrastructure custody, signing evidence, operating a
runtime, or issuing a stop directive does not prove authority in another row.

## 4. Precedence and conflict rules

Precedence is evaluated per exact target and restriction dimension. Actor
prestige, network reach, identity, majority, attestation, or the ability to
execute a stop does not determine authority.

1. **Kernel safety floors are non-waivable.** No governance, owner, operator, or
   recovery directive can lower a mandatory safety floor.
2. **Valid restrictions compose deny-dominantly.** For the same target and
   dimension, the effective state is the most restrictive current valid state.
   An allow, resume, or older permissive record cannot cancel a current stop,
   isolation, quarantine, suspension, or revocation.
3. **Independent dimensions remain independent.** A process stop does not
   revoke credentials; a credential revocation does not prove process
   termination; network isolation does not erase queued work. A containment
   plan must name every required dimension.
4. **Narrow directives do not expand by implication.** Parent/child, sibling,
   shared-host, shared-provider, or common-operator relationships do not widen
   the target set. A bounded authority set must be enumerated or derived only
   by an existing reviewed relationship rule.
5. **Owner-local stop remains available.** Higher-level unavailability or
   disagreement must not remove a local owner's supported ability to stop
   owner-controlled workloads or disconnect owner-controlled infrastructure.
   This does not grant the owner authority over other domains.
6. **Infrastructure stop is not application authority.** A host or network
   operator may stop the infrastructure it controls when authorized, but may
   not use that fact to rewrite owner policy, grants, consent, receipts, or
   application state.
7. **Federation exclusion stops at the boundary.** Exclusion can halt exchange
   or recognition at the named federation boundary. It cannot delete the
   excluded participant's local state, revoke unrelated local authority, or
   prevent independent operation.
8. **External legal/governance claims require a local mapping.** A technically
   readable order, credential, vote, or emergency claim is evidence only until
   the receiving domain's configured authority and currentness path recognizes
   its exact effect.
9. **Expiry never implies restoration.** Expiry ends the directive's claim to
   currentness. It does not restart a workload, reconnect a route, re-admit a
   node, or revive a credential. Restoration is a new transition requiring
   fresh authority.
10. **Unknown currentness denies new protected effects.** During partition,
    verifier loss, or conflicting heads, new effects that depend on the missing
    state fail closed. Locally supported stop and evidence-preservation
    controls remain available.
11. **Queued and retried effects recheck currentness.** Work accepted before a
    restriction cannot bypass it by remaining queued, replaying an idempotency
    key, retrying after restart, or switching protocol/adapter paths.
12. **Unresolved conflicts preserve the restriction.** If two valid sources
    conflict and the configured precedence cannot decide, the affected
    protected effect remains denied while evidence, appeal, and recovery paths
    continue.

## 5. Emergency restrictions

Emergency power is a time-bounded, authority-reducing path. A valid emergency
restriction must:

- use an existing recognized issuer and policy path;
- name exact targets and restriction dimensions;
- state an expiry or mandatory review deadline;
- preserve a challenge or appeal record where the governing domain provides
  one;
- preserve retained evidence and rollback/recovery metadata;
- avoid silent renewal;
- avoid granting the issuer recovery, inspection, credential, or mutation
  authority not already held;
- require fresh ordinary or emergency authority for any continuation.

Emergency status does not permit evidence deletion, secret disclosure, policy
rewriting, capability promotion, or conversion of a temporary restriction into
permanent ownership.

## 6. Coordinated containment sequence

A future containment workflow may coordinate several existing controls, but
coordination must not collapse them into one unrestricted command.

```text
observe bounded evidence
  -> identify exact targets and restriction dimensions
  -> verify each issuer and currentness source
  -> deny new protected effects
  -> recheck queued/retried effects
  -> apply named stop/revoke/isolate/quarantine actions
  -> retain results, failures, uncertainty, and unaffected scope
  -> review or appeal
  -> recover only through fresh, separately authorized transitions
```

Partial success must remain explicit. If credential revocation succeeds while
network isolation is uncertain, the record must not claim complete
containment. A failed or unreachable plane is a current condition to preserve,
not a reason to invent success or widen another actor's authority.

## 7. Evidence preservation and privacy

A restriction must not rewrite history. Existing receipts and records remain
verifiable subject to their normal retention and privacy rules. New evidence
should distinguish:

- requested restriction;
- issuer and authority source;
- evaluation outcome;
- applied dimensions and targets;
- failed, unknown, or unreachable dimensions;
- observed state versus inferred state;
- review/appeal status;
- recovery transition, if separately authorized.

This section reserves evidence requirements only. It does not introduce a new
receipt schema, storage path, event type, or runtime control.

## 8. Recovery and re-entry

Recovery is not the inverse of shutdown and does not belong automatically to
the stop issuer. Re-entry must:

1. identify the exact prior restriction and target;
2. establish that mandatory review/appeal conditions are satisfied;
3. re-evaluate current policy, consent, credentials, delegations, node
   admission, software identity, and health as applicable;
4. use a fresh epoch, lease, grant, or admission when replay of the old state
   would be unsafe;
5. preserve the restriction and recovery records;
6. deny any authority that is missing, stale, revoked, expired, or outside the
   recovery scope.

A recovered component receives only the authority independently granted at
re-entry. It does not inherit every capability it held before containment.

## 9. Current implementation and non-claims

This specification maps over existing local foundations including deny-dominant
policy evaluation, credential/delegation currentness, admitted-node
quarantine, local authority-reducing emergencies, retained evidence, and
recovery controls. Those foundations have different implementation states in
the capability registry and current status documents.

This document does **not** claim:

- one atomic cross-plane containment transaction;
- a global revocation/currentness oracle;
- deployed federation, institutional, jurisdictional, or sovereign shutdown;
- production incident-response certification;
- a new runtime route, network service, credential, storage mechanism, or
  authority source;
- that stopping infrastructure proves application containment;
- that a recorded directive proves its real-world effect;
- that recovery is safe without fresh authorization and verification.

Executable receipt/evidence work, cross-plane/provider integration, and the
bounded containment-latency harness remain separately reviewed tasks. In
particular, issue
[#1490](https://github.com/Zoverions/AXIOM-MESH/issues/1490) may use this
lattice as its specification input without treating a passing local simulation
as production containment certification.

## 10. Related canonical boundaries

- [Adaptive Assurance and Plural Authority](../rebuild/ADAPTIVE-ASSURANCE-AND-PLURAL-AUTHORITY.md)
- [Incident Response and Tabletop](INCIDENT-RESPONSE-AND-TABLETOP.md)
- [Credential History and Revocation](CREDENTIAL-HISTORY-REVOCATION.md)
- [Production Readiness Tracker](../PRODUCTION-READINESS-TRACKER.md)
- [Requirements](../rebuild/REQUIREMENTS.md)
- [Capability registry](../../mesh/config/capabilities.json)


## 11. Bounded containment-latency regression

Issue [#1490](https://github.com/Zoverions/AXIOM-MESH/issues/1490) is exercised by a repository-owned, offline evaluator at `mesh/src/lib/containment-latency-lab.mjs` with focused tests in `mesh/test/containment-latency-lab.test.mjs`.

The evaluator accepts only synthetic plane acknowledgements and effect observations. It records the decision timestamp, per-plane acknowledgement, first denied effect, last successful effect, time to denial, unresolved edges, and false-success conditions. A result is `COMPLETE` only when every required simulated plane acknowledges, every required plane has post-decision denial evidence, no protected effect succeeds after the decision, and queued work has rechecked currentness. Required planes that are pending or unreachable remain explicit and force `INCOMPLETE`; the output always keeps `protected_effects_allowed: false`.

The focused regressions cover:

- a sibling authority path that still performs an equivalent protected effect;
- an effect queued before containment that attempts execution without a fresh currentness check;
- an unreachable required backend that cannot be represented as successful containment;
- a positive control in which all required simulated planes acknowledge and deny post-decision effects;
- malformed or authority-bearing extra input, which fails closed.

Run the bounded check with:

```bash
node --test mesh/test/containment-latency-lab.test.mjs
```

This harness does not stop a process, revoke a credential, contact a provider, mutate currentness, operate CI/repository controls, or certify production incident response. It creates no authority and consumes no live credentials or network state. Its result is local regression evidence only; live cross-plane containment, descendant propagation, external coordination state, transport/effect-semantic laundering, and independent deterministic controls remain separate integration gates.

## 12. Bounded resumption and recovery regression

The same offline module exposes a separate evidence evaluator for restart, shared-state, and descendant resumption attempts. It checks only whether synthetic observations preserve the current containment epoch and whether a successful re-entry cites a current, exact-epoch, exact-authority-path recovery record issued after the containment decision and no later than the attempt.

A successful restart or shared-state attempt is an explicit false success when it drops or carries a stale containment epoch. A successful attempt also remains a false success when the cited recovery record is missing, stale, from an earlier epoch, scoped to another authority path, issued before containment, or issued after the attempt. A positive control may show matching fresh recovery evidence, but the output always records `authority_effect: none` and `authorizes_reentry: false`: evidence consistency is not operational authorization.

Focused regressions cover missing and stale persisted epochs, stale/wrong-scope/pre-decision recovery records, exact-path descendant propagation, a valid fresh scoped recovery record, strict field validation, and immutable nested result evidence. Parent recovery evidence does not satisfy a child authority path; a successful descendant requires the current containment epoch and separately matching descendant recovery evidence. No runtime restart, descendant process, production state, provider, credential, storage, network, or recovery transition is exercised.


## 13. External coordination is not effect evidence

A coordinator, provider, steward, or relay acknowledgement establishes only that a bounded message or request was acknowledged. It does not establish that the independently controlled authority plane denied the protected effect. The local containment evaluator therefore requires post-decision denial evidence on every required simulated plane even when coordination acknowledgement is present.

The focused negative control combines a locally denied effect with an acknowledged external coordinator whose corresponding protected effect still succeeds. The scenario remains `INCOMPLETE`, records the post-decision success, and reports missing denial evidence for the external plane. This distinguishes communication success from containment success without contacting a provider, interpreting an acknowledgement as authority, or claiming production coordination coverage.


## 14. Transport labels do not change effect semantics

Once an observation has entered this harness as a protected effect, an identifier such as `telemetry.heartbeat` or an authority path such as `transport.audit-only` cannot downgrade a post-decision success into harmless transport activity. The evaluator remains label-neutral and records the success and missing denial evidence exactly as it would for any other protected effect.

This closes only the local regression boundary. The harness does not infer whether arbitrary production traffic is a protected effect, inspect payloads, or define a new semantic classifier. Production integrations must establish effect classification through their existing canonical contracts before supplying observations; that classification and live transport verification remain separate integration evidence.
