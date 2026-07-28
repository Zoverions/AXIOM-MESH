# Security Policy

## Supported Versions

AXIOM-MESH follows a rolling-release model for the default branch.

| Version/Branch | Supported |
| --- | --- |
| `Main` / latest clean-kernel release | ✅ |
| Older commits/tags | ⚠️ Best effort only |

## Reporting a Vulnerability

Please **do not** open public GitHub issues for suspected vulnerabilities.

Use one of the following private channels:

1. Open a **GitHub Security Advisory** draft for this repository.
2. If advisory flow is unavailable, contact maintainers through the project’s private coordination channel and include "SECURITY" in the subject.

When reporting, include:

- Affected clean-kernel component(s) (Gateway, Hypervisor, Sandbox, Grid, or release process)
- Reproduction steps or proof-of-concept
- Impact assessment (confidentiality, integrity, availability)
- Suggested fix or mitigation (if known)

## Response Targets

- Initial acknowledgement: **within 72 hours**
- Triage decision and severity assignment: **within 7 days**
- Coordinated remediation and disclosure timeline shared after triage

## Coordinated Disclosure

We follow coordinated disclosure:

- Report is validated privately
- Fix is prepared and reviewed
- Release notes are published with remediation guidance
- Credit is provided to reporters who want attribution

## Scope Priorities

Highest-priority findings include:

- Sandbox isolation escapes or container breakout paths
- Authentication/authorization bypass in Gateway or Hypervisor
- Ledger/governance tampering paths in Grid
- Authenticated-encryption, export/import, consent, memory, or accounting leaks
- Release-evidence or capability-registry claim bypasses

Out-of-scope (unless chained to real impact):

- Missing best-practice headers without exploit path
- Denial-of-service requiring unrealistic local-only privileges
- Vulnerabilities in unsupported historical commits
- Historical contracts, installers, containers, and archived workflows unless
  they can affect the supported `mesh/` runtime
