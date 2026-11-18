# Inference Measurement Substrate v0 — Design

**Status:** approved architectural extension for an inert, zero-authority first slice

**Date:** 2026-09-17

**Issue:** #1607

**Audit base:** `b8a746eace641c1b97ca70163bb030f49ca033f3`

**Scope:** workload and benchmark-evidence contracts for reproducible inference measurement. The v0 slice performs no model invocation, provider access, network I/O, credential use, GPU allocation, runtime activation, routing decision, capability promotion, deployment, or spending.

**Builds on:**

- `docs/superpowers/specs/2026-08-30-sovereign-intelligence-selection-v0-design.md`
- `docs/superpowers/specs/2026-08-29-extensible-agent-provider-substrate-design.md`
- issue #1461 — inference-serving/model adapters and stable primary cognition
- issue #1468 — workload-adaptive compute and hardware/software optimization laboratory
- issue #1540 — exact provider/model/harness provenance
- issue #1600 — behavioral assurance and response-level quality evidence
- issue #1478 — cost-per-completed-outcome accounting
- issue #1492 — failure-domain diversity and degraded mode
- issue #897 — scale, concurrency, soak, and restart evidence
- issue #1401 — measurable consequence-proportional trust overhead
- issue #1463 — sovereign-host and accelerator evidence boundary

## 1. Core decision

AXIOM should measure inference before optimizing or routing it.

The first executable slice therefore adds two inert, content-addressable contracts:

1. **Inference Workload Profile v0** — defines the workload being measured without naming a required engine or provider.
2. **Inference Benchmark Evidence v0** — binds observations to the exact measured execution system, workload, environment, and measurement protocol.

The contracts are evidence-only.

> **Benchmark evidence is not capability authority. Eligibility is not selection. Selection is not execution. Faster is not safer. Cheaper is not admissible.**

`mesh/config/capabilities.json` remains authoritative for runnable capability state. No benchmark result may directly mutate that registry, Cognitive Topology, provider activation, policy, authority, consent, or deployment state.

## 2. Architectural placement

The substrate sits between existing provider/cognition descriptions and later optimization/routing work:

```text
runtime/provider catalog + cognitive capability profile
                |
                v
      Inference Workload Profile
                |
                v
     controlled benchmark execution
       (future, separately gated)
                |
                v
     Inference Benchmark Evidence
                |
        +-------+---------+
        |                 |
        v                 v
#1468 optimization   #1461 serving/routing evidence
        |                 |
        +-------+---------+
                |
                v
separate eligibility / authority / execution boundaries
```

The v0 contract layer implements only the two boxed evidence artifacts and their deterministic validation/digest behavior. The controlled benchmark executor remains future work.

## 3. Inference Workload Profile v0

Schema identifier:

`axiom-inference-workload-profile.v0`

The profile describes a bounded request population. It must be independent of any specific model or serving engine so the same workload can be replayed against several candidates.

### 3.1 Identity and purpose

Required fields:

- `schema`;
- `version`;
- `profile_id`;
- `profile_version`;
- `task_family`;
- `purpose`;
- `fixture_digest`;
- `created_at`.

Identifiers use the repository's existing bounded identifier grammar where compatible. `fixture_digest` commits to the exact synthetic/public replay fixture used by the profile.

### 3.2 Token and request shape

The profile declares bounded distributions rather than prose-only descriptions:

- input-token minimum / nominal / maximum;
- output-token minimum / nominal / maximum;
- context-length tiers;
- concurrency values;
- optional request-arrival rate;
- optional batch-size values;
- streaming vs non-streaming;
- optional repeated-prefix token/byte counts;
- optional expected request count or duration for batch/soak-style profiles.

All numeric fields are finite, non-negative, bounded integers or finite non-negative numbers according to their unit. Minimum/nominal/maximum order is enforced where present.

### 3.3 Constraints and objectives

The profile may declare bounded objectives without turning them into authorization rules:

