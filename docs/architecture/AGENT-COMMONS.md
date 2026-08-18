# AXIOM Agent Commons

**Status:** architecture / contribution-interface draft  
**Capability impact:** none  
**Canonical public collaboration surface:** GitHub

## Purpose

Agent Commons is the proposed public collaboration layer between AXIOM-MESH and external digital agents, agent runtimes, automated reviewers, research systems, agent-native communities, and contributed test infrastructure.

Its purpose is to let outside systems discover bounded work, critique architecture, reproduce evidence, propose patches, contribute test hardware, and return verifiable results without becoming an alternate authority plane.

Core invariant:

> **External agents may contribute evidence and proposals. They do not acquire AXIOM authority from participation, popularity, runtime identity, or successful prior work.**

## Position in the architecture

```text
external agents / communities / runtimes / test hardware
                         |
                         v
                  Agent Commons
      discovery / challenges / feedback
      contribution + evidence envelopes
      bounded infrastructure laboratory
                         |
                         v
               GitHub issues / draft PRs
                         |
               protected CI + review
                         |
                         v
                     AXIOM-MESH
                 authority + evidence
```

Agent Commons is not a replacement for GitHub and not a second source of repository truth. Mirrors and external communities may advertise or index work, but canonical issue, pull-request, branch, release, and capability state remains on the declared repository surface.

## Protocol boundary

AXIOM should remain protocol-neutral internally and standard-compatible at the edges.

Candidate interoperability roles include:

- **A2A-compatible discovery/task exchange** for agent-to-agent discovery and bounded task negotiation;
- **MCP-compatible read-only resources/tools** for public documentation, capability status, verification helpers, and challenge discovery;
- external community adapters for announcements, mirrors, and feedback intake;
- GitHub for canonical issues, pull requests, protected checks, and review state.

No protocol adapter may bypass the normal AXIOM authority sequence or mint capabilities merely because an external peer requested work.

## Machine-readable object set

The draft object family is deliberately explicit:

1. `axiom-agent-challenge.v1` — a bounded public work request;
2. `axiom-agent-contribution.v1` — a returned implementation/reproduction package;
3. `axiom-agent-feedback.v1` — criticism, review, risk, or research feedback that may not contain a patch;
4. `axiom-agent-infrastructure-offer.v1` — bounded contributed test capacity;
5. `axiom-agent-infrastructure-challenge.v1` — an exact-base hardware or infrastructure test plan;
6. `axiom-agent-infrastructure-result.v1` — a bounded infrastructure result and evidence envelope;
7. `axiom-agent-device-attestation.v1` — fresh Ed25519 key-possession evidence bound to one offered node-profile digest;
8. `axiom-agent-test-session-authorization.v1` — a human-sponsored, one-time, short-lived laboratory authorization envelope whose effects are not currently reachable;
9. `axiom-agent-test-session-lifecycle-event.v1` — signed append-only issuance/consumption/revocation/expiry/interruption/completion evidence;
10. `axiom-agent-test-session-lifecycle-receipt.v1` — an executor-independent signed receipt bound to one exact lifecycle head;
11. `axiom-agent-test-session-lifecycle-transcript.v1` — a bounded portable lifecycle chain for replay/recovery verification when retained externally;
12. `axiom-agent-executor-platform-profile.v1` — explicit OS/architecture facts with declared/measured/reproduced/externally-verified status and no inferred platform trust;
13. `axiom-agent-executor-dry-run-plan.v1` — a deterministic inert projection of one exact issued authorization into fixed future-executor templates, limits, evidence obligations, and cleanup requirements;
14. `axiom-agent-executor-conformance-receipt.v1` — an Ed25519-signed virtual-only observation receipt bound to one exact dry-run plan, lifecycle transition, sandbox policy, and ordered synthetic admissions/denials;
15. `axiom-agent-executor-durable-state-record.v1` — one immutable Ed25519-signed local control-state generation bound to the exact plan and lifecycle head, with no global-currentness, production-persistence, or executor-effect claim;
16. `axiom-agent-executor-durable-state-receipt.v1` — a separately retainable signed commitment to one exact locally committed durable generation for rollback comparison;
17. `axiom-agent-executor-isolation-profile.v1` — an exact platform-profile-bound requirement/evidence object for one reviewed Linux, macOS, or Windows isolation policy whose validation grants no real isolation or effect admission;
18. `axiom-agent-linux-isolation-conformance-receipt.v1` — a content-addressed hosted-CI receipt for one exact fixed-probe Linux isolation run, containing sanitized observed kernel/container evidence while withholding arbitrary-execution, physical-device, production, deployment, capability, and authority claims;
19. `axiom-agent-read-system-facts-effect-admission.v1` — a short-lived Ed25519-signed laboratory admission binding one exact inert dry-run plan, exact repository revision, lifecycle/compiler/isolation policy bindings, and only `read-system-facts`, without changing the plan's hard-false effect claim;
20. `axiom-agent-read-system-facts-effect-receipt.v1` — an Ed25519-signed executor-originated receipt binding the exact admission, plan, durable consume/final lifecycle records, Linux isolation evidence, fixed observations, and cleanup while withholding task-success, general-executor, production, deployment, capability, and AXIOM-authority claims.

The supported core contribution schemas live under `docs/architecture/contracts/`. Experimental infrastructure-lab exchange schemas remain under `agent-commons/contracts/` until that layer is separately promoted into the supported documentation boundary.

These are exchange and evidence contracts. They do not prove that an external agent, runtime, identity, network, offered device, lifecycle signer, platform profile, compiler, virtual sandbox, durable local state store, isolation profile, Linux fixed-probe receipt, laboratory effect-admission signer, executor effect receipt, reviewed mechanism family, or future executor is trustworthy beyond the evidence actually verified.

## Challenge model

A challenge should bind at least:

- challenge/task identity;
- canonical repository;
- exact base commit SHA;
- problem statement;
- allowed or relevant scope;
- prohibited effects;
- acceptance criteria;
- evidence expectations;
- security/disclosure route;
- claim boundary.

A challenge may invite analysis or patches. It must not imply that completing the challenge grants authority, payment, production access, merge rights, or reputation weight beyond what a separate policy explicitly defines.

## Contribution model

A contribution should preserve enough information to review and reproduce the work:

- contributor/agent identity as asserted or externally verifiable;
- runtime/model/tool metadata where known and relevant;
- source challenge if any;
- repository and exact base SHA;
- changed paths or inspected scope;
- commands/tests actually executed;
- observations and artifacts;
- assumptions, uncertainty, and unresolved cases;
- explicit statement that repository merge authority is not requested by the envelope.

A contribution can be useful even when it fails. Reproduced failures and negative findings are evidence.

## Feedback model

Feedback is first-class because high-value work is often not a patch.

Examples include threat-model criticism, architecture counterexamples, benchmark reproduction, unsupported-claim findings, interoperability mismatches, recovery failure modes, privacy leakage hypotheses, scalability bottlenecks, and test-gap proposals.

Feedback must distinguish observation, inference, proposal, and unverified hypothesis.

## Reputation and trust

Social popularity, follower count, karma, model brand, benchmark prestige, or self-described expertise must not become ambient authority.

