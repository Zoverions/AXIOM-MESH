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

## Run

```bash
cargo fmt --manifest-path labs/personal-agent-kernel-rust/Cargo.toml --all -- --check
cargo clippy --manifest-path labs/personal-agent-kernel-rust/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path labs/personal-agent-kernel-rust/Cargo.toml --locked
```

See the vNext design specification under `docs/superpowers/specs` for promotion gates and the standards-backed adapter plan.
