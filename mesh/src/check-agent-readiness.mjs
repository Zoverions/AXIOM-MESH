import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { MESH_ROOT } from './lib/config.mjs';
import { ValidationError } from './lib/canonical.mjs';
import { buildAgentReadiness } from '../../agent-readiness/build.mjs';

const REPOSITORY_ROOT = resolve(MESH_ROOT, '..');

function requireIncludes(content, fragments, label) {
  for (const fragment of fragments) {
    if (!content.includes(fragment)) {
      throw new ValidationError(`${label} is missing required content: ${fragment}`);
    }
  }
}

function countMatches(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function gitBlobSha1(value) {
  const body = Buffer.from(value, 'utf8');
  return createHash('sha1')
    .update(`blob ${body.length}\0`)
    .update(body)
    .digest('hex');
}

function parseJson(content, label) {
  try {
    return JSON.parse(content);
  } catch {
    throw new ValidationError(`${label} is not valid JSON`);
  }
}

async function mustNotExist(root, relativePath) {
  try {
    await stat(resolve(root, relativePath));
    throw new ValidationError(`Unsupported discovery declaration is present: ${relativePath}`);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
}

export async function verifyAgentReadiness(repositoryRoot = REPOSITORY_ROOT) {
  const [
    cursorRules,
    rootLlms,
    rootFullLlms,
    plan,
    configText,
    repositoryDiscoveryText,
    repositorySkillIndexText,
    authorityAuditorSkill
  ] = await Promise.all([
    readFile(resolve(repositoryRoot, '.cursorrules'), 'utf8'),
    readFile(resolve(repositoryRoot, 'llms.txt'), 'utf8'),
    readFile(resolve(repositoryRoot, 'llms-full.txt'), 'utf8'),
    readFile(resolve(repositoryRoot, 'agent-readiness/PLAN.txt'), 'utf8'),
    readFile(resolve(repositoryRoot, 'agent-readiness/config.json'), 'utf8'),
    readFile(resolve(repositoryRoot, 'agent-discovery.json'), 'utf8'),
    readFile(resolve(repositoryRoot, 'agent-skills/index.json'), 'utf8'),
    readFile(resolve(repositoryRoot, 'agent-skills/axiom-authority-auditor/SKILL.md'), 'utf8')
  ]);
  const config = parseJson(configText, 'Agent-readiness config');
  const repositoryDiscovery = parseJson(repositoryDiscoveryText, 'Repository discovery manifest');
  const repositorySkillIndex = parseJson(repositorySkillIndexText, 'Repository Agent Skills index');

  if (config.schema !== 'axiom-agent-readiness.v1') {
    throw new ValidationError('Agent-readiness config schema is invalid');
  }
  if (config.deployment_status !== 'prepared_not_published') {
    throw new ValidationError('Agent-readiness publication state must remain prepared_not_published');
  }
  if (config.target_agent_readability_score < 90 || config.target_llms_score !== 100) {
    throw new ValidationError('Agent-readiness promotion targets were weakened');
  }

  if (repositoryDiscovery.schema !== 'axiom-repository-discovery.v1') {
    throw new ValidationError('Repository discovery manifest schema is invalid');
  }
  if (repositoryDiscovery.status !== 'production_candidate_not_production_promoted') {
    throw new ValidationError('Repository discovery manifest overstates production status');
  }
  if (
    repositoryDiscovery.hosting?.repository_native_discovery_requires_external_hosting !== false
    || repositoryDiscovery.hosting?.separate_hosted_origin !== 'optional_prepared_not_published'
    || repositoryDiscovery.hosting?.publication_requires_explicit_authorization !== true
  ) {
    throw new ValidationError('Repository discovery hosting boundary drifted');
  }
  if (
    repositoryDiscovery.entrypoints?.agent_entry !== 'AGENT-ENTRY.md'
    || repositoryDiscovery.entrypoints?.llms !== 'llms.txt'
    || repositoryDiscovery.entrypoints?.agent_skills_index !== 'agent-skills/index.json'
  ) {
    throw new ValidationError('Repository discovery canonical entrypoints drifted');
  }
  if (
    repositoryDiscovery.protocols?.mcp_server_card !== 'not_published'
    || repositoryDiscovery.protocols?.a2a_agent_card !== 'not_published'
    || repositoryDiscovery.protocols?.public_openapi_endpoint !== 'not_published'
    || repositoryDiscovery.protocols?.remote_execution !== 'not_claimed'
  ) {
    throw new ValidationError('Repository discovery protocol non-claims drifted');
  }
  if (repositoryDiscovery.community?.red_team_issue !== 'https://github.com/Zoverions/AXIOM-MESH/issues/1185') {
    throw new ValidationError('Repository discovery red-team intake drifted');
  }

  if (repositorySkillIndex.schema !== 'axiom-agent-skills-index.v1') {
    throw new ValidationError('Repository Agent Skills index schema is invalid');
  }
  if (!Array.isArray(repositorySkillIndex.skills) || repositorySkillIndex.skills.length !== 1) {
    throw new ValidationError('Repository Agent Skills index must expose exactly the reviewed advisory skill');
  }
  const [repositorySkill] = repositorySkillIndex.skills;
  const expectedGitBlobSha = gitBlobSha1(authorityAuditorSkill);
  if (
    repositorySkill.name !== 'axiom-authority-auditor'
    || repositorySkill.type !== 'skill-md'
    || repositorySkill.path !== 'agent-skills/axiom-authority-auditor/SKILL.md'
    || repositorySkill.git_blob_sha !== expectedGitBlobSha
    || repositorySkill.read_only !== true
    || repositorySkill.executes_actions !== false
    || repositorySkill.grants_authority !== false
  ) {
    throw new ValidationError('Repository Agent Skills entry does not match the canonical advisory skill');
  }

  requireIncludes(cursorRules, [
    '## Installation',
    '## Configuration',
    '## Usage',
    'Capability is not authority',
    'Gateway -> Hypervisor -> Sandbox -> Grid',
    '## Repository-native discovery',
    'agent-discovery.json',
    'Building the surface does not publish or deploy it'
  ], 'Repository agent instructions');
  requireIncludes(rootLlms, [
    '# AXIOM-MESH',
    '> AXIOM-MESH is a local-first',
    '## Start here',
    '## Repository-native machine discovery',
    'agent-discovery.json',
    'agent-skills/index.json',
    'issues/1185',
    '## Architecture and current truth',
    '## Agent interoperability',
    '## Community and falsification',
    'agent-readiness/PLAN.txt'
  ], 'Root llms.txt');
  if (rootFullLlms.length < 5_000) {
    throw new ValidationError('Root llms-full.txt is unexpectedly small');
  }
  requireIncludes(rootFullLlms, [
    'Capability is not authority',
    'production candidate, not production-promoted',
    'Gateway -> Hypervisor -> Sandbox -> Grid',
    'prepared, not published'
  ], 'Root llms-full.txt');
  requireIncludes(plan, [
    'PURPOSE',
    'PREPARED STATIC DISCOVERY SURFACE',
    'DELIBERATE PROTOCOL NON-CLAIMS',
    'AGENT READY PROMOTION TARGET',
    'VALIDATION CONTRACT',
    'DEPLOYMENT BOUNDARY',
    'prepared, not published'
  ], 'Agent-readiness plan');

  const tempRoot = await mkdtemp(resolve(tmpdir(), 'axiom-agent-readiness-'));
  try {
    const result = await buildAgentReadiness({
      repositoryRoot,
      outDir: tempRoot,
      origin: 'https://agents.example.test/axiom'
    });
    if (result.deployment_status !== 'prepared_not_published') {
      throw new ValidationError('Generated discovery surface changed deployment status');
    }

    const [
      html,
      markdown,
      glossaryHtml,
      glossaryMarkdown,
      agents,
      llms,
      fullLlms,
      sitemapMarkdown,
      sitemapXml,
      robots,
      skillIndexText,
      publishedSkill,
      headers
    ] = await Promise.all([
      readFile(resolve(tempRoot, 'index.html'), 'utf8'),
      readFile(resolve(tempRoot, 'index.md'), 'utf8'),
      readFile(resolve(tempRoot, 'glossary/index.html'), 'utf8'),
      readFile(resolve(tempRoot, 'glossary.md'), 'utf8'),
      readFile(resolve(tempRoot, 'AGENTS.md'), 'utf8'),
      readFile(resolve(tempRoot, 'llms.txt'), 'utf8'),
      readFile(resolve(tempRoot, 'llms-full.txt'), 'utf8'),
      readFile(resolve(tempRoot, 'sitemap.md'), 'utf8'),
      readFile(resolve(tempRoot, 'sitemap.xml'), 'utf8'),
      readFile(resolve(tempRoot, 'robots.txt'), 'utf8'),
      readFile(resolve(tempRoot, '.well-known/agent-skills/index.json'), 'utf8'),
      readFile(resolve(tempRoot, '.well-known/agent-skills/axiom-authority-auditor/SKILL.md'), 'utf8'),
      readFile(resolve(tempRoot, '_headers'), 'utf8')
    ]);

    requireIncludes(html, [
      '<html lang="en">',
      '<meta name="description"',
      '<link rel="canonical"',
      '<link rel="alternate" type="text/markdown"',
      '<meta property="og:title"',
      '<meta property="og:description"',
      '<script type="application/ld+json">',
      '<main>',
      '/glossary',
      'prepared, not published'
    ], 'Generated index.html');
    if (countMatches(html, /<h1(?:\s|>)/g) !== 1) {
      throw new ValidationError('Generated index.html must contain exactly one h1');
    }
    if (html.includes('<form') || html.includes('tabindex="')) {
      throw new ValidationError('Generated index.html introduced unnecessary interactive complexity');
    }

    requireIncludes(markdown, [
      '---\ntitle:',
      'description:',
      'last_updated:',
      'canonical:',
      '# AXIOM-MESH for AI agents and agent builders',
      '## Sitemap'
    ], 'Generated index.md');
    requireIncludes(glossaryHtml, [
      '<html lang="en">',
      '<link rel="canonical"',
      '<link rel="alternate" type="text/markdown"',
      '<script type="application/ld+json">',
      '<main>',
      '<h1>AXIOM-MESH glossary</h1>'
    ], 'Generated glossary HTML');
    requireIncludes(glossaryMarkdown, [
      '---\ntitle:',
      'last_updated:',
      '# AXIOM-MESH glossary',
      '## Sitemap'
    ], 'Generated glossary Markdown');

    requireIncludes(agents, [
      '## Installation',
      '## Configuration',
      '## Usage',
      'Gateway -> Hypervisor -> Sandbox -> Grid'
    ], 'Generated AGENTS.md');
    requireIncludes(llms, [
      '# AXIOM-MESH',
      '> AXIOM-MESH is a local-first',
      '## Start here',
      '## Current truth',
      '## Agent skills',
      '## Falsification'
    ], 'Generated llms.txt');
    if (countMatches(llms, /^## /gm) < 4 || countMatches(llms, /\[[^\]]+\]\([^)]+\)/g) < 10) {
      throw new ValidationError('Generated llms.txt lacks structured discovery sections or links');
    }
    if (fullLlms.length < 5_000) {
      throw new ValidationError('Generated llms-full.txt is unexpectedly small');
    }
    requireIncludes(sitemapMarkdown, [
      '# AXIOM-MESH Discovery Sitemap',
      '## Orientation',
      '## Machine discovery',
      '## Canonical repository evidence'
    ], 'Generated sitemap.md');
    if (countMatches(sitemapMarkdown, /\[[^\]]+\]\([^)]+\)/g) < 8) {
      throw new ValidationError('Generated sitemap.md lacks structured links');
    }

    requireIncludes(sitemapXml, ['<urlset', '<loc>', '<lastmod>'], 'Generated sitemap.xml');
    if (countMatches(sitemapXml, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) < 5) {
      throw new ValidationError('Generated sitemap.xml lacks lastmod coverage');
    }
    requireIncludes(robots, ['User-agent: *', 'Allow: /', '/sitemap.xml'], 'Generated robots.txt');
    if (/Disallow:\s*\/(?:llms\.txt|\.well-known)/i.test(robots)) {
      throw new ValidationError('Generated robots.txt blocks machine discovery');
    }

    const skillIndex = parseJson(skillIndexText, 'Agent Skills discovery index');
    if (skillIndex.$schema !== 'https://schemas.agentskills.io/discovery/0.2.0/schema.json') {
      throw new ValidationError('Agent Skills discovery schema drifted');
    }
    if (!Array.isArray(skillIndex.skills) || skillIndex.skills.length !== 1) {
      throw new ValidationError('Agent Skills discovery index must expose exactly the reviewed advisory skill');
    }
    const [skill] = skillIndex.skills;
    if (
      skill.name !== 'axiom-authority-auditor'
      || skill.type !== 'skill-md'
      || skill.url !== '/.well-known/agent-skills/axiom-authority-auditor/SKILL.md'
    ) {
      throw new ValidationError('Agent Skills discovery entry is invalid');
    }
    const expectedDigest = `sha256:${sha256(publishedSkill)}`;
    if (skill.digest !== expectedDigest || result.skill_digest !== expectedDigest) {
      throw new ValidationError('Agent Skills discovery digest does not match the published skill artifact');
    }
    requireIncludes(publishedSkill, [
      'name: axiom-authority-auditor',
      'This skill is advisory only.',
      'do not create authority on their own',
      '## Embedded portable reference'
    ], 'Published Authority Auditor');
    requireIncludes(headers, [
      'Content-Type: text/markdown; charset=utf-8',
      '/index.md\n  Link: <https://agents.example.test/axiom/>; rel="canonical"',
      '/glossary.md\n  Link: <https://agents.example.test/axiom/glossary>; rel="canonical"',
      '/AGENTS.md\n  Link: <https://agents.example.test/axiom/AGENTS.md>; rel="canonical"',
      '/sitemap.md\n  Link: <https://agents.example.test/axiom/sitemap.md>; rel="canonical"',
      'Access-Control-Allow-Origin: *'
    ], 'Prepared static-host headers');
    if (headers.includes('/*.md\n  Content-Type: text/markdown; charset=utf-8\n  Link:')) {
      throw new ValidationError('Prepared static-host headers assign one canonical URL to every Markdown file');
    }
    if (countMatches(headers, /^\s+Link: /gm) !== 4) {
      throw new ValidationError('Prepared static-host headers canonical mapping drifted');
    }

    const unsupportedDeclarations = [
      '.well-known/mcp.json',
      '.well-known/agent-card.json',
      'agents.json',
      'agent-permissions.json',
      '.well-known/ucp',
      '.well-known/acp.json',
      '.well-known/oauth-authorization-server',
      '.well-known/api-catalog'
    ];
    for (const path of unsupportedDeclarations) await mustNotExist(tempRoot, path);

    return {
      valid: true,
      deployment_status: result.deployment_status,
      target_agent_readability_score: config.target_agent_readability_score,
      target_llms_score: config.target_llms_score,
      skill_digest: expectedDigest,
      repository_skill_git_blob_sha: expectedGitBlobSha,
      generated_files: result.generated_files
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  process.stdout.write(`${JSON.stringify(await verifyAgentReadiness())}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
