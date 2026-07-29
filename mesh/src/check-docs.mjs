import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MESH_ROOT } from './lib/config.mjs';
import { ValidationError } from './lib/canonical.mjs';

export const CANONICAL_DOCUMENTS = Object.freeze([
  'README.md',
  'SECURITY.md',
  '.github/SECURITY.md',
  'docs/README.md',
  'docs/MASTER-TODO.md',
  'docs/ROADMAP.md',
  'docs/PRODUCTION-GRADE.md',
  'docs/PRODUCTION-READINESS-TRACKER.md',
  'docs/PROJECT-STATUS-2026.md',
  'docs/REPOSITORY-MIGRATION.md',
  'docs/security/CREDENTIAL-HISTORY-REVOCATION.md',
  'docs/security/DENY-EGRESS-BOUNDARY.md',
  'docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md',
  'docs/operations/EXTERNAL-TELEMETRY-AND-ALERTING.md',
  'docs/operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md',
  'docs/operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md',
  'docs/operations/INDEPENDENT-SERVICE-UNITS.md',
  'docs/operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md',
  'docs/operations/ONLINE-CAUSAL-EXCHANGE.md',
  'docs/releases/0.11.0.md',
  'docs/whitepapers_and_research/WHITEPAPER.md',
  'mesh/PRODUCTION.md'
]);

const REQUIRED_CONTENT = Object.freeze({
  'README.md': [
    'mesh/config/capabilities.json',
    'docs/whitepapers_and_research/WHITEPAPER.md'
  ],
  'docs/README.md': ['## Canonical documents', '## Historical documents'],
  'docs/MASTER-TODO.md': ['## P0', '## Promotion rules'],
  'docs/ROADMAP.md': ['## Promotion rules', '## Phase 1'],
  'docs/PRODUCTION-GRADE.md': ['## Current readiness', '## Production promotion gates'],
  'docs/PRODUCTION-READINESS-TRACKER.md': ['## Current gate status', 'Not production-promoted'],
  'docs/PROJECT-STATUS-2026.md': ['## Current release', '## What is not claimed'],
  'docs/REPOSITORY-MIGRATION.md': ['## Provenance map', '## Credential boundary'],
  'docs/security/CREDENTIAL-HISTORY-REVOCATION.md': [
    '## Repository trust result',
    '## External attestation procedure'
  ],
  'docs/security/DENY-EGRESS-BOUNDARY.md': [
    '## Enforced topology',
    '## Protected CI proof'
  ],
  'docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md': [
    '## Severity and activation',
    '## Signed evidence and CI gate',
    '## Residual limitations and pilot repetition'
  ],
  'docs/operations/EXTERNAL-TELEMETRY-AND-ALERTING.md': [
    '## Enforced relay boundary',
    '## Queue, retry, and delivery audit',
    '## Pilot repetition and non-claims'
  ],
  'docs/operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md': [
    '## Enforced resilience profile',
    '## Dependency-loss and recovery sequence',
    '## Pilot repetition and non-claims'
  ],
  'docs/operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md': [
    '## Trust and peer-identity model',
    '## Offline leaf rotation',
    '## Pilot repetition and non-claims'
  ],
  'docs/operations/INDEPENDENT-SERVICE-UNITS.md': [
    '## Enforced unit and trust boundary',
    '## Failure-isolation and recovery sequence',
    '## Pilot repetition and non-claims'
  ],
  'docs/operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md': [
    '## Enforced admission and discovery boundary',
    '## Deterministic scheduling and resource leases',
    '## Pilot repetition and non-claims'
  ],
  'docs/operations/ONLINE-CAUSAL-EXCHANGE.md': [
    '## Trust and authority boundary',
    '## Consistency and conflict behavior',
    '## Signed partition/rejoin drill',
    '## Pilot repetition and non-claims'
  ],
  'docs/releases/0.11.0.md': ['## Container status', '## Security action'],
  'docs/whitepapers_and_research/WHITEPAPER.md': ['## Non-claims', '## Reproducibility'],
  'mesh/PRODUCTION.md': ['not evidence of a live deployment']
});

