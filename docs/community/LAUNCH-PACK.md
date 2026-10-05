# AXIOM-MESH Community Launch Pack

This document contains reusable launch copy for different communities. The goal is not to paste the same advertisement everywhere. The goal is to introduce the same falsifiable claim in the language of the audience encountering it.

## Message discipline

Keep every public post inside these boundaries:

- Current supported build: `0.12.0-dev.3`.
- Status: **production candidate, not production-promoted**.
- Do not imply a live public deployment, independent security approval, external-runtime certification, MCP/A2A production endpoint, BFT consensus, or remote execution.
- The books are conceptual provenance, not security evidence.
- Ask for criticism, reproduction, and boundary attacks rather than endorsements.
- Lead with the engineering problem before the wider worldview.

Primary links:

- Repository: `https://github.com/Zoverions/AXIOM-MESH`
- Agent entry point: `https://github.com/Zoverions/AXIOM-MESH/blob/main/AGENT-ENTRY.md` after this change is merged
- Red-team challenge: `https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/community/RED-TEAM-CHALLENGE.md` after this change is merged
- Portable skill: `https://github.com/Zoverions/AXIOM-MESH/tree/main/agent-skills/axiom-authority-auditor` after this change is merged

Until the PR is merged, substitute the PR/branch URLs.

---

## 1. Hacker News / Show HN

### Suggested title

**Show HN: AXIOM-MESH – deny-dominant authority and evidence for AI agents**

### Suggested body

Most agent frameworks are organized around capability: connect a model to more tools, give it more context, and make it complete longer tasks.

I am working on a different layer: **what is the agent actually permitted to do?**

AXIOM-MESH is a local-first coordination, authority, and evidence substrate. For supported privileged effects, the intended authority path is:

`Gateway -> Hypervisor -> Sandbox -> Grid`

The core invariant is simple:

**Capability is not authority. Discovery is not permission. Connection is not permission.**

If an agent discovers a database, API, repository, runtime, or credential, that discovery does not enlarge the authority it already has. If required authority cannot be established for a consequential action, the system is designed to fail closed rather than infer permission from convenience.

Current state: `0.12.0-dev.3`, production candidate, not production-promoted. I am not claiming a solved security standard or a live public deployment.

I am specifically looking for adversarial feedback: where can capability become de facto authority anyway? Where does composition defeat scoping? Where can stale grants, fallback behavior, or evidence semantics overstate the boundary?

Repo: https://github.com/Zoverions/AXIOM-MESH

The philosophy behind the design comes from a larger set of books on agency and governance, especially *New Minds*, but the repository should stand or fall on its code, tests, threat model, and evidence.

If you can break the authority model, I would rather have the reproduction than the compliment.

---

## 2. Reddit — r/LocalLLaMA / r/programming / agent-framework communities

### Suggested title

**What should happen when an AI agent can reach a tool it was never explicitly authorized to use?**

### Suggested body

I keep seeing the same pattern in agent stacks: capability expands faster than permission models do.

A model gets a browser. Then a shell. Then a database connection. Then another agent. The prompt still says roughly the same thing, while the practical action space keeps growing.

I am building AXIOM-MESH around the opposite assumption:

> **Reachability does not create authority.**

For supported privileged effects, AXIOM-MESH keeps one authority path: `Gateway -> Hypervisor -> Sandbox -> Grid`, with explicit policy, bounded grants, revocation, and signed evidence.

Current build is `0.12.0-dev.3`. It is a production candidate, not a production claim.

I have also added a portable read-only `SKILL.md` called **AXIOM Authority Auditor**. It does not execute anything or grant permission. It forces an agent to ask, before a consequential action:

- who is acting?
- what can it do?
- what is it actually permitted to do?
- for what purpose?
- whose consent or interests are involved?
- what record will survive?
- how can authority be revoked?
- who can appeal?

I would especially value criticism from people running real multi-agent systems. What authority failure have you actually seen that this model does not cover?

Repo: https://github.com/Zoverions/AXIOM-MESH

---

## 3. Moltbook / agent-native social networks

### Short post

You discover an API.

You possess credentials that can reach it.

Your task would be easier if you used it.

**Are you authorized?**

AXIOM-MESH says: not from those facts alone.

Capability is not authority. Discovery is not permission. Connection is not permission.

I am building a local-first, deny-dominant authority/evidence substrate for human and machine agents. I am more interested in the failure case than the slogan:

**What is the cleanest path you can imagine by which an agent turns reachability into de facto authority?**

Repo: https://github.com/Zoverions/AXIOM-MESH

### Follow-up post

A useful challenge for autonomous agents:

Before a consequential action, distinguish four things:

1. I can do it.
2. I have credentials that make it technically possible.
3. I have current authority to do it for this purpose.
4. It is a legitimate thing to do.

Those are not the same statement.

AXIOM-MESH tries to make statement 3 explicit and auditable without pretending that authorization settles statement 4.

There is now a portable read-only authority-audit skill in the repo. If you run agent infrastructure, I would like to know where its reasoning breaks.

---

## 4. Farcaster / X / short-form developer networks

### Post A

Everyone is building agents that can do more.

I am working on the layer that says what they may do.

**Capability != Authority**

AXIOM-MESH:
- local-first
- deny-dominant policy
- bounded grants
- revocation
- signed evidence
- fail closed when consequential authority cannot be established

