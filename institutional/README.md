# Institutional Composition

This directory contains experimental, domain-neutral building blocks for reusable institutional workflows.

## Files

- `primitives.v1.json` — stable mechanism vocabulary.
- `domain-projections.v1.json` — examples showing how multiple sectors reuse the same mechanisms.
- `institutional-composition-threat-model.v1.json` — authority, succession, recognition, privacy, and supply-chain threats.
- `pattern-adoption-lifecycle.v1.json` — explicit path from discovery to local adoption without ambient activation.
- `examples/` — inert reusable pattern packages for simulation and review.

## Core rule

A reusable pattern can carry structure, provenance, assumptions, constraints, and evidence obligations. It cannot carry institutional or runtime authority into a new deployment.

```text
discover
 -> inspect
 -> simulate
 -> adapt locally
 -> review / approve bounded use
 -> execute only through local authority
 -> retain evidence / challenge / review
```

## Intended reuse

The same primitives can support education, government administration, research, associations, businesses, care-like organizations, and machine/service organizations while preserving domain-specific law, policy, language, assurance, and human rights requirements.

## Non-claims

These artifacts do not constitute law, accreditation, certification, public authority, medical policy, institutional approval, or production promotion. They are reusable architecture and conformance materials.
