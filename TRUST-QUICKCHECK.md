# AXIOM-MESH trust quickcheck

If you are evaluating a local or self-hosted AI-agent harness, start with one narrow question:

> Can client-supplied identity, capability, discovery, or routing metadata silently become authority?

AXIOM-MESH has an offline read-only MCP laboratory that is useful for falsifying that boundary. It has no network listener, no session state, no write-capable tools, no private Grid access, and no machine-authority mapping.

## Run it

This exact-commit command uses only Node's built-in test runner and repository source; it does not start AXIOM production services or grant external-effect authority.

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git && cd AXIOM-MESH && git checkout --detach 3af3d58f89b79a04bee39cf5c34da59c457f02ae && node --test mesh/test/agent-commons-mcp-readonly.test.mjs
```

The current test surface checks, among other things, that:

- self-reported client identity and capabilities cannot alter an accepted result or create authority;
- protocol downgrade and routing-metadata disagreement fail closed;
- unknown tools and unexpected arguments are rejected;
- discovery exposes only the fixed read-only tool map;
- accepted MCP reads remain data-parity equivalent to their direct read-only AXIOM methods.

A passing run is only a baseline for these source-level invariants. It is not a production MCP compatibility claim, a remote-attestation claim, or proof that another agent harness is secure.

## Why this is timely

OX Security's September 8, 2026 disclosure of CVE-2026-82533 described a local coding-agent harness that trusted caller-controlled request metadata strongly enough for a sandboxed agent to reach its own privileged control plane and disable confinement. That implementation has since been patched. The useful general lesson is narrower: **"local" is a deployment fact, not an authority credential.**

Source: https://www.ox.security/blog/cve-2026-82533-deepseek-harness-ai-agent-sandbox-escape/

Current agent-harness comparisons are also treating permissions, state, and recovery as first-class harness responsibilities rather than model features:

https://www.marktechpost.com/2026/09/18/best-open-source-agent-harnesses-for-local-llms-in-2026/

AXIOM-MESH does not claim integration with, compatibility with, or protection of DeepSeek Harness or the products in those comparisons. The external examples motivate the problem class; this quickcheck measures only the committed AXIOM boundary above.

## Falsify it

The useful result is not a star or a passing test. It is a reproducible counterexample.

Open a new issue using the **Authority boundary counterexample** form and include:

- exact commit SHA;
- exact command or request frame;
- expected boundary;
- observed result;
- reproducibility;
- the smallest safe evidence needed to demonstrate the failure.

Do not include credentials, private prompts, personal data, production tokens, or secrets.

Campaign: `ua-2026-09-19-harness-authority-onboarding`
