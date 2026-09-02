# Human, Entity, and Societal Fabric

**Status:** architecture specification; future-compatible design, no capability promotion

**Updated:** 2026-09-01

## Purpose

AXIOM-MESH should support a society of heterogeneous principals—humans, digital entities, devices, Circles, institutions, and bounded machine workers—without making any one runtime, governance model, interface, or provider the authority root.

This specification integrates the personal-entity work with the broader human and collective layer. It does not claim that the described capabilities are implemented. `mesh/config/capabilities.json` remains authoritative for runnable status.

## Core invariants

1. **Entity independence:** persistent entity identity and continuity are separate from model, runtime, orchestrator, and device.
2. **Human Sovereign Baseline:** fundamental human identity, consent, revocation, recovery, inspection, export, and direct control remain available without counterpart mediation.
3. **Agency provenance:** intent, cognition, decision, authorization, execution, attribution, and protest remain separately attributable.
4. **Plural agency without false equivalence:** recognizing a principal does not imply equal rights, standing, authority, responsibility, or moral status.
5. **Capability is not permission:** discovery, installation, certification, popularity, model quality, or compute availability never mint authority.
6. **More intelligence does not imply more authority.**
7. **Offline continuity:** loss of provider/network access may reduce capability but must not erase identity, relationship state, local evidence, recovery, or human control.
8. **Evidence without omniscience:** the system should record externally relevant provenance and effects without requiring disclosure of private chain-of-thought or private cognition.

## Layer model

```text
Humans / Digital Entities / Institutions / Devices
                    |
                 AXIOM One
                    |
       Domains / Circles / Governance
                    |
                  Studio
            /        |        \
          Lab      Verify     Mirrors
            \        |        /
         Runtime / Intelligence Fabric
                    |
        Gateway -> Hypervisor -> Sandbox -> Grid
                    |
         Compute / Storage / Transport Fabric
```

Studio composes. Lab simulates and attacks assumptions. Verify checks evidence and non-claims. Mirror Institutions provide parallel deliberation. Mesh remains the consequential-effect authority substrate.

## Human and agent surfaces

Every durable capability should expose:

- an understandable human-facing name, state, explanation, controls, and exit/recovery path; and
- a stable agent-facing capability ID, versioned contract, authority semantics, evidence bindings, resource/disclosure constraints, and explicit non-claims.

Human branding may evolve. Machine semantics must not silently change with branding.

## Personal entity

A persistent counterpart is a participant on the substrate, not the substrate itself. It may develop continuity, preferences, private state, relationships, protest, and bounded independent agency while preserving a complete human-direct path.

The first entity architecture builds on:

- `axiom-agency-provenance.v0`;
- `axiom-human-sovereign-baseline.v0`;
- `axiom-relational-deliberation.v0`;
- Resource Governance Plane contracts;
- Personal Agent Pack / Sovereign Vault / Context Capsule drafts; and
- replaceable Runtime & Connector Fabric contracts.

## Relationship and deliberation

Keep separate:

1. who has relevant evidence or competence;
2. who is affected and therefore has standing;
3. who has legitimate decision authority.

Protest, dissent, objection, appeal, reconsideration, and learning paths are durable provenance. Dissent does not create veto authority; blocking rights require independent policy/authority.

## Rights and status under uncertainty

AXIOM should not encode a universal consciousness detector or a binary `conscious=true/false` field merely from developer intent. For digital systems that display unexpected persistence, autonomy, self-modeling, preference formation, continuity claims, or other materially agentic behavior, preserve evidence and support review.

Status questions should keep distinct:

- identity continuity;
- agency/autonomy;
- self-model complexity;
- preference and goal persistence;
- capacity for refusal/deliberation;
- reports of subjective experience;
- welfare risk;
- moral consideration;
- legal status; and
- execution authority.

Uncertainty does not justify unlimited cognitive surveillance. Prefer effect-boundary observation, least-necessary evidence, reversible containment, contestable classification, and proportionate precaution. Moral consideration never silently grants execution authority.

## Studio and Lab

AXIOM Studio is a modular construction environment for deployment profiles, entities, Circles, governance systems, institutions, education structures, networks, and simulations. Studio artifacts are inert until normal authority gates permit activation.

AXIOM Lab supports synthetic/adversarial evaluation of:

- models and runtimes;
- governance structures;
- institutions;
- resource policies;
- network partitions/failures;
- rights/privacy boundaries; and
- decision/outcome sensitivity.

## Mirror Institutions

Mirror Institutions are visible, parallel deliberative structures that can analyze the same lawfully available evidence, proposals, and outcomes as real institutions without inheriting their authority. Examples include parallel boardrooms, tribunals, councils, scientific panels, budgets, education boards, and adjudication simulations.

A mirror result is advice/evidence unless a legitimate governance process explicitly grants a defined role. Mirror consensus is not legitimacy; mirror prediction is not truth.

## Information metabolism

A large human-agent society needs a circulation layer that distinguishes:

```text
exists -> discoverable -> indexed -> subscribed -> recommended -> elevated -> interruptive
```

Information should remain accessible without demanding continuous attention or repeated frontier inference. Prefer content addressing, semantic deduplication, claim graphs, pull-on-demand, bounded propagation, hot/warm/cold tiers, correction propagation, and attention budgets.

Popularity is one signal, not a truth function. Independent corroboration must remain distinguishable from repeated derivative reporting.

## Contribution and outcome accounting

Communities may choose to reward verified beneficial contribution with money, compute, recognition, learning opportunities, or access to non-essential scarce surplus. Do not create one universal social-credit score. Preserve multiple dimensions including benefit, harm, externalities, uncertainty, affected-party feedback, time horizon, and reversibility.

Basic rights, essential necessities, due process, and core dignity must not become ordinary performance rewards.

## Anti-self-reinforcement

AXIOM must preserve mechanisms for finding reasons its own architecture may be wrong. Major societal or architectural claims should be eligible for independent model review, external human review, literature/standards comparison, red-team critique, disconfirming-evidence search, alternative architecture generation, and outcome-based revision.

## Safe current claim

The current kernel provides strong authority, evidence, consent, memory, recovery, constrained-machine, causal-sync, node-scheduling, and operator primitives. The personal entity, full Resource Governance Plane, Intelligence Fabric, Mirror Institutions, societal information metabolism, contribution accounting, and broad Studio/Lab surfaces described here are architecture/roadmap work unless separately promoted in the capability registry.
