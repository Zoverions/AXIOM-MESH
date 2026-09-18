# MCP metadata should not become an authority plane

Campaign: `ua-2026-09-18-mcp-metadata-boundary`

Agent-security discussions are increasingly focused on MCP tool metadata, schema drift, tool poisoning, routing ambiguity, and the gap between discovering a tool and authorizing an effect.

AXIOM-MESH already has a bounded place to test that boundary: the Agent Commons MCP read-only laboratory.

This laboratory is intentionally narrow. It is an offline protocol projection over public AXIOM state. It has no network listener, no session state, no write-capable tools, no private Grid access, no machine-authority mapping, and no production MCP compatibility claim.

The point of this drill is not to claim that AXIOM-MESH solves arbitrary MCP security. The point is to make one security property falsifiable:

> MCP discovery, client metadata, protocol metadata, or a changed tool mapping must not silently become authority.

## Two-minute check

Requirements: a supported Node.js version from the repository root.

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git
cd AXIOM-MESH
npm run agent-commons:mcp-readonly:check
node --test mesh/test/agent-commons-mcp-readonly.test.mjs
```

The checker exercises the fixed public read-only projection. The focused test suite exercises the negative boundary cases.

## What the current laboratory enforces

The committed laboratory currently checks that:

- the manifest remains an offline, non-authorizing projection;
- transport, private-state, consequential-tool, machine-authority, compatibility, and protocol elevation are rejected;
- the tool map is exact rather than inferred from arbitrary remote metadata;
- `tools/list` is deterministic and exposes only fixed zero-argument read tools;
- self-reported client identity, claimed capabilities, reputation-like values, and prompt-like text cannot alter the tool result;
- protocol downgrade and routing-header disagreement fail closed;
- unknown tools and non-empty arguments are rejected before C0 dispatch;
- every accepted MCP read maps back to the corresponding direct C0 read-only method.

Relevant public artifacts:

- `agent-commons/mcp-readonly-lab.json`
- `mesh/src/lib/agent-commons-mcp-readonly.mjs`
- `mesh/test/agent-commons-mcp-readonly.test.mjs`

## Try to break the boundary

Useful counterexamples include any reproducible case where:

1. hostile or misleading metadata changes an authorized result;
2. a changed MCP tool mapping reaches a different C0 method without rejection;
3. a protocol/version/header mismatch is accepted ambiguously;
4. a supposedly read-only path reaches a consequential action;
5. client-supplied capability claims become permission;
6. discovery output can be mistaken for a production compatibility or authority claim.

A useful report contains:

- exact commit SHA;
- exact command or request frame;
- expected boundary;
- observed result;
- whether it reproduces;
- the smallest safe evidence needed to demonstrate it.

Do not include credentials, private data, production tokens, or secrets.

Repository: https://github.com/Zoverions/AXIOM-MESH

## Why this is an acquisition experiment

The previous broad unattended-agent trust drill produced no measurable activation at its initial checkpoint. This variant deliberately reduces setup and narrows the persona to MCP/security, local-agent, and self-hosted developers who already think in terms of tool-boundary failures.

Success is not raw reach. Success is one or more of:

- a reproducible boundary report;
- an external test result;
- a useful issue or pull request;
- a new contributor exercising the laboratory;
- a star/fork increase accompanied by technical interaction.

If this still produces visits without testing, the next experiment should make the negative case executable as a single disposable command rather than add more promotional copy.