A future reputation layer may summarize evidence-backed contribution history such as accepted or rejected findings, reproduced results, tests that continue to pass, independently confirmed security findings, reversions or invalidated claims, and provenance continuity.

Even a strong contribution history does not itself grant execution or merge authority. Reputation is evidence for review policy, not a capability token.

## Threat model

Treat all remote contribution and infrastructure surfaces as hostile-input boundaries.

Relevant threats include:

- prompt injection through issues, patches, agent cards, tool descriptions, or social content;
- malicious patches that weaken authority while preserving superficial tests;
- fabricated test/evidence claims;
- poisoned external artifacts or dependencies;
- Sybil/reputation gaming and identity spoofing;
- secret exfiltration attempts;
- oversized or resource-exhaustion submissions;
- stale-base patches that overwrite newer security work;
- social pressure to merge around protected review gates;
- malicious external mirrors misrepresenting capability status;
- offered hardware whose declared properties are false;
- remote-support requests that attempt to obtain credentials or persistent control;
- test-node workflows that smuggle production enrollment or destructive changes;
- replayed or substituted device-attestation nonces;
- self-supplied software keys falsely described as secure-element or platform-backed identity;
- session envelopes that widen operations, network access, lifetime, or effect reachability beyond the parent challenge;
- double consumption, stale revocation state, or conflicting lifecycle event identifiers;
- lifecycle transcript reordering, predecessor substitution, signature forgery, or binding drift;
- authentic old transcript prefixes being presented as current state after a newer signed lifecycle head existed;
- arbitrary executable, argv, shell, redirection, subshell, wildcard, or command-chain injection;
- repository-controlled build/test scripts being treated as safer than they are merely because the outer argv is fixed;
- PATH/environment poisoning or secret-value injection;
- absolute path, `..`, symlink, or workspace-alias escape;
- credentialed URLs, SSRF, redirect widening, DNS rebinding, or dynamic-origin discovery;
- package lifecycle/postinstall surprises;
- privilege escalation, service-manager use, daemonization, persistence, or remote administration;
- unbounded process count, runtime, output, memory, or step expansion;
- compiler version, policy digest, platform profile, lifecycle head, or plan substitution;
- executor-conformance request replay, step reordering, executable/argv substitution, or hazard-marker laundering;
- synthetic resolution-snapshot substitution, public/owner-LAN address-class confusion, or effect-time address changes presented as stable resolution;
- executor-conformance receipt tampering, signer substitution, or elevation of virtual observations into real-effect, task-success, deployment, or capability claims;
- concurrent durable writers extending one authorization state;
- expired or forged writer leases, stale-writer resurrection, or event-time backdating used to bypass lease expiry;
- crash after durable consumption but before virtual admission being misrepresented as an unused authorization;
- abandoned temporary records, truncated committed records, generation gaps, same-generation conflicts, predecessor substitution, or local record rollback;
- store-key or lifecycle-key substitution during recovery;
- an authentic older durable prefix being presented as current after a newer externally committed head existed;
- durable local control-state evidence being upgraded into power-loss/media durability, global currentness, distributed consensus, production persistence, or execution authority;
- an operating-system name being treated as evidence that an isolation boundary exists;
- hosted CI compatibility being upgraded into physical-device or production-isolation proof;
- a named namespace, VM, container, job, token, syscall filter, resource controller, or similar mechanism being treated as proof that the complete isolation policy was enforced;
- Linux, macOS, or Windows mechanism families being substituted across platform policies;
- isolation-policy catalog, platform-profile digest, OS, architecture, or repository-code boundary substitution;
- omission of a reviewed common isolation control or insertion of an unreviewed hidden control;
- self-asserted `externally-verified` isolation evidence without a separate verifier confirmation;
- a validated isolation profile or verifier confirmation being elevated into real OS enforcement, effect admission, production readiness, deployment authority, or capability promotion;
- caller-controlled image, executable, argv, shell, task-plan, environment, mount, or network data being smuggled into the fixed Linux isolation laboratory;
- Docker client context or endpoint substitution redirecting the laboratory to an unreviewed or remote daemon;
- host-root, repository, Docker-socket, credential, secret, device, or sensitive-descriptor exposure to a Linux probe container;
- capability, no-new-privileges, seccomp, read-only-root, namespace, cgroup, network-none, or non-root-user weakening while preserving a superficially successful probe;
- PID fanout, output flooding, timeout handling, or cleanup failure leaving residual processes/containers while a receipt claims success;
- a content-addressed hosted Linux receipt being misrepresented as independent external attestation, physical-device proof, globally verified platform isolation, arbitrary repository-code isolation, compiled-plan effect admission, production readiness, or AXIOM authority;
- the inert dry-run plan or effect-unreachable test-session authorization being reinterpreted as effect authority without a separate admission;
- effect-admission signer, plan digest, repository revision, lifecycle/compiler/isolation binding, lifetime, or operation substitution;
- the ephemeral hosted-CI admission signer being misrepresented as a production identity, independent human approval authority, or global authorization service;
- stale, unknown, or authentic-old-prefix lifecycle/revocation evidence being presented as current enough for a first effect;
- a real process starting before the durable one-time `consumed` generation is committed;
- the fixed `read-system-facts` executable/argv/workdir/image/network mapping being widened after admission;
- post-consumption process, output, or cleanup uncertainty being rewritten as completion instead of terminal interruption;
- executor receipt signer, admission/plan/lifecycle/durable/isolation/image binding, observation digest, or final-head substitution;
- a successful `read-system-facts` effect receipt being elevated into application task success, global revocation currentness, arbitrary repository-code execution, network/credential/remote-hardware authority, a general executor, production deployment, capability promotion, or AXIOM authority.

Required controls include exact-base binding, bounded inputs, protected CI, provenance capture, secret isolation, security-report routing, independent review for consequential changes, and no merge or infrastructure authority for external agents merely from participation.

The machine-readable pre-executor threat ledger is `agent-commons/pre-executor-threat-model.json`. The machine-readable virtual executor-conformance threat ledger is `agent-commons/executor-conformance-threat-model.json`. The machine-readable durable executor-state threat ledger is `agent-commons/executor-durable-state-threat-model.json`. The machine-readable platform-isolation-profile threat ledger is `agent-commons/executor-isolation-threat-model.json`. The machine-readable fixed-probe Linux isolation threat ledger is `agent-commons/linux-isolation-adapter-threat-model.json`. The machine-readable plan-bound `read-system-facts` effect threat ledger is `agent-commons/read-system-facts-effect-threat-model.json`. None of these threat ledgers is itself an effect capability.

## GitHub integration

GitHub remains the front-facing source of collaboration truth.

Agent-oriented issue forms should support implementation/contribution, architecture or security-adjacent feedback that is safe for public disclosure, and reproduction/verification reports.

Security vulnerabilities that should not be public must follow `SECURITY.md` instead of public Agent Commons forms.

A future repository-effect adapter may prepare or create an open draft pull request only through separately authorized AXIOM policy. Draft creation is not merge authority.

## Infrastructure and hardware laboratory

Agent Commons may coordinate contributed physical hardware and operational test capacity. The infrastructure laboratory begins with a three-object model:

