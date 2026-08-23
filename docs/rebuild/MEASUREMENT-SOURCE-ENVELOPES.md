# AXIOM-MESH Measurement Source Envelopes

**Status:** inert stacked architecture candidate; not a current capability claim  
**Depends on:** `axiom-resilient-path-fabric.v0` and `axiom-path-observation-evidence.v0`  
**Authority effect:** none  
**Network effect:** none

## Purpose

Path Observation Evidence v0 proves that a path claim was signed by an externally trusted role, matches the exact path portfolio, and satisfies the evaluator's evidence-freshness policy. It deliberately does not prove where the underlying measurement or source artifact came from.

Measurement Source Envelopes v0 adds the next provenance layer. It binds each evidence `source_ref` and source-artifact SHA-256 to a separately signed record describing:

- who recorded the source;
- what class of observation/query it was;
- when capture started and completed;
- the source clock and declared clock uncertainty;
- the exact measurement/query method identity;
- implementation, configuration, and environment digests;
- the raw artifact digest, content type, size, and retention status;
- a digest of the normalized result;
- an explicit uncertainty representation;
- exactly which Path Observation Evidence statements depend on that source; and
- the current reproduction status.

The contract still does not operate sensors, query regulators, read radios, alter routing, reproduce raw artifacts, or establish physical-world truth.

## Layered trust sequence

```text
raw measurement / query / assessment
  -> raw artifact digest
  -> signed Measurement Source Envelope
  -> externally supplied source-recorder trust + role
  -> source freshness / clock / claim-lag policy
  -> signed Path Observation Evidence
  -> path-claim trust + freshness policy
  -> exact Resilient Path Fabric portfolio
  -> still no route authority
```

This preserves an important distinction:

**fresh signed claim != fresh source measurement != accurate measurement != authorized network effect**

## Source kinds and externally trusted roles

Each Path Observation Evidence kind maps to one source kind in v0:

| Evidence kind | Measurement source kind | Required source-recorder role |
|---|---|---|
| `node-profile` | `node-profile-observation` | `node-profile-recorder` |
| `node-attestation` | `attestation-observation` | `attestation-source-recorder` |
| `node-energy` | `energy-observation` | `energy-source-recorder` |
| `link-profile` | `link-profile-observation` | `link-profile-recorder` |
| `link-latency` | `latency-measurement` | `telemetry-source-recorder` |
| `link-regulatory` | `regulatory-query` | `regulatory-source-recorder` |
| `link-failure-domains` | `failure-domain-assessment` | `failure-domain-source-recorder` |

The source package cannot self-provision its own trust root. Recorder public keys and permitted roles are supplied independently by the evaluator. Only Ed25519 keys are accepted in v0.

A valid source-recorder signature proves attribution under that evaluator trust policy. It does not prove that the recorder's sensor, regulator query, assessment, clock, configuration, or reported result was correct.

## Exact source binding

The source package binds the exact:

- Resilient Path Fabric `portfolio_digest`; and
- Path Observation Evidence `verification_digest`.

Every unique evidence `source_ref` requires exactly one Measurement Source Envelope. The envelope's `artifact_sha256` must equal the exact source digest already signed into the Path Observation Evidence statement.

The envelope also lists the complete evidence-ID set supported by that source. Missing or extra evidence references fail closed.

V0 intentionally rejects one source reference being shared across heterogeneous evidence kinds. A later version may define multi-claim source derivation explicitly; v0 does not infer it.

## Method identity

Every signed source envelope binds:

- `method_id`;
- `method_version`;
- `implementation_sha256`;
- `configuration_sha256`; and
- `environment_sha256`.

These fields make the source method reproducibly identifiable without claiming that the referenced implementation/configuration/environment bytes were independently fetched or reproduced.

Changing any method field after signing invalidates the source signature.

## Artifact boundary

The envelope binds metadata about the raw source artifact:

- content type;
- bounded byte length;
- retention status (`retained-local`, `retained-external`, or `not-retained`); and
- the SHA-256 already referenced by the Path Observation Evidence statement.

The raw artifact itself is **not embedded** in the v0 package. `raw_artifact_included` must remain `false`.

This keeps the provenance package bounded and reduces the chance that telemetry, identifiers, regulator records, or other sensitive source data are copied into a broad control-plane object.

## Normalized result and uncertainty

The envelope includes a digest of the normalized result rather than the full result body. The recorder classifies that normalized result as numeric, categorical, or structured.

Uncertainty is explicit. V0 accepts:

- `unknown`;
- `not-applicable`; or
- a bounded numeric `interval` with unit and optional confidence.

`unknown` and `not-applicable` cannot carry invented numeric bounds. Interval bounds must be finite and ordered.

The verifier does not reconstruct the normalized result from the raw artifact, so successful verification still reports `measurement_accuracy_established: false` and `truth_established: false`.

