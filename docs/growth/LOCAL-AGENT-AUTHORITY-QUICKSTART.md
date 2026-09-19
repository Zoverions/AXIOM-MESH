# Local-agent authority quickstart

Campaign: `ua-2026-09-19-local-is-not-authority`

Local execution is useful for privacy and latency, but it does not by itself answer a different question: **what is the agent actually authorized to do?**

This quickstart gives local-agent, coding-agent, MCP, self-hosted, and security builders one bounded way to inspect that boundary in AXIOM-MESH without starting a production service or granting the test executable authority.

## Run the boundary check

Requirements: a current AXIOM-MESH checkout and the repository-supported Node.js toolchain.

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git && \
cd AXIOM-MESH && \
node --test mesh/test/agent-commons-mcp-readonly.test.mjs mesh/test/plural-capability-lease.test.mjs
```

The two test surfaces are deliberately narrow:

1. **MCP metadata is not authority.** The read-only MCP laboratory checks that discovery/client metadata, claimed capabilities, routing ambiguity, protocol mismatch, unknown tools, and non-empty arguments cannot silently enlarge the fixed read-only tool map or become permission.
2. **Approval evidence is not executable authority.** The plural-capability-lease candidate evaluator checks exact scope binding, threshold and distinct-domain requirements, expiry/currentness, duration ceilings, and hostile attempts to smuggle runtime activation or authority effects into a candidate. The evaluator is inert and still requires separate effect admission.

Relevant implementation and tests:

- `mesh/src/lib/agent-commons-mcp-readonly.mjs`
- `mesh/test/agent-commons-mcp-readonly.test.mjs`
- `mesh/src/lib/plural-capability-lease.mjs`
- `mesh/test/plural-capability-lease.test.mjs`

## A useful result

A passing run is only a baseline. The useful contribution is a reproducible counterexample showing that one of these boundaries accepts more authority than the documented contract permits.

Good targets include:

- client-supplied metadata changing an accepted MCP result or tool mapping;
- a routing/protocol disagreement being accepted rather than failing closed;
- claimed capabilities or reputation-like fields becoming permission;
- reuse of approval evidence against a different scope digest;
- duplicate or same-domain approvals satisfying an independence requirement;
- revoked, expired, unknown-currentness, or overlong approval evidence being accepted;
- any path that turns an inert candidate or read-only projection into runtime activation, a consequential effect, or capability promotion.

When reporting a counterexample, include the exact commit SHA, exact command or request frame, expected boundary, observed result, and the smallest safe evidence needed to reproduce it. Do not include secrets, credentials, personal data, household/camera data, or production tokens.

## Boundary of this experiment

This is a source-level falsification exercise. It does not claim production MCP compatibility, a live public deployment, smart-home integration, remote attestation, or permission to perform external effects. Installation, discovery, metadata, and model intent remain separate from execution authority.