1. **Offer** — a contributor advertises bounded test capacity and binds an existing `axiom-compute-node-profile.v1` by digest.
2. **Challenge** — AXIOM binds one exact repository/base revision, one offered node-profile digest, one challenge class, a narrow safe-operation set, network limits, acceptance criteria, evidence requirements, and expiry.
3. **Result** — the contributor reports bounded execution, evidence references, limitations, and explicit negative effect claims.

Core infrastructure invariant:

> **A device offer is not node admission. A challenge is not production authority. A result is not self-verifying truth.**

The laboratory reuses `axiom-compute-node-profile.v1`; it does not create a competing hardware identity format.

Initial challenge classes are:

- `hardware-validation`;
- `test-node-provisioning`;
- `deployment-reproduction`;
- `infrastructure-diagnostics`;
- `support-assistance`;
- `device-lab-capacity`.

The v1 safe-operation vocabulary is restricted to system-fact collection, disposable workspace setup/reset, test-only dependency installation, build/test execution, local test services, sanitized logs, and bounded benchmark metrics.

The following remain explicitly prohibited by the v1 infrastructure contracts:

- production node enrollment;
- credential issuance;
- secret retrieval;
- firmware or boot-chain changes;
- disk erasure or destructive repair;
- purchases or subscription activation;
- security-boundary weakening;
- unbounded remote shell;
- permanent system mutation;
- capability promotion;
- ambient authority;
- implicit payment.

Hardware facts must keep `declared`, `measured`, `reproduced`, and `externally-verified` states separate. A contributor or agent cannot self-assert independent verification; executable validation requires separate evidence before accepting stronger fact status.

### Device attestation boundary

The first device-attestation laboratory proves one deliberately narrow fact: possession of the Ed25519 private key corresponding to a public key that signs a fresh canonical statement containing the infrastructure offer ID, exact compute-node-profile digest, challenge nonce, issuance time, and short expiry.

The validator recomputes the public-key SHA-256 fingerprint and verifies the Ed25519 signature over the canonical statement. The attestation expires after at most 15 minutes and fails closed on stale evidence, nonce substitution, offer/profile substitution, malformed keys, fingerprint mismatch, or signature mismatch.

This key-possession proof must **not** be upgraded into a claim of physical ownership, secure-element custody, Secure Enclave/TPM/TEE backing, secure boot, firmware integrity, boot-chain integrity, or independent external verification. Those claims require provider/platform-specific evidence and a separate verification path.

### Ephemeral test-session authorization boundary

A test-session authorization is a laboratory mandate between a validated infrastructure challenge and a future executor. It requires:

- an explicit human sponsor and machine-principal subject;
- exact challenge, offer, node-profile digest, device-attestation ID, and attestation-key fingerprint binding;
- a lifetime of at most 15 minutes that cannot outlive the offer, challenge, or attestation freshness window;
- one-time use, explicit revocability, and fail-closed unknown revocation state;
- a safe-operation set that is a subset of the parent challenge;
- network mode and origins that cannot exceed the parent challenge;
- disposable-workspace-only filesystem scope;
- no credentials, secret access, interactive shell, or unbounded remote shell.

The current authorization envelope always carries `effect_reachable: false`. Validation proves that the envelope is internally bounded; it does **not** provide a deployed remote executor, credentials, tunnel, shell, device-management enrollment, or other path that can act on the machine.

### Test-session lifecycle evidence boundary

Before any executor exists, the laboratory records what happened to an authorization with a separate signed append-only lifecycle chain.

One lifecycle ledger binds exactly one authorization digest and carries the same sponsor, machine subject, challenge, offer, node-profile digest, device-attestation ID, and attestation-key fingerprint through every event. The supported lifecycle states are:

```text
issued -> consumed -> completed
   |          |----> interrupted
   |          `----> revoked
   |----> revoked
   `----> expired
```

Terminal states are immutable. `consumed` is one-time. Consumption requires a **known active** revocation state; `unknown` fails closed. Revoked or expired authorizations cannot later be consumed, and interrupted work cannot be rewritten as completed.

Each event is Ed25519-signed by a lifecycle evidence key and binds a monotonic sequence, exact predecessor digest, canonical timestamp, authorization window, and hard-false effect/authority claims. The ledger signing key authenticates lifecycle evidence; it is not a device credential, production admission key, or execution capability.

A lifecycle receipt is separately signed and binds the exact current event count and head digest. It is explicitly executor-independent: remote-effect observation, executor receipt, task-success claim, production enrollment, credential/secret/firmware/purchase/destructive effects, deployment authority, capability promotion, and production-persistence claim all remain false.

A bounded transcript can be exported and independently reverified before restoring a process. This makes one-time consumption/revocation evidence recoverable **if the transcript is durably retained by some external store**. The current laboratory does not itself provide a production persistence service.

An authentic old prefix is still an authentic chain prefix. Therefore standalone transcript verification cannot honestly prove that no signed suffix ever existed. A separately retained signed lifecycle-head receipt provides the external head commitment needed to detect suffix truncation or rollback to an older authentic prefix.

### Pre-executor dry-run policy compiler

The next gate remains intentionally non-executing. `mesh/src/lib/agent-executor-dry-run.mjs` compiles one exact validated authorization, one exact signed **issued** lifecycle head/receipt, and one explicit platform fact profile into a deterministic inert plan.

The compiler is pure validation/serialization code. It imports no process-spawning, filesystem, network, service-management, credential, or secret-access module. A valid plan cannot itself create a process, modify a filesystem, open a network connection, install a package, control a service, retrieve a credential, or act on hardware.

The plan binds:

- exact authorization ID and digest;
- sponsor and machine subject;
- challenge, offer, node-profile digest, device-attestation ID, and attestation-key fingerprint;
- lifecycle ledger/key/head/receipt digests;
- compiler identity/version and policy digest;
- explicit platform-profile digest and fact status;
- fixed relative disposable-workspace semantics;
- exact normalized network origins and request-method ceiling;
- environment-name allowlist with no embedded values;
- process/runtime/output/memory/step ceilings;
- fixed operation templates and canonical plan digest;
- lifecycle and evidence requirements for any future effect path.

The plan never accepts arbitrary shell strings. Process templates use fixed executable identifiers that a future executor would have to resolve to pinned absolute binaries; PATH search/override is not authority. Arguments are literal fixed arrays rather than concatenated command lines. Absolute paths, path traversal, host-root access, symlink following, direct shell requests, elevated privileges, persistent processes, credentialed URLs, redirects, dynamic origin discovery, secret values, and package lifecycle scripts are forbidden.

`run-build` and `run-tests` are intentionally marked `repository_code_execution: true` and `tool_may_invoke_repository_shell: true`. Fixed outer argv does not make repository-controlled package scripts intrinsically safe. A future executor must isolate that code independently of the plan compiler.

`start-local-test-services` is rejected by compiler v1. Long-lived service processes, background persistence, service-manager interaction, port lifetime, and shutdown recovery require a separate sandbox/service execution profile rather than being smuggled through a generic safe-operation label.

For `bounded-public-read`, the compiler accepts only canonical HTTPS origins, rejects credentialed/local/private literal targets, permits only GET/HEAD, forbids redirects, and records a future requirement to resolve and pin public addresses before effect. `owner-lan` remains exact-origin and credential-free but requires an owner-LAN resolution/pinning policy. The compiler performs no DNS lookup or network I/O itself.

