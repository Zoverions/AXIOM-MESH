# Personal Agent Kernel Rust vNext Laboratory

This laboratory is the Rust-first end-to-end execution model for the Personal Agent Kernel.

It is deliberately stacked on Personal Agent Kernel v0 (PR #1669) and is not a production authority path.

## What this vertical proves

The Rust kernel models one complete bounded lifecycle:

1. compile an owner-bound plan DAG;
2. enforce earned-autonomy ceilings and aggregate authority budgets;
3. require shadow/reversibility evidence before effect requests;
4. build exact Mesh authority requests;
5. accept only exact, fresh Mesh proof bindings;
6. invoke a typed effect port only after that proof;
7. bind returned effect receipts back to the authorized plan node;
8. permit derived memory only when receipt/provenance rules are met;
9. attenuate child delegation without sibling budget recombination;
10. export and restore continuity without carrying active authority.

## Non-claims

- No production Gateway, Hypervisor, Sandbox, Grid, vault, credential, provider, or network path calls this crate.
- The crate does not verify cryptographic signatures. A production adapter must import verified Mesh evidence from the existing authority path.
- It does not mint authority.
- It does not make memory authoritative.
- It does not self-promote autonomy.
- It does not persist user data.
- It does not replace the current Node authority implementation.

The source forbids unsafe Rust and has no third-party dependencies.

## Trust split

The semantic core remains standard-library-only. Cryptography and component execution are isolated in sibling laboratories:

- `../personal-agent-kernel-rust-crypto` — strict AXIOM-compatible Ed25519 verification and typed proof conversion;
- `../personal-agent-kernel-wasmtime-host` — real Wasmtime Component Model import denial and explicit host linking;
- `../personal-agent-kernel-offline-journal` — hash-chained, durable, single-writer local consumption state for restart-safe offline envelopes.

None of the sibling laboratories is imported by the supported Mesh runtime. The offline journal establishes local single-writer restart safety only; it does not claim cross-device global single-spend.

## Current evidence

The lab now includes:

- a shared Node/Rust policy-conformance corpus with exact blocker matching;
- a strict component-host assessment that denies ambient WASI capabilities by default;
- an inert exact Mesh-adapter request contract;
- Mesh-witnessed receipts and single-spend handoff proposals;
- pre-issued offline envelopes with monotonic local consumption and reconciliation;
- attestation-aware placement filtering that never grants effect authority.

Offline-envelope replay protection is process-local in this stage. Crash-safe or cross-device single-spend remains a named production-promotion gate.

## Run

```bash
cargo fmt --manifest-path labs/personal-agent-kernel-rust/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/personal-agent-kernel-rust/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/personal-agent-kernel-rust/Cargo.toml --locked
```

See the vNext design specification under `docs/superpowers/specs` for promotion gates and the standards-backed adapter plan.