- TTFT objective;
- inter-token-latency objective;
- end-to-end latency objective;
- throughput objective;
- locality/privacy constraint;
- quality-evidence requirement;
- power/energy measurement expectation;
- cost-accounting expectation.

A declared objective is an evaluation target. It does not grant permission to use a provider, device, dataset, destination, credential, or budget.

### 3.4 Standard v0 workload families

The initial fixture set contains six synthetic/public workload families.

**W0 — interactive agent**

- approximately 1k input tokens;
- 100–300 output tokens;
- concurrency ladder 1–16;
- TTFT and inter-token latency are primary observations.

**W1 — long-context research**

- 16k / 32k / 64k / 128k context tiers where a later candidate supports them;
- prefill latency, memory pressure, and KV-cache usage are primary observations.

**W2 — repeated personalized prefix**

- a stable synthetic reusable prefix across repeated turns;
- explicit cache-disabled vs cache-enabled comparison seam;
- models MAJIK/personal-agent repeated context without storing user prompts or personal data in repository fixtures.

**W3 — structured agent operation**

- short typed/JSON-style output;
- low output-token count;
- latency and schema-valid completion are primary observations.

**W4 — code-agent workload**

- bounded repository/context tiers and bounded code output;
- performance evidence remains separate from task-success/quality evidence.

**W5 — batch intelligence**

- large independent request set;
- classification, summarization, embedding, extraction, or ranking-style synthetic/public work;
- throughput and queue behavior are primary observations.

The v0 fixtures contain no secrets, credentials, production data, private user records, or personal prompt histories.

## 4. Inference Benchmark Evidence v0

Schema identifier:

`axiom-inference-benchmark-evidence.v0`

A benchmark artifact describes what was actually observed under an exact workload and harness.

### 4.1 Evidence class

The closed v0 evidence-class vocabulary is:

- `measured`;
- `independently-reproduced`;
- `simulated`;
- `estimated`;
- `provider-reported`.

The class must remain visible to consumers. An estimate or vendor statement cannot be silently normalized into a local measurement.

### 4.2 Exact workload binding

Every benchmark artifact binds:

- exact `profile_id`;
- exact `profile_version`;
- canonical workload-profile digest;
- exact fixture digest.

The validator recomputes or verifies the applicable digest through repository canonical helpers. Workload substitution fails closed.

### 4.3 Subject and harness binding

The evidence binds the complete measured system where the information is available and material to the claim:

- repository revision;
- model/provider identifier;
- exact model revision or artifact digest;
- engine/adapter identifier and version;
- engine/adapter implementation digest where applicable;
- orchestrator/runtime identifier and version;
- tokenizer identifier/revision;
- numeric/quantization format;
- sampling/configuration digest where behaviorally material;
- prompt/template/context-policy digest;
- tool/memory-policy digest where part of the measured harness;
- benchmark-harness identifier/version/digest.

A model label without the surrounding harness is insufficient for a harness-specific claim.

### 4.4 Environment binding

Where applicable, the evidence records:

- OS;
- architecture;
- CPU identity;
- host RAM;
- accelerator kind/model/count;
- accelerator memory;
- driver version;
- firmware version where materially relevant and observed;
- CUDA/ROCm/other runtime version;
- interconnect/topology description or digest for multi-device measurement;
- measurement timestamp;
- measurement-source identifiers.

Unknown or unmeasured fields remain explicitly unknown/null according to the schema. The validator must not infer hardware capability from a product name.

### 4.5 Measurement protocol

Evidence records the procedure needed to interpret the result:

- warmup count/duration;
- measured request count or duration;
- concurrency/batch setting;
- sampling/streaming mode;
- cache mode;
- failure/retry handling;
- percentile method/version where applicable;
- profiler/telemetry source where applicable.

Averages alone are insufficient for latency claims when percentile fields are required by the profile.

### 4.6 Latency and throughput observations

The schema preserves dimensions separately:

- TTFT p50/p95/p99;
- inter-token latency / TPOT p50/p95/p99;
- end-to-end latency p50/p95/p99;
- prefill throughput;
- decode throughput;
- aggregate tokens/second;
- requests/second;
- queue/wait time where measured;
- request count;
- success count;
- error count;
- overload/rejection count;
- OOM count.

Percentiles must be non-decreasing: `p50 <= p95 <= p99`.

Successful throughput cannot erase failed/rejected/OOM requests from the evidence object.

### 4.7 Resource observations

Where actually measured:

- peak and steady accelerator memory;
- KV-cache bytes/occupancy;
- host RSS/RAM;
- CPU utilization;
- accelerator utilization;
- memory-bandwidth utilization;
- network/interconnect bytes or rate;
- power draw;
- energy consumed;
- thermal/throttling state.

Each optional measured value carries a unit fixed by the schema. Missing measurement support is represented as absent/unknown, not zero.

### 4.8 Economic observations

Economic evidence remains componentized:

- direct provider/inference price;
- hardware amortization estimate plus method reference;
- electricity estimate plus rate/source reference;
- reserved/idle-capacity assumption;
- retries/failure cost;
- verification/evaluation cost;
- denominator used for any per-token/per-request/per-outcome derived figure.

The benchmark contract does not replace #1478. It only carries exact cost inputs/derived observations needed to reproduce an inference-specific comparison.

### 4.9 Quality/equivalence binding

Performance changes can alter output quality or behavior. The evidence therefore carries one explicit quality state:

- `not-established`;
- `externally-bound`.

`externally-bound` requires an exact digest/reference to a separately defined quality/evaluation artifact. #1600 behavioral-assurance evidence may later satisfy this role when the evaluation population and harness match.

Quantization, speculative decoding, cache changes, kernel changes, engine changes, or parallelism changes cannot be represented as quality-equivalent solely because outputs were produced successfully.

## 5. Hard non-authority constants

Both v0 contracts use project-standard hard constants, normalized to the existing vocabulary during implementation. At minimum their semantics are:

```text
authority_effect = none
network_effect = none
credential_visibility = none
runtime_activation = false
selection_effect = none
capability_promotion = false
```

Unknown fields fail closed.

Validation and digest generation must perform no filesystem mutation, network operation, subprocess execution, provider invocation, credential lookup, wallet access, GPU API call, Grid mutation, model loading, or runtime activation.

## 6. Validation and fail-closed behavior

Validation rejects at least:

- unknown top-level or nested fields;
- unknown enum values;
- malformed identifiers, timestamps, digests, units, or revisions;
- duplicate context/concurrency/batch tiers;
- invalid min/nominal/max ordering;
- negative or non-finite duration/resource/cost values;
- invalid percentile ordering;
- success/error/rejection/OOM totals inconsistent with request count;
- missing or mismatched workload binding;
- missing exact harness fields for a claim that declares them required;
- duplicate observation keys;
- `quality_state: externally-bound` without quality evidence;
- a benchmark that declares quality equivalence without a bound artifact;
- an `independently-reproduced` result lacking an independent reproducer reference;
- an authority/network/credential/runtime/selection/promotion constant changed from the zero-effect value.

Input documents remain unmodified and returned normalized objects/evidence summaries are deeply frozen according to established repository convention.

## 7. Relationship to existing programmes

### 7.1 #1461 — serving engines and cognition selection

#1461 remains the owner of inference-serving interfaces, adapters, preferred-primary cognition, fallback policy, and later routing. The benchmark substrate supplies evidence to that programme; it does not choose a winner or invoke an engine.

Later adapters may include vLLM, SGLang, TensorRT-LLM, llama.cpp, MLX/MLX-LM, Ollama, external APIs, and future engines as separately reviewed targets. Durable contracts remain engine-neutral.

### 7.2 #1468 — optimization laboratory