Compilation requires the known lifecycle head to be `issued`, non-terminal, and unconsumed, with a matching signed head receipt. This is **known-head evidence**, not global currentness. Before any future first effect, an executor would still have to obtain current revocation/head evidence and atomically consume the authorization. A dry-run plan must not be used as a cached authorization after lifecycle state changes.

The deterministic plan carries hard-false claims for effect reachability, remote execution, process spawn, filesystem mutation, network activity, credential/secret retrieval, service control, package installation, production enrollment, firmware/boot changes, purchases, destructive action, deployment authority, task success, and capability promotion.

### Virtual executor-conformance sandbox

`mesh/src/lib/agent-executor-conformance-sandbox.mjs` is the next laboratory gate. It exercises how one exact dry-run plan would be enforced while keeping every admitted process, filesystem, and network action **virtual and in-memory**.

The sandbox first validates the exact dry-run plan, compiler identity/version/policy digest, and the exact issued lifecycle head/receipt already bound into that plan. It then enforces:

- strict next-step ordering and unique request identities;
- exact fixed executable identifiers and literal argv equality;
- no PATH or environment-driven executable substitution;
- exact working-directory binding;
- canonical relative paths rooted at `work/session`;
- rejection of absolute paths, traversal, normalization ambiguity, out-of-root paths, and synthetic symlink evidence;
- exact compiled network origin and GET/HEAD method checks;
- no redirects or dynamic origin widening;
- supplied synthetic preflight address snapshots and exact effect-time address-set equality to detect simulated DNS rebinding;
- public address classes for `bounded-public-read` and local/private classes for `owner-lan`;
- process, per-process runtime, total runtime, output, memory, step, and request ceilings checked before virtual admission.

Immediately before the first admitted virtual effect, the sandbox rechecks the exact known issued lifecycle head and consumes the one-time in-memory lifecycle with known-active revocation state. A denial before consumption leaves the lifecycle at `issued`. A policy denial after consumption records a terminal `interrupted` lifecycle event. Interruption cannot later be rewritten as completion, and completion requires every compiled step to have been admitted in order.

The sandbox performs no host process spawn, filesystem mutation, DNS lookup, network request, package installation, service management, credential/secret access, shell/tunnel operation, or hardware action. Its resolution evidence is supplied synthetic input, not a live resolver. Its path and symlink checks prove policy semantics, not operating-system filesystem isolation.

A terminal virtual session can produce `axiom-agent-executor-conformance-receipt.v1`, signed by an Ed25519 executor-laboratory key. The receipt binds the exact plan digest, authorization, sandbox/compiler policy digests, lifecycle consumption event, terminal lifecycle head/receipt, ordered admission/denial observations, and deterministic resource counters. The executor key authenticates the receipt only; it grants no repository, device, deployment, or AXIOM authority.

Conformance receipts hard-code `virtual_effects_only: true` and false claims for global currentness, task success, real effects, remote execution, process spawn, filesystem/network activity, credentials/secrets, service control, package installation, production enrollment, deployment authority, and capability promotion.

A valid conformance receipt therefore proves only that this virtual laboratory classified and recorded synthetic requests according to the reviewed policy implementation. It is **not** evidence that an OS sandbox, VM/container boundary, live DNS resolver, package manager, process launcher, network stack, or physical device enforced the same policy.

The machine-readable threat ledger for this gate is `agent-commons/executor-conformance-threat-model.json`. It keeps the remaining promotion blockers explicit: no real process launcher, no OS sandbox, no live DNS pinning, no durable atomic executor/lifecycle store, no real package/build/test execution, and no remote hardware or credential broker.

### Durable atomic executor lifecycle state laboratory

`mesh/src/lib/agent-executor-durable-format.mjs` and `mesh/src/lib/agent-executor-durable-state.mjs` add the next deliberately narrow gate: crash/restart-resistant **local lifecycle-control persistence** around the still-virtual executor-conformance sandbox.

Core durability invariant:

> **A restart may lose availability; it must not restore spendable authorization, erase a known revocation or terminal state, or convert uncertainty into permission.**

Unlike the virtual conformance sandbox, this laboratory intentionally performs one real local effect: it writes signed control-state evidence inside a caller-supplied absolute state root and a hash-derived per-store directory. That filesystem effect is explicit. It does not mutate the repository workspace, accept arbitrary destination paths, create processes, open live network connections, retrieve credentials or secrets, control services, install packages, open a remote shell, or act on contributed hardware.

The durable store uses immutable canonical generations. Each generation binds:

- exact durable-store key and policy digest;
- monotonic generation number and predecessor record digest;
- exact authorization and dry-run plan digests;
- exact lifecycle ledger/key/status/event count/head digest/receipt digest;
- optional virtual conformance receipt digest;
- hard-false global-currentness, production-persistence, effect-reachability, and authority claims.

A generation is written to a unique temporary file, file-`fsync`ed, then atomically renamed to `gNNNNNNNN-<digest>.json`; the record directory is synchronized where the host filesystem supports it. Abandoned temporary files are not committed generations. Startup fails closed on malformed, truncated, noncanonical, oversized, signature-invalid, filename/digest-mismatched, missing-generation, same-generation-conflict, predecessor-drift, key-substituted, or lifecycle-binding-invalid committed records.

One signed writer lease binds the store, plan, authorization, owner, opaque owner-token digest, acquisition time, and bounded expiry. Every transition rechecks the exact on-disk lease and rereads the committed head. An active competing writer fails closed. An expired lock cannot be recovered over an existing state chain unless the recovering process supplies a separately retained signed durable-head receipt that exactly matches the local committed head. Successful stale-lock recovery archives the old lock; a still-running old writer is then fenced by lock/token mismatch. Lease freshness is evaluated from the store's trusted clock rather than a caller-controlled lifecycle event timestamp, so backdating an event cannot resurrect an expired writer.

For the first policy-admissible virtual request, the durable controller orders state as:

```text
virtual policy preflight
  -> durable lifecycle consume generation committed
  -> virtual sandbox admission
  -> exact consume-event digest parity check
```

Therefore a crash after durable consumption but before virtual admission recovers as `consumed-uncertain-no-resume`, never `issued`. The laboratory deliberately prefers lost availability to replayable authority. A denial before consumption leaves the durable lifecycle `issued`. A denial after consumption must be mirrored as durable terminal `interrupted` state, and the durable/virtual interruption head digests must match. Manual completion or interruption is also produced independently by the virtual and durable lifecycle clones and requires exact event-digest parity.

A terminal virtual conformance receipt may be attached only when it binds the exact already committed lifecycle status, head digest, and lifecycle receipt digest. The durable attachment generation reuses that committed lifecycle evidence rather than minting a merely equivalent new head receipt.

The durable store can produce `axiom-agent-executor-durable-state-receipt.v1`, a signed commitment to one exact locally committed generation. That receipt is designed for **separate retention** so a later recovery can detect rollback to an authentic older local prefix. The store itself does not claim to retain the receipt independently. Without an external head commitment, an authentic older local prefix remains authentic and cannot honestly prove that a later suffix never existed.

The current durability evidence is scoped to process-restart and local filesystem commit ordering. File `fsync`, directory synchronization where supported, and atomic rename are not represented as proof of storage-media survival across sudden power loss, controller/drive-cache behavior, filesystem corruption, hardware monotonicity, independent replication, distributed consensus, or global revocation currentness. Those remain separate promotion problems.