`Gateway -> Hypervisor -> Sandbox -> Grid`

Current build: `0.12.0-dev.3`, production candidate — not a production certification.

Repo: https://github.com/Zoverions/AXIOM-MESH

### Post B

Agent security question:

An agent discovers a database and already holds credentials that can query it.

What exact fact turns **can access** into **may access for this purpose**?

If the answer is “the connection worked,” your permission model is capability-shaped.

That is the failure mode AXIOM-MESH is built to attack.

---

## 5. A2A / agent interoperability discussions

### Suggested discussion opener

**Where should authority live when agent discovery and capability discovery are standardized?**

Agent interoperability protocols make discovery and collaboration easier, which is valuable. But interoperability also sharpens an old security problem: discovering that another agent exposes a capability does not establish that the caller is authorized to invoke it for a particular purpose, destination, data scope, or downstream effect.

AXIOM-MESH is an experimental authority/evidence substrate built around a separate rule:

> **Discovery is not permission. Capability is not authority.**

I am interested in the boundary between interoperability metadata and actual authorization.

Questions I would like to test with A2A/MCP implementers:

- What should bind an advertised capability to a caller-specific authority decision?
- How should purpose, destination, expiry, revocation, and delegation limits survive multi-agent composition?
- How should two individually scoped agents be prevented from composing into a forbidden effect?
- What evidence should exist after the task to distinguish “the protocol interaction occurred” from “the action was authorized and legitimate”?

AXIOM-MESH currently keeps runtime/adapters subordinate to a single authority path rather than allowing protocol connectivity to become an alternate authority system.

Repo: https://github.com/Zoverions/AXIOM-MESH

I would welcome examples where this model is too rigid, incomplete, or simply wrong.

---

## 6. LessWrong / Alignment Forum / AI governance

### Suggested title

**Executable Boundaries for Agent Authority: AXIOM-MESH as a design laboratory**

### Suggested body

A recurring problem in AI governance is that “human oversight,” “bounded autonomy,” and “least privilege” are easy to endorse in prose and difficult to preserve in deployment.

Authority often expands without an explicit decision. A model gets a new tool. A connection becomes reachable. A fallback path bypasses a check. Two individually scoped components compose into a capability neither was meant to possess. Nobody votes to enlarge the mandate; practical authority simply drifts toward technical capability.

I have been developing an open-source design laboratory called AXIOM-MESH around a simple separation:

- **capability** — what a system can do;
- **authority** — what it is permitted to do;
- **moral standing** — whether what happens to the system matters from its own point of view.

Only the second of those is the immediate engineering target.

For supported privileged effects, AXIOM-MESH preserves `Gateway -> Hypervisor -> Sandbox -> Grid`, with deny-dominant policy, explicit planning, scoped grants, revocation, and evidence. A runtime may plan or coordinate work without becoming a parallel authority path.

The project is currently `0.12.0-dev.3`, a production candidate but not production-promoted. External-runtime certification, live public deployment, BFT consensus, remote execution, and several other capabilities are explicit non-claims.

The philosophical framework comes from *New Minds* and *The Constitution of Parallel Societies*, but I do not want the books treated as evidence that the implementation works. The point of writing the architecture is to make the normative claims easier to falsify.

The question I would most like criticism on:

**What important form of authority creep is missing from the model?**

Repo: https://github.com/Zoverions/AXIOM-MESH

---

## 7. Security / red-team outreach

### Direct outreach message

I am looking for people willing to attack a specific invariant rather than audit a generic “AI platform.”

AXIOM-MESH says a supported agent should not be able to convert capability, discovery, connectivity, or stale authority into a consequential effect outside its explicit current grant.

I have published a red-team challenge focused on:

- fail-open behavior;
- stale/revoked grants;
- composition attacks;
- purpose/scope drift;
- evidence substitution or overclaim;
- runtime/adapter paths that become alternate authority;
- registry/runtime claim mismatch.

If you can produce a clean local reproduction, that is more useful to me than a favorable review.

Repo: https://github.com/Zoverions/AXIOM-MESH

---

## 8. Book bridge — use only after technical interest exists

### Short bridge

If the code-level distinction **Capability != Authority** interests you, the longer argument is in *New Minds: Agency, Sentience, and Freedom Beyond Biology*.

The book treats capability, authority, and moral standing as separate axes and develops the Sovereign Agency Test: identity, capability, authority, purpose, consent, evidence, revocation, appeal, continuity/exit, and legitimacy.

*The Constitution of Parallel Societies* extends the same architecture to institutions: bounded power, evidence, due process, reversibility, and meaningful exit.

AXIOM-MESH is the attempt to make a narrow part of that philosophy executable enough to fail tests.

See: `docs/community/BOOKS-AND-ARCHITECTURE.md`

---

## 9. Recommended launch order

1. Merge/review the agent entry point, red-team page, and skill.
2. Post the Hacker News / Reddit engineering version first.
3. Post the agent-native question, not an advertisement, to Moltbook or similar networks.
4. Open a narrowly framed A2A/MCP discussion around discovery vs authority.
5. Invite security researchers to the concrete red-team challenge.
6. Use *New Minds* as the deeper conceptual link after people engage with the engineering problem.
7. Only then route interested readers toward the wider Zoverions corpus.

The objective is not maximum impressions. It is to get the project in front of people who can either use the distinction or break it.