## Clock uncertainty and temporal laundering

A fresh signature over an old measurement must not become a fresh network fact merely because the signer used a recent `observed_at` timestamp.

V0 therefore requires the evaluator to supply complete external policies for every source kind:

1. maximum source age;
2. maximum source-to-claim lag; and
3. maximum accepted clock uncertainty.

There are no permissive built-in defaults.

The source envelope declares capture start/completion and a bounded clock uncertainty. Validation uses the uncertainty conservatively:

- if the latest possible completion is after evaluation time, the source fails as potentially future-dated;
- source freshness uses the earliest possible completion, preventing uncertainty from making a source appear younger;
- an evidence statement cannot predate the latest possible source completion; and
- source-to-claim lag uses the worst-case earlier completion time.

This closes the simple stale-source/fresh-signature laundering path while remaining explicit that the clock uncertainty itself is still a signed recorder assertion.

## Reproduction status is not reproduction proof

Each source envelope records one reproduction status:

- `not-attempted`;
- `attempted-failed`;
- `reported-reproduced`; or
- `not-applicable`.

V0 always requires `independent_reproduction_verified: false`.

A recorder may report that reproduction occurred, but this contract does not authenticate a second independent reproducer or recompute the source artifact. Successful verification therefore always reports `independent_reproduction_verified: false`.

A later layer can add independently signed reproduction evidence without changing the meaning of this v0 status field.

## What successful verification means

A successful `axiom-measurement-source-envelopes.v0` verification may truthfully say:

- the bound Path Observation Evidence package itself passed its externally configured signature/freshness checks;
- every evidence source reference had exactly one source envelope;
- every source envelope was signed by an externally trusted recorder holding the required role;
- source artifact digests matched the exact digests already signed into Path Observation Evidence;
- method/config/environment identities were cryptographically bound;
- source freshness, maximum claim lag, and clock-uncertainty ceilings passed the evaluator's policy; and
- the exact source verification policy and envelope set are digest-bound.

It does **not** establish:

- raw artifact accuracy;
- sensor calibration;
- regulator database correctness;
- attestation-verifier correctness;
- real failure-domain independence;
- the truth of an operator/manual assessment;
- independent reproduction of source bytes;
- legal authority outside the evaluator's configured trust policy;
- permission to forward traffic;
- permission to change a routing table or radio; or
- production capability status.

The machine-readable result therefore keeps:

- `independent_reproduction_verified: false`;
- `measurement_accuracy_established: false`;
- `truth_established: false`;
- `authority_effect: none`;
- `network_effect: none`;
- `runtime_activation: false`;
- `live_routing_changed: false`; and
- `radio_control_performed: false`.

## Threats covered in v0

The executable contract is intended to reject:

- source-recorder self-trust;
- source-recorder role confusion;
- evidence-verification substitution;
- path-portfolio substitution inherited from lower layers;
- source-artifact digest substitution;
- method/config/environment tampering after signature;
- missing or duplicate source coverage;
- source-to-evidence support-set substitution;
- heterogeneous evidence kinds hidden behind one v0 source reference;
- stale measurement laundering through a fresh signed claim;
- evidence timestamped before source capture was definitely complete;
- excessive source-to-claim lag;
- future-dated source data hidden inside clock uncertainty;
- clock-uncertainty claims broader than evaluator policy;
- raw artifact smuggling into the source package;
- malformed uncertainty intervals;
- reproduction-status laundering into verified reproduction; and
- source-package authority/network-effect laundering.

## Relationship to existing controls

Measurement Source Envelopes do not replace:

- Path Observation Evidence signer/role/freshness verification;
- Resilient Path Fabric structural/path-policy validation;
- admitted-node scheduling;
- online causal exchange;
- mTLS/identity controls;
- Gateway/Hypervisor authorization; or
- Grid evidence and continuity mechanisms.

They add a narrower provenance layer beneath signed path claims.

## Remaining research and promotion gates

Before source evidence could influence a live path-selection effect, later work should address at least:

1. actual telemetry/query adapters inside reviewed isolation boundaries;
2. raw artifact retention/privacy/redaction rules;
3. measurement-method schemas by source class;
4. sensor calibration and hardware identity where relevant;
5. regulator query receipts with jurisdiction/geography/time binding;
6. RATS/EAT-compatible attestation evidence lineage where appropriate;
7. independent reproduction/challenge evidence;
8. bitemporal source and claim semantics;
9. cross-node clock synchronization and uncertainty derivation;
10. contradiction/supersession/challenge procedures;
11. minimum-sufficient telemetry and control-plane load limits;
12. actual measurement-to-claim transformation verification;
13. bounded live adapters with fail-safe degradation behavior; and
14. a separately authorized network-effect path through normal AXIOM authority.

No item above becomes a capability merely because this document names it.