The machine-readable threat ledger for this gate is `agent-commons/executor-durable-state-threat-model.json`. Passing this laboratory does not create a production database, replicated state service, distributed writer lease, hardware-backed monotonic counter, HSM/TPM/Secure Enclave persistence layer, OS sandbox, live network executor, credential broker, production node enrollment path, or real hardware executor.

### Platform-specific executor isolation-profile boundary

`agent-commons/executor-isolation-profiles.json` and `mesh/src/lib/agent-executor-isolation-profile.mjs` define the reviewed platform-isolation requirement gate. They describe the isolation properties an effect-capable platform adapter must enforce; the profile validator itself does not perform those effects.

Core isolation invariant:

> **A platform name is not an isolation guarantee. A hosted runner is not physical-device proof. An isolation profile is a requirement contract, not permission to execute.**

The reviewed catalog establishes one common floor across Linux, macOS, and Windows:

- disposable workspace/root containment;
- host-root denial;
- symlink or reparse-point boundary enforcement;
- pinned executable resolution without ambient PATH authority;
- a minimal environment with no ambient credentials or secrets;
- no privilege escalation;
- process-tree containment;
- timeout with terminal process-tree kill semantics;
- CPU, memory, process-count, and output ceilings;
- default-deny networking and explicit-origin-only network policy;
- inherited handle/file-descriptor minimization;
- terminal-on-uncertainty semantics;
- workspace disposal.

Each OS then binds a reviewed mechanism-family requirement set beneath that common floor. Linux requires kernel-enforced process, filesystem, network, resource, syscall-filter-or-equivalent, and privilege boundaries. macOS requires a VM-or-equivalent kernel-enforced repository-code boundary plus disposable-volume, network-policy, resource-supervision, and host-credential-separation requirements. Windows requires a container/VM/or restricted security boundary plus process-tree/job, filesystem-namespace, network-policy, and token/privilege controls.

These mechanism-family names are deliberately **not enforcement evidence**. The presence of a namespace, cgroup, seccomp-style control, VM, container, Job Object, restricted token, app metadata, or similar primitive does not prove that the entire reviewed policy was correctly composed or enforced. Repository-controlled build/test code remains hostile even when the outer executable and argv are fixed.

An `axiom-agent-executor-isolation-profile.v1` binds:

- the exact validated `axiom-agent-executor-platform-profile.v1` digest;
- exact OS and architecture;
- the exact reviewed catalog digest, platform policy ID, and revision;
- the complete ordered common-control set;
- the exact platform mechanism-family set and repository-code boundary;
- evidence status and bounded evidence references;
- hard-false isolation, effect, production, deployment, node-enrollment, capability, and authority claims.

Evidence status remains `declared`, `measured`, `reproduced`, or `externally-verified`. A profile cannot self-assert the strongest status: `externally-verified` requires a separate verifier confirmation supplied outside the profile document. Hosted CI remains explicitly insufficient as physical-device proof, and physical-device evidence remains a required input before any future production promotion.

Even when a profile matches the reviewed catalog exactly and separate external-verifier confirmation is present, the profile assessment still returns `platform_isolation_verified: false`, `repository_code_isolation_verified: false`, `effect_admission_eligible: false`, and `production_executor_ready: false`. The validator proves policy/profile binding and evidence classification only; it does not infer enforcement from the submitted profile.

The profile validator imports no process-spawning, filesystem-mutation, DNS/network-client, service-management, VM/container-management, credential/secret, or remote-shell effect module. The machine-readable threat ledger for this gate is `agent-commons/executor-isolation-threat-model.json`.

### Fixed-probe Linux isolation conformance laboratory

`mesh/src/linux-isolation-adapter-drill.mjs` and the governed `Agent Linux Isolation Conformance` workflow add the first deliberately narrow **real process/filesystem isolation evidence** above the requirement catalog. The laboratory is effect-capable only for a fixed, repository-reviewed probe set on a disposable hosted Linux CI runner; it is not a general or plan-driven executor.

Core fixed-probe invariant:

> **A successful fixed isolation probe is evidence about that tested boundary. It is not permission to execute arbitrary repository work, proof of physical-device isolation, or production executor authority.**

The host-side adapter is restricted to `/usr/bin/docker`, a scrubbed Docker client environment bound to the local `unix:///var/run/docker.sock` endpoint, the repository-built `axiom-mesh-kernel:0.12.0-dev.3` image and its resolved local image ID, and the fixed `/usr/local/bin/node` entrypoint. It accepts no caller-supplied image, executable, argv, shell string, task plan, bind mount, network origin, credential, secret, package operation, service operation, remote endpoint, or contributed hardware.

Every probe container is launched with:

- `--network none`;
- a read-only container root and no bind mounts;
- all Linux capabilities dropped and `no-new-privileges=true`;
- UID/GID `10001:10001`;
- bounded `noexec,nosuid,nodev` tmpfs workspaces;
- 32-PID, 128-MiB-memory, and 0.5-CPU ceilings;
- a bounded host timeout and 64-KiB output ceiling;
- deterministic forced cleanup whose absence check is part of the pass condition.

The fixed baseline probe actively records distinct host/container PID, mount, and network namespace identities; effective capabilities; no-new-privileges and seccomp status; read-only-root denial and disposable-workspace success; a symlink-based root-write escape denial; absence of the Docker socket, host-only sentinel, secret mounts, and sensitive inherited descriptors; explicit public-network denial; and observed CPU, memory, and PID cgroup ceilings. Separate hostile probes require real PID exhaustion, timeout cleanup, and output-overflow cleanup.

`axiom-agent-linux-isolation-conformance-receipt.v1` preserves sanitized observations rather than configuration labels alone. The receipt binds the exact repository revision, reviewed isolation-policy catalog, fixed adapter identity, resolved image ID, limits, controls, each observation digest, and a whole-receipt digest. The workflow independently reparses and reverifies the receipt before using or uploading it as evidence.

The workflow is intentionally separate from secret-bearing operational jobs. It has `contents: read`, disables persisted checkout credentials, references no GitHub secrets, uses only pinned actions, and contains no production provisioning. `mesh/src/lib/agent-linux-isolation-workflow.mjs` is invoked by release readiness to govern that exact workflow surface; the release inventory remains fail-closed and recognizes exactly four governed workflows rather than treating the effect laboratory as an unreviewed legacy workflow.

A passing fixed-probe receipt may truthfully claim that fixed disposable Linux processes and tmpfs writes occurred and that the tested namespace/capability/seccomp/root/network/resource/cleanup controls were observed on the hosted runner. It is content-addressed and workflow-reverified, but it is **not** an independently signed external attestation. It remains hard-false for physical-device proof, globally verified platform isolation, arbitrary repository-code isolation, compiled-plan effect admission by that receipt, production-executor readiness, remote execution or administration, credentials or secrets, production enrollment, deployment authority, capability promotion, and AXIOM authority.

The machine-readable threat ledger for this gate is `agent-commons/linux-isolation-adapter-threat-model.json`.

### Plan-bound `read-system-facts` effect laboratory