const MINIMUM_LENGTH = Object.freeze({
  'docs/MASTER-TODO.md': 2_000,
  'docs/ROADMAP.md': 2_000,
  'docs/PRODUCTION-GRADE.md': 3_000,
  'docs/PROJECT-STATUS-2026.md': 1_500,
  'docs/security/CREDENTIAL-HISTORY-REVOCATION.md': 2_500,
  'docs/security/DENY-EGRESS-BOUNDARY.md': 2_500,
  'docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md': 4_000,
  'docs/operations/EXTERNAL-TELEMETRY-AND-ALERTING.md': 4_500,
  'docs/operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md': 4_500,
  'docs/operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md': 5_000,
  'docs/operations/INDEPENDENT-SERVICE-UNITS.md': 5_000,
  'docs/operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md': 5_000,
  'docs/operations/ONLINE-CAUSAL-EXCHANGE.md': 6_000,
  'docs/whitepapers_and_research/WHITEPAPER.md': 7_000
});

export function markdownLocalTargets(markdown) {
  const targets = [];
  const pattern = /!?\[[^\]]*]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const raw = match[1].trim().replace(/^<|>$/g, '');
    if (
      !raw
      || raw.startsWith('#')
      || /^[a-z][a-z0-9+.-]*:/i.test(raw)
    ) continue;
    const withoutAnchor = raw.split('#', 1)[0].split('?', 1)[0];
    if (withoutAnchor) targets.push(decodeURIComponent(withoutAnchor));
  }
  return targets;
}

export async function verifyCanonicalDocumentation(repositoryRoot = dirname(MESH_ROOT)) {
  const contents = new Map();
  for (const relativePath of CANONICAL_DOCUMENTS) {
    const fullPath = resolve(repositoryRoot, relativePath);
    let content;
    try {
      content = await readFile(fullPath, 'utf8');
    } catch {
      throw new ValidationError(`Canonical documentation is missing: ${relativePath}`);
    }
    contents.set(relativePath, content);
    if (content.length < (MINIMUM_LENGTH[relativePath] ?? 200)) {
      throw new ValidationError(`Canonical documentation is incomplete: ${relativePath}`);
    }
    for (const required of REQUIRED_CONTENT[relativePath] ?? []) {
      if (!content.includes(required)) {
        throw new ValidationError(
          `Canonical documentation ${relativePath} is missing required content: ${required}`
        );
      }
    }
  }

  if (normalize(contents.get('SECURITY.md')) !== normalize(contents.get('.github/SECURITY.md'))) {
    throw new ValidationError('Root and GitHub security policies have drifted');
  }

  let checkedLinks = 0;
  for (const [relativePath, content] of contents) {
    const documentDirectory = dirname(resolve(repositoryRoot, relativePath));
    for (const target of markdownLocalTargets(content)) {
      const resolvedTarget = resolve(documentDirectory, target);
      if (!isWithin(repositoryRoot, resolvedTarget)) {
        throw new ValidationError(
          `Canonical documentation link escapes the repository: ${relativePath} -> ${target}`
        );
      }
      try {
        await stat(resolvedTarget);
      } catch {
        throw new ValidationError(
          `Canonical documentation link is broken: ${relativePath} -> ${target}`
        );
      }
      checkedLinks += 1;
    }
  }

  return {
    valid: true,
    documents: CANONICAL_DOCUMENTS.length,
    links: checkedLinks
  };
}

function normalize(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function isWithin(repositoryRoot, target) {
  const root = resolve(repositoryRoot);
  const relative = target.slice(root.length);
  return target === root || (
    target.startsWith(root)
    && (relative.startsWith('/') || relative.startsWith('\\'))
  );
}

async function main() {
  process.stdout.write(`${JSON.stringify(await verifyCanonicalDocumentation())}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
