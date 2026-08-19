# Agent Readiness and Machine Discovery

## Purpose

This workstream prepares a first-party machine-readable discovery surface for AXIOM-MESH without turning discovery into authority and without claiming a live public deployment before one exists.

The design goal is straightforward: an AI agent should be able to determine what AXIOM-MESH is, what it currently claims, where the canonical evidence lives, which interfaces are real, and which capabilities are explicitly not promoted — without scraping framework-heavy pages or guessing from repository structure.

The core invariant remains:

> **Capability is not authority. Discovery is not permission. Connection is not permission.**

Machine-readable discovery improves legibility. It does not grant permission.

## Why this exists

Initial Agent Ready scans exposed three different classes of result:

1. GitHub-hosted repository pages score partly on GitHub's own HTML, metadata, accessibility, sitemap, and `llms.txt` behavior rather than AXIOM-MESH content alone.
2. Raw GitHub content is useful as a transport, but it is not a first-party site origin with controllable canonical metadata, content negotiation, structured data, or site-wide discovery endpoints.
3. Agent Community and its DMV certificate surface have their own platform-level strengths and weaknesses that AXIOM-MESH cannot directly correct.

The response is not to game those third-party scores. The response is to build an AXIOM-controlled discovery surface with explicit tests and then treat GitHub, Agent Community, and other networks as routes into that canonical surface.

## Current state

This workstream is **prepared, not published**.

The repository may contain source files and a build command for a static discovery bundle. Their presence does not imply that a public AXIOM-MESH website, API, MCP endpoint, A2A endpoint, remote execution service, or production deployment exists.

A public origin must not be described as live until it is actually deployed, independently reachable, rescanned, and recorded as such in the canonical repository state.

## Machine-facing repository files

The repository root exposes several low-complexity discovery artifacts:

- `AGENTS.md` — machine-facing installation, configuration, usage, and contribution-authority rules;
- `llms.txt` — concise LLM/crawler index;
- `llms-full.txt` — expanded text-first context bundle;
- `sitemap.md` — compact repository map;
- `AGENT-ENTRY.md` — architecture-focused agent entry point;
- `agent-skills/axiom-authority-auditor/SKILL.md` — read-only Agent Skills-format authority audit.

These are informational artifacts. None is an authorization token, policy grant, machine principal, credential, or production promotion.

## Prepared static discovery surface

The build step creates a small static site designed for agent readability rather than application interactivity. The generated bundle includes:

- semantic `index.html` with one `h1`, a `main` landmark, concise metadata, Open Graph fields, canonical URL, JSON-LD, and an alternate Markdown link;
- `index.md` with YAML frontmatter, explicit last-updated date, canonical link, and sitemap section;
- semantic glossary HTML plus a Markdown mirror;
- `AGENTS.md` with recognizable Installation, Configuration, and Usage sections;
- `llms.txt` and `llms-full.txt`;
- `sitemap.xml` with `lastmod` values;
- `sitemap.md` with headings and links;
- `robots.txt` that does not block the machine-readable discovery files;
- `/.well-known/agent-skills/index.json` containing the advisory Authority Auditor and a digest calculated from the actual tracked `SKILL.md`.

The build is deterministic with respect to the tracked source state and chosen public origin.

## Deliberate protocol non-claims

The discovery surface must not publish protocol cards simply to earn scanner points.

Until the implementation and promotion evidence support them, the generated bundle deliberately omits:

- MCP Server Card declarations;
- A2A Agent Card declarations;
- wildcard `agents.json` execution flows;
- `agent-permissions.json` permission declarations;
- UCP or ACP commerce profiles;
- OAuth authorization-server metadata;
- remote-execution discovery claims.

Absence is preferable to a false declaration.

The Agent Skills discovery index is different because the repository already contains a portable, read-only advisory skill and its scope is explicit. Advertising that file does not create runtime authority.

## OpenAPI boundary

AXIOM-MESH already has a versioned Gateway client contract, but this workstream does not synthesize a public OpenAPI document merely from route names. A future OpenAPI publication should be derived from the actual contract and request/response schemas, include the current local/non-public deployment status, and be covered by conformance checks before it is advertised as a discovery endpoint.

Until then, no public OpenAPI endpoint is claimed by this workstream.

## Accessibility and extraction targets

The first-party discovery surface should target:

- one clear `h1` per page;
- non-skipping heading hierarchy;
- a `main` landmark;
- text-first pages with low framework boilerplate;
- no unlabeled form controls;
- no hidden focusable controls;
- no unnecessary JavaScript dependency for primary content;
- canonical and alternate Markdown relationships;
- human-readable glossary links;
- consistent content between crawler and ordinary-user responses.

Because the static surface is intentionally simple, accessibility and machine extraction should reinforce each other rather than compete.

## Agent Ready promotion target

The intended promotion target for an AXIOM-controlled public origin is:

- Vercel/Agent Readability score: **90 or higher**;
- `llms.txt` score: **100**;
- accessibility score: **as close to 100 as practical, with no known critical failures**;
- no unsupported protocol claims added merely to increase the score.

A score is diagnostic evidence, not a security certification.

## Validation contract

The repository checker should fail if the prepared surface drifts in any of these ways:

- missing required discovery files;
- missing canonical, metadata, JSON-LD, alternate Markdown, `main`, or `h1` structure;
- missing Markdown frontmatter or sitemap section;
- sitemap entries without `lastmod`;
- missing Installation, Configuration, or Usage sections in `AGENTS.md`;
- `llms.txt` without the expected H1, blockquote summary, sections, or links;
- Agent Skills discovery digest no longer matching the tracked skill;
- unsupported MCP/A2A/commerce/permission discovery files appearing in the generated bundle;
- language that upgrades the prepared surface into a live-deployment claim.

## Deployment boundary

Building is not deployment.

The default build origin may identify an intended publication target, but that target remains a plan until a separate authorized deployment action occurs. Deployment should use a static host or equivalent publication layer that cannot become a privileged AXIOM runtime path.

The discovery site must not hold production secrets, user data, signing keys, provider credentials, mutable policy authority, or repository merge credentials.

If a future deployment mechanism is added to this repository, it should be reviewed as a separate effect-bearing surface rather than smuggled into documentation work.

## Third-party upstream findings

Platform-level Agent Ready findings for GitHub, raw GitHub content, Agent Community, or the DMV should be tracked separately from AXIOM-controlled findings.

Where a third-party project invites contributions, useful issues or patches may include:

- sitemap freshness and `lastmod` metadata;
- `sitemap.md` structure;
- `AGENTS.md` section completeness;
- A2A Agent Card schema conformance;
- canonical and Markdown-alternate relationships;
- content negotiation correctness;
- invalid `/.well-known/` JSON responses;
- accessibility landmarks and control labeling.

Those upstream fixes should not be represented as AXIOM-MESH implementation work unless AXIOM actually owns the affected surface.

## Promotion rule

The workstream is complete only when all of the following are true:

1. repository discovery artifacts are internally validated;
2. the static bundle builds deterministically;
3. the Agent Skills digest is bound to the tracked skill;
4. unsupported protocol declarations remain absent;
5. full AXIOM repository checks and release verification pass;
6. a public origin is separately authorized and deployed;
7. the deployed origin is rescanned;
8. scanner results and residual limitations are recorded without overstating what the score proves.

Until step 6, the correct public description is **prepared, not published**.