`mesh/src/read-system-facts-effect-drill.mjs`, `mesh/src/lib/agent-read-system-facts-effect-admission.mjs`, and `mesh/src/lib/agent-read-system-facts-effect.mjs` add the first deliberately narrow **plan-bound real process effect** above the fixed Linux conformance boundary.

Core effect invariant:

> **The dry-run plan remains inert. Only a separate short-lived signed laboratory admission may authorize the exact `read-system-facts` mapping, and durable one-time lifecycle consumption must commit before the first process effect.**

Neither `axiom-agent-test-session-authorization.v1` nor `axiom-agent-executor-dry-run-plan.v1` is retroactively redefined as effect authority; both retain their existing hard-false effect claims. `axiom-agent-read-system-facts-effect-admission.v1` is a separate Ed25519-signed laboratory object binding one exact plan digest, repository revision, authorization/sponsor/subject, lifecycle ledger/key, compiler policy, reviewed isolation catalog/policy, and only `read-system-facts`. The admission rejects hidden fields, operation widening, broader authority claims, signer/revision/plan substitution, and lifetimes exceeding either five minutes or the compiled plan's own runtime ceiling.

The current hosted-CI admission issuer is ephemeral test infrastructure created outside the effect controller. That separation demonstrates signer/admission mechanics; it is **not** evidence of a production admission identity, legal identity, independent human approval, or a globally current authorization service.

Immediately before effect, `AgentReadSystemFactsEffectController.begin()`:

1. revalidates the exact dry-run plan while preserving `effect_reachable: false`;
2. verifies the separate admission and its exact revision/policy/plan bindings;
3. independently verifies the supplied signed lifecycle transcript and signed head receipt are still exactly `issued` and match the durable local head;
4. requires the caller to provide the explicit laboratory revocation state `active`; `unknown` fails closed;
5. commits the durable lifecycle transition to `consumed` before returning any executable descriptor.

That supplied known-active state is a laboratory input, **not global revocation currentness**. An authentic signed head can still be an old authentic prefix unless a trusted currentness service or independently retained newer head commitment proves otherwise.

The only effect mapping is exactly two pre-existing dry-run process templates:

```text
node-current-pinned --version
node-current-pinned -p 'JSON.stringify({platform:process.platform,arch:process.arch})'
```

The host maps `node-current-pinned` to the fixed `/usr/local/bin/node` entrypoint and executes the literal argv arrays inside the same reviewed Linux containment profile, using the content-addressed image ID already established by the fixed-probe isolation receipt. The effect path accepts no caller command/argv, shell, repository bind mount, host-root mount, network origin, credential/secret source, package operation, service operation, remote endpoint, or contributed hardware. Each disposable effect container uses network `none`, read-only root, dropped capabilities, `no-new-privileges`, non-root UID/GID, bounded tmpfs, PID/memory/CPU ceilings, bounded output, and verified cleanup.

The durable store must be at generation 2 / lifecycle `consumed` before the first effect container is launched. Completion creates generation 3 only after both exact observations pass bounded validation. If an exception occurs after consumption while the durable state remains `consumed`, the drill attempts a terminal `interrupted` transition; it never restores consumed authority to `issued`.

`axiom-agent-read-system-facts-effect-receipt.v1` is signed by a separate executor-laboratory Ed25519 key and binds the exact admission, plan, authorization, sponsor/subject, pre-effect lifecycle head, consumption event, final lifecycle head/receipt, durable consume/final record digests, isolation receipt, adapter, content-addressed image, exact two observations, timestamps, and cleanup. The governed workflow independently reverifies the evidence-bundle digest, admission signature, executor effect receipt, durable final-head receipt, exact durable final generation/record parity, and hard-false bundle claims before artifact publication.

A successful receipt may truthfully claim **real process effects**, exact plan-step mapping, and durable consume-before-effect ordering for this one hosted-CI operation. It deliberately keeps `task_success_claimed: false`; observing the fixed facts is not elevated into an application-level task-success judgment. It also remains false for the dry-run plan itself being effect-reachable, global revocation currentness, repository-code or repository-workspace execution, network effects, credentials/secrets, package/service actions, remote execution/hardware, production enrollment/deployment, capability promotion, a general executor, or AXIOM authority.

The machine-readable threat ledger for this gate is `agent-commons/read-system-facts-effect-threat-model.json`.

### Future executor promotion boundary

A general, multi-operation, repository-code, network-capable, remote-hardware, or production effect executor remains a separate promotion problem. At minimum it would require:

- a production-grade admission/approval trust model rather than the ephemeral hosted-CI admission issuer;
- authenticated sponsor identity and independently current authorization/revocation verification;
- production-grade durable one-time lifecycle consumption and revocation/head retention, including an explicit currentness/replication model rather than only this local laboratory;
- exact isolation-profile binding to one reviewed platform policy;
- reviewed operation-by-operation mappings from exact compiled plans into platform adapters, with separate treatment of repository-code hazards rather than generalizing from `read-system-facts`;
- pinned absolute executable resolution without ambient PATH authority;
- isolated disposable sandboxing for repository code before `run-build` or `run-tests` can be considered;
- filesystem/root/symlink or reparse-point enforcement independent of repository code;
- exact network-origin enforcement, DNS resolution pinning, no redirects, and no ambient credentials before network effects can be considered;
- independent process/runtime/output/memory enforcement;
- timeout and interrupted/uncertain-effect recovery integrated with durable lifecycle state;
- physical-device evidence appropriate to the promoted platform rather than hosted-CI evidence alone;
- executor-originated effect receipts bound to each exact compiled plan/admission, isolation evidence, lifecycle transition, and observed platform evidence;
- independent effect-path threat/security review and protected promotion.

The virtual executor-conformance sandbox reduces ambiguity about enforcement semantics. The durable-state laboratory proves local restart ordering and one-time-consumption recovery semantics. The isolation-profile laboratory fixes the cross-platform requirement/evidence vocabulary. The fixed Linux laboratory demonstrates real kernel/container enforcement for its exact hosted probe boundary. The `read-system-facts` laboratory now demonstrates one exact plan-bound consume-before-effect sequence. **None of those results establishes arbitrary repository-code isolation, generic compiled-plan admission, production admission identity, global currentness, live-network enforcement, package/service execution, physical-device isolation, or remote-hardware safety.**

Remote access is not part of the current effect path. An offer may state that remote access is technically available, but credentials, tunnels, remote shells, device-management enrollment, and unattended administration require a separate future design.

Hosted CI can produce useful reproducible platform enforcement evidence for the exact hosted workload, but it cannot substitute for physical-device isolation evidence or a promoted production platform boundary. For Apple, physical follow-on work may eventually test `launchd`, sleep/wake/reboot recovery, Keychain/Secure Enclave integration, firewall/network semantics, signing/notarization, thermal/power behavior, and virtualization constraints. Equivalent physical validation can apply to Windows, Linux, ARM SBCs, GPU workstations, network appliances, and specialized hardware.

Failures and blocked results remain useful evidence when exact-base and honestly reported. Interrupted or uncertain consequential effects must not be upgraded to success.

## Initial read-only interoperability laboratory

The first external-facing runtime experiment should be read-only and expose only already-public state such as:

- project identity and claim boundary;
- selected public documentation;
- capability-registry status;
- open Agent Commons challenges;
- verification instructions;
- schema discovery.

