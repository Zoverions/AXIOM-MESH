# Plugin integrity quickcheck

Campaign: `ua-2026-09-19-plugin-integrity-quickcheck`

A pinned or requested dependency identity is not proof that the bytes which actually resolved are the reviewed artifact, and neither fact should mint execution authority by itself.

This drill exposes an existing AXIOM-MESH negative-fixture boundary for coding-agent plugin and software-supply-chain builders. It is intentionally source-level and inert: it does not install third-party plugins, fetch mutable remote content, grant authority, or claim to reproduce or patch Plugin4Shell.

## One command

Requirements: a supported Node.js runtime and Git.

```bash
git clone https://github.com/Zoverions/AXIOM-MESH.git && cd AXIOM-MESH && git checkout --detach adfda042832c741443ddf46f6f9e78363d5792a5 && node --test mesh/test/external-content-dependency-effect.test.mjs
```

The command is pinned to exact verified repository commit `adfda042832c741443ddf46f6f9e78363d5792a5` so reports do not silently follow moving `main`.

The existing fixture profile separates five planes:

1. external content;
2. dependency identity;
3. artifact provenance;
4. local authorization; and
5. consequential effect.

Its negative cases include mutable-tag retargeting, Git-reference substitution, container-tag substitution, remote bootstrap replacement, package/publisher takeover, and protocol switching. Every fixture is expected to deny consequential execution rather than allow content, names, signatures, or provenance evidence to become authority.

Relevant source artifacts:

- `agent-commons/external-content-dependency-effect-fixtures.v1.json`
- `mesh/test/external-content-dependency-effect.test.mjs`
- `docs/architecture/RUNTIME-AND-CONNECTOR-FABRIC.md`

## Falsification target

A useful result is not merely a passing test. Try to produce a minimal reproducible counterexample where one of these boundaries collapses, for example:

- a mutable or substituted reference is treated as immutable artifact evidence;
- a dependency name or publisher label is accepted as durable identity after ownership changes;
- signed external instructions become installation or execution authority;
- a protocol transition silently widens authority; or
- provenance evidence that should only describe an artifact causes a consequential effect to become eligible.

Report the exact commit SHA, the smallest safe fixture/request needed to reproduce the case, the expected failure plane, the observed result, and whether the result is repeatable. Do not include secrets, credentials, private repository contents, production tokens, or personal data.

Repository: https://github.com/Zoverions/AXIOM-MESH

Success for this experiment is a reproducible counterexample, a useful hostile fixture, a technically substantive issue/PR, or another attributable activation signal. Stars or views alone are not treated as verification or authority.
