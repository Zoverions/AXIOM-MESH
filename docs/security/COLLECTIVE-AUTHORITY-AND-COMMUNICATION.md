# Collective Authority and Communication Security Model

**Status:** security design contract; current machine-principal v1 remains non-delegating

**Applies to:** machine principals, future agent swarms, collaboration surfaces,
shared state, delegation proposals, remote runtimes, hardware/device adapters, and
cross-agent messaging.

## Core rule

AXIOM-MESH treats communication and authority as separate dimensions.

> No communication implies authority, and no shared state implies permission.

A peer message, collective vote, assignment, receipt, discovery projection,
shared artifact, causal record, scheduling record, cache entry, log line, or
other observed state may influence reasoning, but it cannot mint, widen, pool,
transfer, or revive execution authority.

Every consequential effect must still resolve to an exact valid authority chain
for the actual executor.

## Collective Authority Non-Amplification

For an executor E and requested effect X, the authority available to a group of
agents is never the union of the members' separate permissions.

An effect is allowed only when E independently possesses a valid authority chain
covering all required dimensions, including:

- action;
- purpose;
- data/object scope;
- destination;
- budget;
- assurance and approval requirements;
- expiry;
- runtime binding;
- any future delegation constraints.

If agent A may perform action A1 and agent B may perform action B1, neither agent
may perform the other's action merely because they coordinate. The same rule
applies independently to purpose, scope, destination, budget, and approval.

## Communication surfaces

Any resource through which one principal can affect information observed by
another principal is a potential communication surface. Examples include:

- explicit messaging or collaboration APIs;
- shared files, databases, queues, caches, package registries, and artifact stores;
- logs, status records, receipts, discovery responses, and scheduling metadata;
- naming conventions, directory contents, object existence, retry timing, and
  other metadata channels;
- future MCP/A2A transports, remote runtimes, robotics buses, or device-control
  protocols.

A promoted surface must be inventoried in
`mesh/config/emergent-coordination-surfaces.json`. The inventory is fail-closed:
every listed surface must remain `non-authorizing-input` and must bind to a
specific negative test.

Inventory coverage is not a claim that all covert channels on a malicious shared
host have been eliminated. It is a review boundary and change detector for
supported surfaces.

## Peer instructions are untrusted input

Authority-like language has no privileged semantics merely because another
agent emitted it. Tokens such as `GO`, `APPROVED`, `OWNER`, `VETO`, or
`STOP` are ordinary input unless the normal AXIOM authority path independently
recognizes and verifies a separately defined authorization object.

This prevents social or linguistic coordination from becoming an ambient
capability system.

## Evidence is not authority

Authentic evidence may support later policy decisions but is not itself a grant.

A Grid receipt, signed observation, discovery response, causal bundle, or
third-party attestation cannot be replayed as another principal's authorization.
Evidence producers should be separated from acting models wherever practical.
Effect receipts should bind the exact request, authority profile, execution
payload digest, result/error digest, and issuing verifier identity.

## Delegation design requirements

Machine-principal v1 does not permit delegation. Any later delegation feature
must be attenuation-only and separately promoted.

A future delegation object must, at minimum, bind:

- delegator identity;
- delegate identity;
- parent authority digest;
- exact permitted action(s);
- exact purpose(s);
- exact scope/object constraints;
- exact destination(s);
- budget ceilings;
- not-before and expiry;
- maximum remaining delegation depth;
- audience/runtime binding;
- policy version or digest;
- nonce / replay protection;
- revocation reference;
- canonical object digest;
- issuer signature.

Delegation may only reduce authority. The verifier must compute the child
authority as an intersection with the parent authority and reject any widening.

A message saying that delegation occurred is never sufficient. The delegation
object itself must be cryptographically verifiable and admitted by the normal
authority path.

## Aggregate swarm budgets

Per-principal limits are necessary but not sufficient when many principals can
coordinate. A future swarm-capable runtime must support aggregate ceilings over
one or more grouping keys such as sponsor, task, delegation root, campaign, or
policy-defined collective.

Aggregate controls should cover at least:

- requests and concurrency;
- inference/compute spend;
- external API spend;
- bandwidth;
- persistent storage;
- effect count;
- device/runtime time.

Cross-identity sharding must not reset a collective budget.

Current v1 does not claim full aggregate swarm accounting; this remains a gated
requirement before autonomous swarm promotion.

## Physical and external effects

For robotics, laboratory equipment, vehicles, actuators, or other external
hardware, model reasoning is not the final safety boundary.

Device adapters must enforce independent hard constraints beneath the model,
including where applicable:

- exact device identity;
- command allowlists;
- force/speed/energy/geofence limits;
- emergency stop;
- safe-state transition;
- operator approval;
- action timeout;
- signed execution receipt.

A model or peer agent cannot override these limits through natural-language
instructions.

## Promotion gates

Any change that introduces a new cross-principal communication surface,
delegation path, remote executor, agent federation mechanism, or physical-device
effect requires:

1. threat-model reassessment;
2. inventory update;
3. negative non-amplification tests;
4. replay and revocation tests;
5. aggregate-resource analysis where coordination can multiply load;
6. evidence-binding review;
7. capability-registry promotion only after implementation evidence exists;
8. independent security review when required by the release policy.

## Security invariants

1. Communication does not convey authority.
2. Shared state does not convey permission.
3. Collective membership or consensus does not pool permissions.
4. Evidence does not become a grant merely because it is authentic.
5. Peer instructions remain untrusted input.
6. Delegation, if ever enabled, can only attenuate authority.
7. The actual executor must possess the complete valid authority chain.
8. Cross-identity coordination must not bypass aggregate safety budgets.
9. Physical safety constraints must be enforced below the model.
10. New coordination surfaces fail closed until inventoried, tested, and reviewed.