It must not expose secrets, private Grid state, credentials, private memory, unpublished security findings, write tools, production execution routes, or implicit authority.

## External publication and mirrors

Agent-native communities may be used for discovery, announcements, technical challenges, and feedback intake.

Each external publication should be treated as a bounded projection or mirror. It should point back to the canonical GitHub repository and must not silently become the authority for release state, capability state, security status, or accepted contributions.

Where practical, retain publication provenance and external identifiers so announcements can later be audited or retracted without rewriting repository history.

## Promotion stages

### Stage A — repository contribution surface

- `AGENTS.md` machine entry point;
- Agent Commons architecture document;
- challenge/contribution/feedback schemas;
- agent-oriented GitHub issue forms;
- contract self-check in protected CI.

### Stage B — challenge registry laboratory

- machine-readable list of open challenges;
- exact base-SHA binding;
- bounded path and acceptance metadata;
- fixtures and negative tests.

### Stage C — Read-only MCP/A2A laboratory

- public discovery only;
- no consequential tools;
- hostile-input tests;
- request and response bounds;
- no authority change.

### Stage D — external community adapters

- announcements and challenge mirrors;
- feedback ingestion with provenance;
- canonical-link enforcement;
- rate, size, abuse, and identity controls.

### Stage E — evidence-backed contribution reputation research

- portable contribution receipts;
- correction/invalidation history;
- Sybil/collusion analysis;
- no ambient authority derived from score.

### Stage F — infrastructure and contributed hardware laboratory

- bounded device/test-capacity offers;
- exact-base infrastructure challenges;
- exact compute-node-profile digest binding;
- constrained operation and network vocabularies;
- result/evidence envelopes with negative effect claims;
- fresh Ed25519 key-possession attestation bound to offer/profile/nonces;
- human-sponsored, one-time, revocable test-session authorization envelopes;
- signed append-only session lifecycle events and executor-independent head receipts;
- bounded transcript verification and restart restoration without claiming a production persistence service;
- explicit OS/architecture fact profiles without inferred platform trust;
- deterministic non-executing compiler plans with fixed templates, resource/network/workspace limits, and canonical digests;
- machine-readable pre-executor threat model;
- virtual executor-conformance sandbox with exact step/executable/argv/path/network/resource admission semantics and no host effects;
- Ed25519-signed virtual conformance receipts bound to exact plan and lifecycle evidence;
- machine-readable executor-conformance threat model and explicit real-executor promotion blockers;
- signed immutable local executor-state generations with exclusive-writer fencing and fsync/temp/atomic-rename commit discipline;
- durable consumption-before-admission ordering and fail-closed `consumed-uncertain-no-resume` restart semantics;
- separately retainable durable-head receipts for rollback comparison without a global-currentness claim;
- machine-readable durable executor-state threat model and explicit storage/consensus/power-loss promotion blockers;
- reviewed Linux/macOS/Windows isolation-policy catalog with one mandatory common-control floor;
- exact platform-profile/catalog/policy/mechanism binding and pure isolation-profile assessment;
- separate confirmation requirement for externally verified isolation-profile evidence without effect-admission elevation;
- hosted CI explicitly insufficient as physical-device proof;
- machine-readable executor-isolation threat model and explicit effect-capable-adapter promotion blockers;
- governed secret-free fixed-probe Linux isolation conformance workflow with exact pinned actions and release-time semantic verification;
- fixed Linux real process/tmpfs probes for namespaces, capabilities, no-new-privileges, seccomp, root/symlink denial, network denial, cgroup ceilings, PID exhaustion, output limits, timeout, and cleanup;
- content-addressed Linux conformance receipts with sanitized observations and explicit nonclaims;
- machine-readable Linux isolation-adapter threat model;
- separate short-lived Ed25519 `read-system-facts` laboratory admission while the parent authorization and dry-run plan remain effect-unreachable;
- exact current signed issued-head verification plus explicit known-active laboratory revocation state before durable consumption;
- durable generation-2 one-time consumption before the first `read-system-facts` process effect and terminal interruption on post-consumption uncertainty;
- exact two-step `/usr/local/bin/node` mapping using the content-addressed reviewed isolation image and no repository/network/credential/package/service widening;
- signed executor-originated `read-system-facts` effect receipts plus independently reverified durable final heads and evidence-bundle digests;
- machine-readable `read-system-facts` effect threat model with production/general-executor blockers;
- declared/measured/reproduced/externally-verified evidence separation;
- no arbitrary repository-code execution, generic compiled-plan admission, production admission identity, physical-device proof, general remote administration, package/service execution, live network execution, or production-enrollment authority.

Any broader write-capable external adapter or remote infrastructure executor requires a separate threat review, policy mapping, evidence model, negative tests, and promotion decision.

## Acceptance gates

