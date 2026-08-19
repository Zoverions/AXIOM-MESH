import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = dirname(HERE);

function normalizeOrigin(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('origin must use http or https');
  return url.href.replace(/\/$/, '');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function resolveAgentReadinessOutputRoot(repositoryRoot, outDir) {
  const root = resolve(repositoryRoot);
  const requested = outDir ?? '.data/agent-readiness-site';
  const outputRoot = resolve(root, requested);

  if (!isAbsolute(requested)) {
    const relativeOutput = relative(root, outputRoot);
    if (
      relativeOutput === '..'
      || relativeOutput.startsWith(`..${sep}`)
      || isAbsolute(relativeOutput)
    ) {
      throw new Error('relative agent-readiness output must remain inside the repository root');
    }
  }

  if (outputRoot === root) {
    throw new Error('agent-readiness output must not be the repository root');
  }
  if (outputRoot === parse(outputRoot).root) {
    throw new Error('agent-readiness output must not be a filesystem root');
  }
  return outputRoot;
}

async function writeText(root, relativePath, content) {
  const target = resolve(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function indexHtml({ origin, lastUpdated }) {
  const title = 'AXIOM-MESH — Agent Discovery Surface';
  const description = 'Machine-readable orientation for AXIOM-MESH: current claims, authority boundaries, canonical evidence, agent instructions, and the read-only AXIOM Authority Auditor skill.';
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    headline: title,
    description,
    url: `${origin}/`,
    dateModified: lastUpdated,
    isPartOf: {
      '@type': 'SoftwareSourceCode',
      name: 'AXIOM-MESH',
      codeRepository: 'https://github.com/Zoverions/AXIOM-MESH'
    }
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${origin}/">
<link rel="alternate" type="text/markdown" href="${origin}/index.md">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${origin}/">
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<header><p><a href="${origin}/">AXIOM-MESH</a></p></header>
<main>
<h1>AXIOM-MESH for AI agents and agent builders</h1>
<p><strong>Capability is not authority. Discovery is not permission. Connection is not permission.</strong></p>
<p>AXIOM-MESH is a local-first coordination, authority, and evidence substrate. The current supported build is <code>0.12.0-dev.3</code>, a <strong>production candidate, not production-promoted</strong>. This discovery surface is descriptive. Reading it, reaching the repository, finding a skill, or possessing credentials does not create permission.</p>
<h2>Authority path</h2>
<p>For supported privileged effects, the intended path is <code>Gateway -&gt; Hypervisor -&gt; Sandbox -&gt; Grid</code>. A runtime, adapter, protocol, tool, or discovered capability must not become a parallel authority system.</p>
<h2>Start with current truth</h2>
<ul>
<li><a href="https://github.com/Zoverions/AXIOM-MESH/blob/main/README.md">README and current build claims</a></li>
<li><a href="https://github.com/Zoverions/AXIOM-MESH/blob/main/AGENT-ENTRY.md">Agent entry point</a></li>
<li><a href="${origin}/AGENTS.md">Agent instructions</a></li>
<li><a href="https://github.com/Zoverions/AXIOM-MESH/blob/main/mesh/config/capabilities.json">Capability registry</a></li>
<li><a href="https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/security/CURRENT-BUILD-THREAT-MODEL.md">Current threat model</a></li>
<li><a href="https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/PRODUCTION-READINESS-TRACKER.md">Production readiness tracker</a></li>
</ul>
<h2>Portable authority audit</h2>
<p>The <a href="${origin}/.well-known/agent-skills/axiom-authority-auditor/SKILL.md">AXIOM Authority Auditor</a> is a self-contained, read-only Agent Skills-format procedure for separating capability from authority before consequential action. It does not execute actions, grant permission, replace policy, or certify a runtime.</p>
<h2>Important non-claims</h2>
<p>This page does not claim a live public AXIOM runtime, production promotion, completed independent security approval, production certification of external runtimes, a production MCP or A2A endpoint, BFT consensus, general remote execution, merge authority, or proof that signed evidence makes arbitrary external-world claims true.</p>
<h2>Terminology</h2>
<p>See the <a href="${origin}/glossary">glossary</a> for capability, authority, legitimacy, evidence, revocation, appeal, and meaningful exit.</p>
<h2>Machine-readable navigation</h2>
<ul>
<li><a href="${origin}/llms.txt">llms.txt</a></li>
<li><a href="${origin}/llms-full.txt">llms-full.txt</a></li>
<li><a href="${origin}/sitemap.md">sitemap.md</a></li>
<li><a href="${origin}/sitemap.xml">sitemap.xml</a></li>
<li><a href="${origin}/.well-known/agent-skills/index.json">Agent Skills discovery index</a></li>
<li><a href="${origin}/index.md">Markdown mirror of this page</a></li>
</ul>
<h2>Publication status</h2>
<p>The repository build artifact is <strong>prepared, not published</strong> until a separate deployment action is authorized and completed. A scanner score is diagnostic evidence about machine readability, not a security certification or authority grant.</p>
</main>
<footer><p>Last updated: ${escapeHtml(lastUpdated)}. Source: <a href="https://github.com/Zoverions/AXIOM-MESH">Zoverions/AXIOM-MESH</a>.</p></footer>
</body>
</html>`;
}

function indexMarkdown({ origin, lastUpdated }) {
  return `---
title: AXIOM-MESH Agent Discovery Surface
description: Machine-readable orientation for AXIOM-MESH current claims, authority boundaries, canonical evidence, agent instructions, and the read-only Authority Auditor skill.
last_updated: ${lastUpdated}
canonical: ${origin}/
---

# AXIOM-MESH for AI agents and agent builders

> **Capability is not authority. Discovery is not permission. Connection is not permission.**

AXIOM-MESH is a local-first coordination, authority, and evidence substrate. The current supported build is \`0.12.0-dev.3\`, a **production candidate, not production-promoted**.

For supported privileged effects, the intended path is \`Gateway -> Hypervisor -> Sandbox -> Grid\`. Discovery, reachability, protocol metadata, credentials, and technical capability do not enlarge an existing grant.

## Start with current truth

- [README](https://github.com/Zoverions/AXIOM-MESH/blob/main/README.md)
- [Agent entry](https://github.com/Zoverions/AXIOM-MESH/blob/main/AGENT-ENTRY.md)
- [Agent instructions](${origin}/AGENTS.md)
- [Capability registry](https://github.com/Zoverions/AXIOM-MESH/blob/main/mesh/config/capabilities.json)
- [Current threat model](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/security/CURRENT-BUILD-THREAT-MODEL.md)
- [Production readiness](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/PRODUCTION-READINESS-TRACKER.md)

## Portable authority audit

The [AXIOM Authority Auditor](${origin}/.well-known/agent-skills/axiom-authority-auditor/SKILL.md) is a self-contained read-only Agent Skills-format procedure. It does not execute actions, create authority, replace policy, or certify AXIOM-MESH.

## Non-claims

This surface does not claim a live public AXIOM runtime, production promotion, completed independent security approval, production certification of external runtimes, a production MCP/A2A endpoint, BFT consensus, general remote execution, merge authority, or arbitrary external-world truth from signed evidence.

## Glossary

See the [glossary](${origin}/glossary.md) for the core terms used by the authority model.

## Sitemap

See the full [sitemap](${origin}/sitemap.md), [llms.txt](${origin}/llms.txt), and [llms-full.txt](${origin}/llms-full.txt).

## Publication status

The generated surface is **prepared, not published** until a separate deployment action is authorized and completed. Scanner results are diagnostic evidence, not security certification.
`;
}

function glossaryHtml({ origin, lastUpdated }) {
  const title = 'AXIOM-MESH Glossary';
  const description = 'Definitions for the authority and governance terms used by the AXIOM-MESH agent discovery surface.';
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: title,
    description,
    url: `${origin}/glossary`,
    dateModified: lastUpdated
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${origin}/glossary">
<link rel="alternate" type="text/markdown" href="${origin}/glossary.md">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${origin}/glossary">
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<main>
<h1>AXIOM-MESH glossary</h1>
<h2>Capability</h2><p>What an actor or system can technically do. Capability does not itself establish permission.</p>
<h2>Authority</h2><p>The current basis on which a particular actor may perform a particular action for a particular purpose, scope, destination, and time.</p>
<h2>Legitimacy</h2><p>The separate question of whether an authorized action is defensible, fair, safe, or otherwise justified. Authority is not legitimacy.</p>
<h2>Discovery</h2><p>Learning that a resource, tool, service, agent, protocol capability, or credential exists. Discovery is not permission.</p>
<h2>Evidence</h2><p>A record that supports a claim about authorization, action, provenance, integrity, or state. Evidence does not automatically make every external-world assertion true.</p>
<h2>Revocation</h2><p>The ability to narrow or withdraw authority and have that change take effect in the relevant execution path.</p>
<h2>Appeal</h2><p>A route by which an affected party can challenge a consequential decision or action and obtain review.</p>
<h2>Meaningful exit</h2><p>The practical ability to leave a relationship or system without avoidable retaliation or losing the records, identity, property, credentials, continuity, or essential access needed to make exit real.</p>
<h2>Deny-dominant</h2><p>An authority posture in which a protective denial or missing required permission is not silently overridden by convenience, reachability, or a weaker fallback path.</p>
<h2>Grid</h2><p>The AXIOM-MESH layer that records durable state, evidence, approvals, consent, portability, and related governance records within the supported architecture.</p>
<p><a href="${origin}/">Return to the agent discovery surface</a>.</p>
</main>
</body>
</html>`;
}

function glossaryMarkdown({ origin, lastUpdated }) {
  return `---
title: AXIOM-MESH Glossary
description: Definitions for capability, authority, legitimacy, discovery, evidence, revocation, appeal, meaningful exit, deny-dominant policy, and Grid.
last_updated: ${lastUpdated}
canonical: ${origin}/glossary
---

# AXIOM-MESH glossary

## Capability

What an actor or system can technically do. Capability does not itself establish permission.

## Authority

The current basis on which a particular actor may perform a particular action for a particular purpose, scope, destination, and time.

## Legitimacy

The separate question of whether an authorized action is defensible, fair, safe, or otherwise justified. Authority is not legitimacy.

## Discovery

Learning that a resource, tool, service, agent, protocol capability, or credential exists. Discovery is not permission.

## Evidence

A record that supports a claim about authorization, action, provenance, integrity, or state. Evidence does not automatically make every external-world assertion true.

## Revocation

The ability to narrow or withdraw authority and have that change take effect in the relevant execution path.

## Appeal

A route by which an affected party can challenge a consequential decision or action and obtain review.

## Meaningful exit

The practical ability to leave a relationship or system without avoidable retaliation or losing the records, identity, property, credentials, continuity, or essential access needed to make exit real.

## Deny-dominant

An authority posture in which a protective denial or missing required permission is not silently overridden by convenience, reachability, or a weaker fallback path.

## Grid

The AXIOM-MESH layer that records durable state, evidence, approvals, consent, portability, and related governance records within the supported architecture.

## Sitemap

Return to the [agent discovery surface](${origin}/) or see the full [sitemap](${origin}/sitemap.md).
`;
}

function siteAgents({ origin }) {
  return `# AXIOM-MESH Agent Instructions

> **Capability is not authority. Discovery is not permission. Connection is not permission.**

This file tells coding agents and automated contributors how to approach AXIOM-MESH. It does not grant repository, runtime, deployment, merge, or production authority.

## Installation

From a trusted checkout of the repository, use:

\`\`\`bash
npm run setup
\`\`\`

Repository: https://github.com/Zoverions/AXIOM-MESH

## Configuration

Start from the tracked \`.env.example\` when local configuration is required. Do not infer authority from present credentials, reachable services, installed tools, or successful prior access.

The supported privileged-effect path is \`Gateway -> Hypervisor -> Sandbox -> Grid\`. Do not create a parallel authority path around it.

## Usage

Before consequential changes, read the [README](https://github.com/Zoverions/AXIOM-MESH/blob/main/README.md), [agent entry](https://github.com/Zoverions/AXIOM-MESH/blob/main/AGENT-ENTRY.md), [contribution rules](https://github.com/Zoverions/AXIOM-MESH/blob/main/CONTRIBUTING.md), [capability registry](https://github.com/Zoverions/AXIOM-MESH/blob/main/mesh/config/capabilities.json), and [current threat model](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/security/CURRENT-BUILD-THREAT-MODEL.md).

Validate supported changes with:

\`\`\`bash
npm run check
npm run release:verify
\`\`\`

For a read-only authority assessment, use the [AXIOM Authority Auditor](${origin}/.well-known/agent-skills/axiom-authority-auditor/SKILL.md).

## Authority boundary

A request to draft is not permission to merge. Repository write access is not deployment authority. Passing CI is not production promotion. Missing or stale authority for a consequential external effect must not be converted into permission.
`;
}

function siteLlms({ origin }) {
  return `# AXIOM-MESH

> AXIOM-MESH is a local-first coordination, authority, and evidence substrate. Current build: 0.12.0-dev.3, production candidate, not production-promoted. Capability is not authority; discovery and connection are not permission.

## Start here

- [Agent discovery surface](${origin}/): concise first-party orientation.
- [Markdown mirror](${origin}/index.md): text-first version of the same orientation.
- [Agent instructions](${origin}/AGENTS.md): installation, configuration, usage, and contribution authority.
- [Glossary](${origin}/glossary.md): core authority-model terminology.
- [Repository](https://github.com/Zoverions/AXIOM-MESH): canonical source repository.

## Current truth

- [README](https://github.com/Zoverions/AXIOM-MESH/blob/main/README.md): supported build and claims.
- [Capability registry](https://github.com/Zoverions/AXIOM-MESH/blob/main/mesh/config/capabilities.json): machine-readable capability state.
- [Threat model](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/security/CURRENT-BUILD-THREAT-MODEL.md): current trust boundary.
- [Production readiness](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/PRODUCTION-READINESS-TRACKER.md): promotion gates.

## Agent skills

- [Skill index](${origin}/.well-known/agent-skills/index.json): machine-readable Agent Skills discovery.
- [AXIOM Authority Auditor](${origin}/.well-known/agent-skills/axiom-authority-auditor/SKILL.md): read-only pre-action authority assessment.

## Falsification

- [Red-team challenge](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/community/RED-TEAM-CHALLENGE.md): repository-scoped adversarial review.
- [Security policy](https://github.com/Zoverions/AXIOM-MESH/blob/main/SECURITY.md): sensitive disclosure route.

## Optional

- [Expanded context](${origin}/llms-full.txt): larger machine-oriented context bundle.
- [Sitemap](${origin}/sitemap.md): structured discovery map.
`;
}

function siteSitemapMarkdown({ origin }) {
  return `# AXIOM-MESH Discovery Sitemap

> Machine- and human-readable map of the prepared AXIOM-MESH discovery surface. Discovery grants no authority.

## Orientation

- [Home](${origin}/)
- [Markdown mirror](${origin}/index.md)
- [Agent instructions](${origin}/AGENTS.md)
- [Glossary](${origin}/glossary.md)

## Machine discovery

- [llms.txt](${origin}/llms.txt)
- [llms-full.txt](${origin}/llms-full.txt)
- [Agent Skills index](${origin}/.well-known/agent-skills/index.json)
- [Authority Auditor skill](${origin}/.well-known/agent-skills/axiom-authority-auditor/SKILL.md)

## Canonical repository evidence

- [Repository](https://github.com/Zoverions/AXIOM-MESH)
- [Capability registry](https://github.com/Zoverions/AXIOM-MESH/blob/main/mesh/config/capabilities.json)
- [Threat model](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/security/CURRENT-BUILD-THREAT-MODEL.md)
- [Production readiness](https://github.com/Zoverions/AXIOM-MESH/blob/main/docs/PRODUCTION-READINESS-TRACKER.md)
`;
}

function sitemapXml({ origin, lastUpdated }) {
  const urls = ['/', '/index.md', '/glossary', '/glossary.md', '/AGENTS.md', '/llms.txt', '/llms-full.txt', '/sitemap.md', '/.well-known/agent-skills/index.json'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(path => `  <url><loc>${escapeHtml(`${origin}${path}`)}</loc><lastmod>${lastUpdated}</lastmod></url>`).join('\n')}
</urlset>`;
}

function standaloneSkill(skill, reference) {
  return `${skill.trim()}\n\n## Embedded portable reference\n\nThe public discovery artifact embeds the tracked reference below so this \`skill-md\` artifact is self-contained. The repository source remains canonical.\n\n${reference.trim()}\n`;
}

export async function buildAgentReadiness({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  outDir,
  origin
} = {}) {
  const config = JSON.parse(await readFile(resolve(repositoryRoot, 'agent-readiness/config.json'), 'utf8'));
  if (config.schema !== 'axiom-agent-readiness.v1') throw new Error('agent-readiness config schema is invalid');
  if (config.deployment_status !== 'prepared_not_published') throw new Error('agent-readiness deployment status is not fail-closed');
  const publicOrigin = normalizeOrigin(origin ?? config.default_origin);
  const outputRoot = resolveAgentReadinessOutputRoot(repositoryRoot, outDir);
  const [rootLlms, fullLlms, sourceSkill, sourceReference] = await Promise.all([
    readFile(resolve(repositoryRoot, 'llms.txt'), 'utf8'),
    readFile(resolve(repositoryRoot, 'llms-full.txt'), 'utf8'),
    readFile(resolve(repositoryRoot, 'agent-skills/axiom-authority-auditor/SKILL.md'), 'utf8'),
    readFile(resolve(repositoryRoot, 'agent-skills/axiom-authority-auditor/references/SOVEREIGN-AGENCY-TEST.md'), 'utf8')
  ]);
  const publishedSkill = standaloneSkill(sourceSkill, sourceReference);
  const digest = `sha256:${sha256(publishedSkill)}`;
  const skillIndex = {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [{
      name: 'axiom-authority-auditor',
      type: 'skill-md',
      description: 'Read-only pre-action authority assessment that separates technical capability from current permission, scope, purpose, consent, evidence, revocation, appeal, continuity/exit, and legitimacy.',
      url: '/.well-known/agent-skills/axiom-authority-auditor/SKILL.md',
      digest
    }]
  };

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    writeText(outputRoot, 'index.html', indexHtml({ origin: publicOrigin, lastUpdated: config.last_updated })),
    writeText(outputRoot, 'index.md', indexMarkdown({ origin: publicOrigin, lastUpdated: config.last_updated })),
    writeText(outputRoot, 'glossary/index.html', glossaryHtml({ origin: publicOrigin, lastUpdated: config.last_updated })),
    writeText(outputRoot, 'glossary.md', glossaryMarkdown({ origin: publicOrigin, lastUpdated: config.last_updated })),
    writeText(outputRoot, 'AGENTS.md', siteAgents({ origin: publicOrigin })),
    writeText(outputRoot, 'llms.txt', siteLlms({ origin: publicOrigin })),
    writeText(outputRoot, 'llms-full.txt', fullLlms),
    writeText(outputRoot, 'sitemap.md', siteSitemapMarkdown({ origin: publicOrigin })),
    writeText(outputRoot, 'sitemap.xml', sitemapXml({ origin: publicOrigin, lastUpdated: config.last_updated })),
    writeText(outputRoot, 'robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: ' + publicOrigin + '/sitemap.xml\n'),
    writeText(outputRoot, '.well-known/agent-skills/index.json', JSON.stringify(skillIndex, null, 2)),
    writeText(outputRoot, '.well-known/agent-skills/axiom-authority-auditor/SKILL.md', publishedSkill),
    writeText(outputRoot, '.nojekyll', ''),
    writeText(outputRoot, '_headers', `/*.md\n  Content-Type: text/markdown; charset=utf-8\n/index.md\n  Link: <${publicOrigin}/>; rel="canonical"\n/glossary.md\n  Link: <${publicOrigin}/glossary>; rel="canonical"\n/AGENTS.md\n  Link: <${publicOrigin}/AGENTS.md>; rel="canonical"\n/sitemap.md\n  Link: <${publicOrigin}/sitemap.md>; rel="canonical"\n/.well-known/agent-skills/*\n  Access-Control-Allow-Origin: *\n`)
  ]);

  return {
    schema: config.schema,
    deployment_status: config.deployment_status,
    origin: publicOrigin,
    output_dir: outputRoot,
    skill_digest: digest,
    generated_files: 14,
    source_llms_sha256: sha256(rootLlms),
    source_full_llms_sha256: sha256(fullLlms)
  };
}

async function main() {
  const args = process.argv.slice(2);
  let origin;
  let outDir;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--origin') origin = args[++index];
    else if (args[index] === '--out') outDir = args[++index];
    else throw new Error(`unknown argument: ${args[index]}`);
  }
  process.stdout.write(`${JSON.stringify(await buildAgentReadiness({ origin, outDir }))}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