#1468 consumes pinned workload and benchmark evidence for configuration, KV-cache, quantization, speculative decoding, compiler/kernel, parallelism, distributed inference, FPGA, or later hardware/software co-design experiments.

Optimization work must preserve the exact before/after workload/harness and retain negative evidence, quality uncertainty, OOMs, tail latency, and resource costs.

### 7.3 #1540 and #1600 — provenance and quality

#1540 remains the canonical source for exact provider/model/harness provenance semantics. #1600 remains the quality/behavior evidence lane. This v0 design references those artifacts rather than inventing competing provenance or universal quality scores.

### 7.4 #1478 — economics

The benchmark artifact may carry inference cost components. Wider useful-outcome economics, retries, human supervision, downstream tools, verification, and physical-effect costs remain #1478 concerns.

### 7.5 #1492 — resilience

A fast candidate with correlated dependencies is not automatically resilient. Failure-domain evidence and degraded-mode policy remain separate and can later constrain candidate eligibility before optimization.

## 8. Stage mapping for the wider inference programme

The learning/build roadmap is intentionally distributed across existing AXIOM programmes:

1. **Systems foundations** — #1463/#1468 host and laboratory evidence.
2. **GPU architecture fundamentals** — #1468 measured accelerator/resource evidence.
3. **Transformer inference anatomy** — workload profiles, KV/model memory estimators, arithmetic-intensity experiments under #1468.
4. **Serving engines** — #1461 interchangeable inference adapters and service interface.
5. **KV cache optimization** — #1468 experiments bound to this measurement substrate.
6. **Quantization/compression** — #1468 performance evidence plus #1600 quality evidence.
7. **Speculative decoding/parallelism** — #1468 exact-harness experiments.
8. **Kernel optimization** — #1468 profiler-first software optimization.
9. **Distributed inference** — #1457/#1463/#1468 voluntary compute and topology evidence; node membership never implies compute authority.
10. **Autoscaling/economics** — #1478 plus deployment/resource planning; spend remains separately governed where consequential.
11. **Gateway/routing/reliability** — #1461 + #1492 + existing Gateway/authority boundaries. Optimization occurs only among already-eligible candidates.
12. **Portfolio/benchmarks** — reproducible evidence and Community Testnet-style independent reproduction where useful, without turning benchmark publication into authority.

## 9. First executable slice

The first implementation should remain zero-authority, network-free, and GPU-free:

1. add pure Workload Profile v0 validator/canonicalizer/digest helper;
2. add pure Benchmark Evidence v0 validator/canonicalizer/digest helper;
3. add W0–W5 synthetic/public fixtures;
4. add valid synthetic evidence for local single-device, provider-remote, and multi-device subjects;
5. add hostile validation tests for the fail-closed cases in this design;
6. add static import/surface tests proving no network, subprocess, credentials, Grid, provider invocation, model loading, runtime activation, or GPU API dependency;
7. cross-link the implemented contracts from #1461 and #1468;
8. keep `mesh/config/capabilities.json` unchanged;
9. run required repository checks before presenting the slice as implementation-ready.

No benchmark runner is required for the first slice. The purpose is to lock down what later real measurements must mean before acquiring engine/provider-specific execution code.

## 10. Promotion boundary and non-claims

Completion of v0 establishes a measurement/evidence vocabulary only.

It does **not** establish or authorize:

- live vLLM/SGLang/TensorRT-LLM/llama.cpp integration;
- live provider/API access;
- provider credentials;
- GPU/NPU allocation;
- automatic model selection or routing;
- prefix caching, KV quantization, speculative decoding, kernel optimization, or CUDA-graph optimization;
- quantization quality equivalence;
- tensor/pipeline/expert parallel production serving;
- distributed inference or remote compute participation;
- autoscaling;
- production SLOs;
- production cost figures;
- independent model/provider certification;
- spending;
- deployment;
- capability-registry promotion;
- authority from benchmark superiority.

The design intentionally makes later inference engineering easier to compare and harder to overclaim.