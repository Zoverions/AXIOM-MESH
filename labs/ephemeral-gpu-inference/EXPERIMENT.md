# Ephemeral GPU Inference Laboratory

**Status:** isolated frontier laboratory; no runtime capability promotion

**Experiment ID:** `LAB-010`

**Initial environment:** Google Colab managed runtime

**Authority boundary:** this laboratory is outside the trusted AXIOM kernel. It does not add a Gateway route, provider registration, compute-node admission, credential path, remote-execution path, durable Grid state, or capability-registry promotion.

## Hypothesis

A disposable notebook GPU can teach and reproduce the mechanics of loading an open model, running bounded inference, measuring the actual assigned hardware, and emitting an inert provider-shaped observation without making the notebook an AXIOM node or widening AXIOM authority.

The useful lesson is not a fixed free-GPU entitlement. It is that model execution can remain replaceable behind AXIOM's provider/compute abstractions, including on temporary hardware that the operator does not own.

## External constraint source

Google Colab FAQ: https://research.google.com/colaboratory/faq.html

As reviewed on 2026-09-18, the FAQ says free Colab provides access to compute including GPUs/TPUs, but resources are not guaranteed or unlimited, limits and available GPU types vary over time, and free notebooks can run for at most 12 hours depending on availability and usage patterns.

The FAQ also restricts free managed-runtime uses including remote SSH/desktops, primarily bypassing the notebook UI with a web UI, and distributed-computing workers. This laboratory therefore stays inside the interactive notebook and opens no serving surface.

## Threat model

The experiment is designed against:

- treating temporary accelerator discovery as execution authority;
- inserting production AXIOM credentials, secrets, user memory, private files, or personal data into a third-party notebook;
- mounting Google Drive and accidentally broadening file access;
- creating SSH, tunnels, public web UIs, HTTP servers, remote desktops, or other serving/control paths;
- turning a disposable notebook into a distributed worker;
- hard-coding a claimed GPU model, memory size, weekly quota, or availability;
- reporting a successful model run when no GPU was actually assigned;
- persisting raw prompt/output content when hashes and measurements suffice;
- treating a notebook observation as a benchmark, provider certification, production receipt, or remote-execution proof;
- changing `mesh/config/capabilities.json` or the runtime/provider catalog merely to make the experiment convenient.

## Assumptions

- The operator is authorized to use the Google account and Colab runtime.
- The selected model is publicly accessible without a secret token.
- Synthetic/public prompts only are used.
- Package and model acquisition require ordinary outbound internet access from the notebook runtime.
- Colab hardware, quotas, idle timeout, maximum lifetime, packages, and availability may change.
- The runtime may disappear at any time and must not hold the only copy of valuable state.
- AXIOM's supported kernel remains authoritative for AXIOM behavior; this notebook is not a conformance oracle.

## Test data and provenance

The default request is a short synthetic prompt embedded directly in the notebook. No production data is required.

The initial public model is `Qwen/Qwen2.5-0.5B-Instruct`, loaded with `trust_remote_code=False`. The notebook records the model reference, any commit hash exposed through the loaded model configuration, Python/Torch/Transformers versions, actual GPU name and memory, token counts, elapsed time, peak allocated GPU memory, and SHA-256 hashes of the synthetic input and output.

The emitted observation deliberately omits the prompt text and model output.

## Isolation boundary

The laboratory consists of:

- `labs/ephemeral-gpu-inference/EXPERIMENT.md`;
- `labs/ephemeral-gpu-inference/colab/axiom_ephemeral_gpu.ipynb`;
- `mesh/test/ephemeral-gpu-inference-lab.test.mjs`, which statically checks the notebook boundary.

The notebook:

- is interactive and ephemeral;
- performs no AXIOM authentication and receives no AXIOM credential;
- mounts no Google Drive;
- opens no network listener, tunnel, SSH service, remote desktop, or web UI;
- starts no distributed worker;
- calls no Gateway, Hypervisor, Sandbox, or Grid API;
- writes only an inert observation JSON file to the notebook VM's `/content` filesystem;
- creates no capability, grant, receipt, provider registration, compute-node admission, or production state.

Ordinary package/model downloads from public sources are environment egress, not AXIOM authority.

## Procedure

1. Open `colab/axiom_ephemeral_gpu.ipynb` in Google Colab.
2. Choose a GPU runtime if one is available.
3. Run the hardware probe. Stop if no CUDA GPU is assigned.
4. Install the notebook-only inference dependencies.
5. Load the default public model or deliberately substitute another public model that requires no secret.
6. Run the one bounded synthetic request.
7. Inspect the model output and generated inert observation.
8. Copy the observation out only if useful as a development artifact.
9. Disconnect and delete the runtime.

## Failure criteria

The experiment fails or is inconclusive if:

- no CUDA GPU is assigned;
- the notebook assumes rather than measures accelerator or memory;
- the model cannot load without introducing a secret or private credential;
- Google Drive access, SSH, tunneling, a public listener, web UI, distributed worker, or background service becomes necessary;
- private or production data becomes necessary;
- the observation contains raw prompt/output instead of hashes;
- the notebook claims a fixed GPU, VRAM amount, quota, or runtime entitlement;
- a capability-registry, provider-catalog, Gateway, policy, or authority change becomes necessary;
- any repository isolation-boundary regression test fails.

## Halt and cleanup

If a failure criterion is met:

1. stop the notebook;
2. do not add credentials or broaden network access to force success;
3. record the failure as hardware unavailable, dependency/model drift, policy incompatibility, or another specific cause;
4. delete any copied sensitive material if introduced accidentally;
5. use Colab's **Disconnect and delete runtime** action;
6. leave AXIOM capability/provider state unchanged.

No AXIOM production rollback is required because the lab has no production integration.

## Reproducibility

Repository-side static verification:

```bash
node --test mesh/test/ephemeral-gpu-inference-lab.test.mjs
npm --prefix mesh run docs:check
```

Interactive reproduction requires a Colab runtime that actually receives a CUDA GPU. Record the generated observation, including hardware and package versions, because resource assignment is dynamic.

A later run on different hardware is a new observation, not a contradiction.

## Promotion path

This laboratory may inform `AI-002`, `ROUTE-001`, and later authenticated remote-dispatch work, but it does not itself satisfy them.

Before any remote ephemeral compute can become a real AXIOM execution target, a separate reviewed adapter needs explicit identity, software/artifact binding, destinations, data scope, credential custody, residency, resource ceilings, timeout/cancellation, result provenance, failure/uncertainty semantics, provider terms, and normal Gateway authorization.

The runtime/provider catalog should remain unchanged until such a contract is deliberately designed. Current local-compute research entries should not be stretched to represent Colab merely because Colab can run a model.

## Current non-claims

This laboratory does **not** claim:

- Google guarantees a V100, 16 GB of VRAM, 30 GPU-hours per week, or any fixed free-tier allocation;
- Colab is an AXIOM node, admitted Mesh node, managed node, or supported compute backend;
- Colab is registered as an AXIOM model provider;
- AXIOM can remotely dispatch work to Colab;
- the notebook is a production model server or creates a network/API surface for AXIOM;
- the notebook result is an AXIOM receipt or cryptographic attestation;
- the selected model is endorsed, benchmark-superior, safe for production, or suitable for private data;
- package/model download egress creates AXIOM egress permission;
- a successful run promotes `ai.providers` or any other capability.

The intended result is narrower: **a zero-cost or low-cost disposable learning lane for model execution and integration mechanics, with the authority boundary kept intact.**
