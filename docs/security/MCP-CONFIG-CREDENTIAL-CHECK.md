# MCP configuration credential check

Public MCP configuration is a useful collaboration surface, but it can also turn standing credentials into source-controlled configuration by accident.

A September 2026 Hush Security study of roughly 82,000 public MCP configuration files reported that 12% of credential slots contained hardcoded credential literals, including many values without vendor-recognizable token shapes. The study also found cases where removing a secret from the current file did not remove it from Git history.

Source: https://www.hush.security/state-of-mcp/

AXIOM-MESH includes a deliberately narrow local check for this failure mode:

```bash
npm run mcp-config:credential-check -- .mcp.json
```

You can pass more than one explicit JSON configuration path:

```bash
npm run mcp-config:credential-check -- .mcp.json .cursor/mcp.json .vscode/mcp.json
```

## What it does

The checker walks only the JSON files you name and looks for literal string values in credential-named fields such as API keys, tokens, passwords, secrets, private keys, credentials, and authorization headers.

It treats common environment, input, and secret-manager references as references rather than literal credentials. Findings report only the file/location and the risk class. Credential values are always rendered as `REDACTED`.

Exit status:

- `0` — no hardcoded credential literal was found in the checked credential-named fields;
- `1` — a requested file could not be read or parsed as JSON;
- `2` — at least one hardcoded credential literal was found.

## What it does not do

This is not a complete secret scanner or a production security certification. It does not:

- recurse through your home directory or repository by default;
- inspect Git history;
- validate, transmit, or authenticate with a discovered credential;
- print credential values;
- contact MCP servers, providers, or external services;
- prove that an unflagged configuration is safe;
- grant, change, or infer AXIOM authority.

If a real credential was ever committed to source control, deleting it from the current file is not enough. Rotate or revoke it at the issuing provider and review the relevant repository history according to your incident-response policy.

The acquisition experiment using this tool is tracked as `ua-2026-09-21-mcp-config-credential-audit`. Public use and feedback are evidence, not authority.