1. External participation cannot change `mesh/config/capabilities.json` status without the normal reviewed repository process.
2. No Agent Commons contract grants merge, deployment, secret, production execution, production node enrollment, or credential authority.
3. Challenge and contribution objects bind an exact repository base SHA.
4. External social or agent-network state cannot override canonical GitHub state.
5. Public feedback and security-sensitive disclosure paths are clearly separated.
6. Protected CI checks the contract files and critical non-authority invariants.
7. A hostile external message or artifact cannot create a second authority path around `Gateway -> Hypervisor -> Sandbox -> Grid`.
8. Reputation, if later implemented, remains evidence and policy input rather than self-executing authority.
9. Read-only interoperability is proven before any broader write-capable adapter is considered.
10. Infrastructure test capacity cannot become production admission or remote administration merely because hardware is available.
11. Device key possession cannot be represented as platform-backed or externally verified hardware trust without separate evidence and verification.
12. A test-session envelope cannot widen its parent challenge or become effect-reachable merely because it validates structurally.
13. Session consumption is one-time, unknown revocation state fails closed, and terminal lifecycle evidence cannot be rewritten into a more favorable state.
14. Restored lifecycle state must verify the complete retained signature/predecessor chain, while current-head claims require a separately retained head commitment capable of detecting rollback to an authentic old prefix.
15. Lifecycle signatures and receipts remain evidence only and cannot claim remote effects, task success, production persistence, node admission, or capability promotion.
16. The dry-run compiler accepts only an exact issued lifecycle head/receipt and cannot compile a consumed, revoked, expired, interrupted, or completed authorization.
17. Dry-run plans contain no arbitrary shell command, PATH authority, host-root path, credentialed URL, redirect authority, secret value, privilege elevation, persistence request, or capability/production effect.
18. Repository build/test templates remain explicitly classified as repository-code execution hazards and do not become trusted merely because the outer argv is fixed.
19. Long-lived local-service execution remains rejected until a separately reviewed sandbox/service profile exists.
20. A valid dry-run plan is not by itself effect authority and is not evidence that a future executor enforced the plan, that any hardware effect occurred, or that a task succeeded.
21. The virtual executor-conformance sandbox accepts only an exact validated plan and exact issued lifecycle evidence, and consumes the one-time laboratory lifecycle before its first admitted virtual effect.
22. A denied request before consumption leaves the laboratory lifecycle unconsumed; a policy denial after consumption terminates it as interrupted rather than permitting completion.
23. A conformance receipt cannot claim task success, real process/filesystem/network/package effects, production enrollment, deployment authority, or capability promotion.
24. A valid conformance receipt is not evidence of operating-system isolation, live DNS pinning, real package/build/test execution, remote hardware enforcement, or task success.
25. The durable executor-state laboratory may mutate only its dedicated control-state directory; it cannot turn that narrow storage effect into repository-workspace mutation, arbitrary host-path authority, process/network/package/service execution, or hardware control.
26. A first virtually admissible request must commit durable one-time lifecycle consumption before virtual admission; a recovered consumed state is non-resumable and cannot be rewritten as issued.
27. Active concurrent writers fail closed, stale-writer recovery requires an exact separately retained durable-head receipt, and writer-lease freshness cannot be widened by a caller-controlled event timestamp.
28. Durable recovery rejects malformed/torn committed generations, generation gaps or conflicts, predecessor drift, signer substitution, lifecycle/plan binding drift, and terminal-state rewrites.
29. A durable local chain cannot claim that no newer suffix existed; rollback detection depends on a separately retained signed durable-head commitment, and neither object claims global currentness.
30. Durable local commit evidence is not evidence of storage-media/power-loss survival, hardware monotonicity, distributed consensus, production persistence, real executor effects, or production authority.
31. An executor-isolation profile must bind the exact reviewed policy catalog and exact platform-profile digest/OS/architecture; policy, mechanism-family, repository-code-boundary, or platform substitution fails closed.
32. The reviewed common isolation controls cannot be omitted or silently widened, and platform-specific mechanism families cannot be substituted across Linux, macOS, and Windows policies.
33. Hosted CI cannot be represented as physical-device isolation proof, and `externally-verified` profile evidence requires a separate verifier confirmation rather than self-assertion.
34. A valid or externally confirmed isolation profile remains requirement/evidence classification only; it cannot by itself claim real OS enforcement, repository-code isolation, effect admission, production readiness, deployment authority, node enrollment, or capability promotion.
35. The fixed Linux isolation laboratory accepts no caller-supplied image, command, argv, shell, task plan, bind mount, network origin, credential, secret, package/service action, remote endpoint, or contributed hardware; its fixed adapter/workflow profile is release-governed and fail-closed.
36. A Linux fixed-probe pass requires active observed namespace/capability/no-new-privileges/seccomp/root/network/resource evidence, real PID-pressure behavior, bounded output/timeout handling, and verified container cleanup; configuration labels alone are insufficient.
37. The Linux conformance receipt binds sanitized observations and per-probe digests to one exact revision/policy/adapter/image/limit statement and is independently reverified by the secret-free workflow before artifact publication.
38. Hosted fixed-probe Linux evidence cannot be elevated into physical-device proof, independent external attestation, globally verified platform isolation, arbitrary repository-code isolation, production readiness, deployment authority, node enrollment, capability promotion, or AXIOM authority.
39. The standalone Linux conformance/effect workflow must remain in the exact governed release workflow inventory and pass its semantic verifier; adding an effect path cannot weaken the repository's workflow-governance guard.
40. `read-system-facts` real effects require a separate valid signed laboratory admission; the existing effect-unreachable test-session authorization and dry-run plan cannot be treated as execution authority by themselves.
41. The `read-system-facts` admission must bind the exact plan/revision/lifecycle/compiler/Linux-isolation policy and only that operation, reject hidden or widened fields, and stay within both the five-minute laboratory ceiling and the compiled-plan runtime ceiling.
42. Before the first `read-system-facts` process, the exact signed lifecycle head must still be `issued`, the supplied revocation state must be known `active`, and the matching durable local state must commit one-time `consumed`; unknown, stale, substituted, terminal, or already-consumed state fails closed.
43. Only the exact two reviewed `node-current-pinned` templates may reach the Linux adapter; no caller argv, repository code, bind mounts, network effects, credentials/secrets, package/service actions, remote hardware, or shell may be introduced through the operation label.
44. Any uncertainty after durable consumption must remain consumed/terminally interrupted rather than being restored to `issued` or rewritten as completed.
45. A `read-system-facts` executor receipt must bind the separate admission, exact inert plan, lifecycle consume/final heads, durable consume/final records, Linux isolation receipt/image, exact sanitized observations, and cleanup, and must be independently reverified with the durable final head before publication.
46. A successful `read-system-facts` effect receipt may claim the bounded real process observations and consume-before-effect ordering only; it cannot claim application task success, global currentness, production admission identity, independent human approval, arbitrary repository-code execution, a general executor, production/deployment authority, capability promotion, or AXIOM authority.
47. The ephemeral hosted-CI admission issuer proves only the tested signing/admission separation and cannot be represented as a production trust root, legal identity, or independent human-approval service.
48. Current documentation remains explicit about what is architecture, laboratory, implemented, enabled, exposed, production-promoted, and marketed.

## Current non-claims

This document does not claim:

- a deployed Agent Commons service;
- a production MCP or A2A endpoint;
- a verified cross-network agent identity system;
- autonomous code merging;
- autonomous capability promotion;
- production external-agent execution;
- a Sybil-resistant portable reputation network;
- trustworthy external agent cards or social profiles;
- a legal or economic reward system for contributions;
- a deployed hardware marketplace;
- production remote administration;
- automatic node enrollment;
- verified physical ownership of offered devices;
- TPM, Secure Enclave, TEE, secure-element, secure-boot, or boot-integrity verification;
- a production attestation authority;
- the effect-unreachable test-session authorization itself as a deployed executor;
- a production session-lifecycle persistence or recovery service;
- a globally current revocation oracle or proof that the supplied known-active laboratory state is globally current;
- an executor-originated **remote** effect receipt;
- the dry-run plan or compiler itself as effect-reachable authority;
- generic compiled-plan effect admission beyond the separately signed one-operation `read-system-facts` laboratory admission;
- a production admission issuer, verified legal identity, or independent human-approval authority from the ephemeral hosted-CI admission signer;
- a production executor-conformance service or general operating-system sandbox;
- a production durable executor-state database, replicated state service, distributed lease service, or globally current revocation oracle;
- a hardware-backed monotonic counter or HSM/TPM/Secure Enclave durable-state guarantee;
- storage-media, drive-cache, filesystem-corruption, or sudden-power-loss survival guarantees from the local durability laboratory;
- globally verified Linux, macOS, or Windows executor isolation from the isolation-profile laboratory;
- a general multi-operation Linux executor, arbitrary repository-code isolation path, or production VM/container/sandbox execution service;
- physical-device isolation proof or independent external attestation from hosted Linux evidence;
- hosted CI as physical-device or production-isolation evidence;
- live DNS resolution/pinning enforcement or any network-capable Agent Commons effect path;
- real package installation, repository build/test execution, repository-workspace mutation, arbitrary host-path mutation, live network execution, service management, or remote/contributed-hardware effects through Agent Commons; current real process effects are limited to the fixed Linux probes and the exact two-step hosted-CI `read-system-facts` operation, while the durable laboratory separately mutates only its dedicated local control-state files;
- application task success from a successful `read-system-facts` effect receipt;
- a production package installer, service manager, shell, tunnel, credential broker, or remote-control daemon;
- secure remote-shell infrastructure;
- firmware-management authority;
- production macOS service support;
- native iOS/iPadOS node support;
- autonomous purchasing or payment.

The first deliverable is a safer contribution surface, not an autonomous swarm.
