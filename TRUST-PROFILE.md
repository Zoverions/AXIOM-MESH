# Reproducible AXIOM trust profile

Agent builders and evaluators increasingly compare not only models, but the harness around them: tool routing, state, permissions, retries, evidence, and failure handling. That makes reproducibility part of the product surface.

AXIOM-MESH now exposes a small machine-readable trust profile that runs two already-implemented source-level invariants and emits a JSON result tied to the exact Git commit being tested.

## Run it

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git
cd AXIOM-MESH
npm run trust-profile
```

The command is offline and provider-free. It starts no AXIOM production service, performs no network or provider call, grants no authority, sends no telemetry, and does not inspect local credentials.

The current `axiom-trust-profile.v0` result covers only:

1. client-supplied metadata/discovery cannot silently become AXIOM authority; and
2. revoked or cancelled authority cannot survive through stale queued or retried work to produce an accepted effect.

The JSON includes the exact local Git commit when available, the two test paths, per-check pass/fail status, and explicit non-certification fields. It intentionally omits timestamps, hostnames, usernames, hardware identifiers, environment variables, file contents, and credential material so that sharing the result does not require publishing machine-specific data.

Example shape:

```json
{
  "schema": "axiom-trust-profile.v0",
  "source_ref": "<40-character Git commit>",
  "scope": "source-level-offline",
  "production_certification": false,
  "authority_granted": false,
  "telemetry_sent": false,
  "checks": [
    {
      "id": "metadata-authority-boundary",
      "status": "pass"
    },
    {
      "id": "revocation-outcome-boundary",
      "status": "pass"
    }
  ],
  "passed": true
}
```

## Why this experiment

Current agent evaluation work is moving toward pinned revisions, deterministic scoring, published traces, and reproducible harness-level evidence rather than model-name comparisons alone. Recent examples include the September 2026 empirical harness study *Scanning the Harness* and reproducible agent-framework benchmark projects such as BenchClaw.

- https://arxiv.org/abs/2609.07360
- https://benchclaw.io/

AXIOM-MESH does not claim this two-check profile is a general benchmark. The experiment asks a narrower question: **does a machine-readable, exact-commit evidence artifact make it easier for technical creators, researchers, and independent operators to run, compare, and report a trust-boundary result?**

## Report a result or counterexample

A passing profile is not production certification. If you can reproduce a non-sensitive boundary failure, use the repository's authority-boundary counterexample issue form or open a narrowly scoped pull request with the exact commit and test case.

Sensitive security findings belong in `SECURITY.md`; do not publish secrets, credentials, private data, weaponized exploit details, or information that would make a third-party system easier to attack.

Campaign reference: `ua-2026-09-21-reproducible-trust-profile`.
