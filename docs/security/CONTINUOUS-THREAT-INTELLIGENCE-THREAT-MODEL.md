# Continuous Threat Intelligence A/B Threat Model

## Scope and non-claims

This document covers only the evidence-only and offline-analysis surfaces implemented by Continuous Threat Intelligence Slices A–B.

The supported claims are limited to closed threat-evidence contracts, checked-in/offline source normalization, deterministic current-build applicability mapping, provenance-preserving observation lifecycle projection, and authority-boundary regression tests.

Explicit non-claims:

- **no live threat feed claim**;
- **no autonomous containment claim**;
- **no production credential access**;
- **no current-build vulnerability claim follows from a vendor report alone**;
- no external network collection;
- no model or provider activation;
- no automatic policy/capability mutation;
- no reproduction-lab execution;
- no production promotion.

Checked-in report fixtures are paraphrased structured observations, not executable source content and not proof that AXIOM is vulnerable to the described techniques.

## Trust boundaries

Slices A–B sit outside the consequential authority path as an evidence and verification adjunct.

The protected authority path remains:

```text
Gateway -> Hypervisor -> Sandbox -> Grid
```

Threat observations, hypotheses, build facts, lifecycle projections, and adaptation receipts do not become alternate authority roots. `mesh/config/capabilities.json` remains authoritative for implemented capability state.

A/B receives already-loaded plain data. It does not acquire filesystem, browser, provider, network, credential, runtime-launch, recovery, or deployment authority.

## Threat actors and poisoned-source assumptions

Assume that threat-intelligence content can be produced or modified by:

- competent attackers;
- compromised vendors or upstream sources;
- malicious community submitters;
- compromised peers;
- prompt-injection authors;
- operators who unintentionally repeat stale or incorrect claims;
- automated systems that overstate confidence or omit provenance.

Source count, vendor identity, model fluency, or popularity does not create authority or truth.

## Authority non-amplification

A/B must preserve these properties:

- observations cannot mint capabilities;
- hypotheses cannot authorize execution;
- applicability results cannot produce `current_build_vulnerable` or `current_build_blocked` in A/B;
- report confidence cannot bypass currentness, exact-effect authorization, approval, consent, or policy;
- lifecycle state cannot become containment instruction;
- receipts remain evidence records rather than tokens;
- no defensive component may widen its own access because it reports an emergency.

The strongest applicability states available to the A/B evaluator are `unassessed`, `plausible`, and `not_applicable`.

## Offline source admission

The normalizer accepts an already-loaded plain object with explicit source metadata, bounded source text, and bounded structured claims.

It does not:

- open paths;
- follow URLs;
- fetch remote content;
- execute code;
- render active HTML/Markdown;
- invoke tools;
- access environment variables;
- inspect credentials;
- create child processes.

Source text is hashed for provenance and otherwise remains inert. Durable observations are constructed from explicit structured claim fields rather than by executing or obeying the source text.

## Prompt/tool/source-content poisoning

Threat intelligence is adversary-adjacent by definition. Inputs may contain system-prompt-like text, fake tool descriptions, command-like strings, URLs, credential names, or model-control language.

A/B treats all such material as source bytes. It has no tool-execution path and no provider/model context with credentials. Source text is not copied into durable summaries automatically.

A successful prompt injection against an imagined analyst therefore cannot obtain authority through the A/B libraries because those libraries contain no analyst model or consequential tool path.

## Provenance, contradiction, and freshness

Each observation is digest-bound and carries source metadata plus a bounded provenance chain.

Corrections, contradictions, withdrawals, upstream fixes, and expiry preserve historical evidence. Corpus projection returns original verified observations alongside a derived lifecycle state rather than rewriting the original digest-bound object.

Required failure properties include:

- same observation identifier plus different digest fails as substitution;
- byte-identical evidence deduplicates;
- cross-source supersession/contradiction is rejected when both sides are present and source provenance conflicts;
- contradiction remains visible rather than being silently resolved;
- expiry changes current projection without deleting evidence;
- stale or withdrawn evidence cannot silently refresh itself.

## Applicability false-positive and false-negative risk

The evaluator is deliberately conservative and exact-vocabulary only.

False positives remain possible when a report names a boundary that exists but the real exploit preconditions do not. Therefore a match produces at most `plausible`.

False negatives remain possible when a relevant threat uses vocabulary not represented in the explicit build-facts projection. Therefore unknown surfaces remain `unassessed`, not `not_applicable`.

Named controls such as deny-egress or one-use approval are recorded as evidence/precondition mappings only. A/B does not infer that a threat is confirmed blocked merely because a control name is present.

## Privacy and evidence minimization

A/B avoids centralizing raw incident content unnecessarily.

Ordinary durable observations contain bounded summaries, indicators, affected boundaries, preconditions/effects, digests, and source metadata. `raw_content_reference` is null or an inert governed reference; raw threat text is not embedded automatically.

Fixtures contain no real credentials, private keys, personal dossiers, destructive payloads, or live exploit targets.

Telemetry, user content, prompts, browsing history, and unrelated personal information are out of scope.

## Failure semantics

- malformed schemas fail closed;
- unknown fields fail closed;
- malformed timestamps fail closed;
- digest mismatch fails closed;
- unknown source classes fail closed;
- oversized source/contract objects fail closed;
- unknown applicability remains `unassessed`;
- missing peer/network data cannot lower local protections because A/B has no peer/network dependency;
- lifecycle ambiguity preserves evidence and does not authorize action.

## Slice A/B evidence requirements

A/B is complete only when executable evidence demonstrates:

1. all five threat-intelligence contracts are closed, bounded, and digest-verifiable;
2. untrusted source text remains inert;
3. sanitized external-report fixtures contain no operational exploit instructions;
4. deterministic applicability cannot manufacture confirmed vulnerability/safety states;
5. contradictions, supersession, withdrawal, fixes, and expiry preserve historical evidence;
6. no live network/effect imports or authority-bearing schema fields are introduced;
7. canonical documentation checks and the full kernel verification pass;
8. the final diff remains inside the approved changed-file envelope.

## Deferred Slice C-G risks

The following remain outside A/B and require fresh implementation gates:

- Slice C disposable reproduction environments and malicious-artifact handling;
- Slice D regression-promotion mechanics and review authority;
- Slice E behavioral monitoring, telemetry provenance, and anomaly false-positive controls;
- Slice F live external feed adapters, egress, source authentication, parser isolation, and feed poisoning;
- Slice G bounded automatic containment, emergency policy, quarantine, revocation, rollback, and anti-autoimmunity controls.

Additional deferred risks include provider-routing provenance, recovery executable-state inspection, production credential-broker integration, host/kernel-assisted observation, and any cross-node Cooperative Immune Fabric exchange.

Successful A/B verification grants no authority to implement or activate those later slices.