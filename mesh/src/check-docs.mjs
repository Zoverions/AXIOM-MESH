import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MESH_ROOT } from './lib/config.mjs';
import { ValidationError } from './lib/canonical.mjs';
import {
  ACTIVE_SERVICE_NETWORK_POLICY,
  validateServiceNetworkPolicy
} from './lib/service-network-policy.mjs';
import { ACTIVE_GATEWAY_CLIENT_CONTRACT } from './lib/gateway-client-contract.mjs';

export const CANONICAL_DOCUMENTS = Object.freeze([
  'README.md',
  'SECURITY.md',
  '.github/SECURITY.md',
  'CONSTITUTION.md',
  'CONTRIBUTING.md',
  'docs/README.md',
  'docs/MASTER-TODO.md',
  'docs/MASTER-TODO-PLURAL-AUTHORITY.md',
  'docs/MASTER-TODO-AGENT-INTEROPERABILITY.md',
  'docs/ROADMAP.md',
  'docs/ROADMAP-EXTENSION-PLURAL-AUTHORITY.md',
  'docs/ROADMAP-EXTENSION-AGENT-INTEROPERABILITY.md',
  'docs/PRODUCTION-GRADE.md',
  'docs/PRODUCTION-READINESS-TRACKER.md',
  'docs/PROJECT-STATUS-2026.md',
  'docs/REPOSITORY-MIGRATION.md',
  'docs/architecture/SCALING-DISTRIBUTED-AUTHORITY-AND-CONSENSUS.md',
  'docs/audits/SCALABILITY-AUDIT-2026-07-30.md',
  'docs/audits/AUDIT-HARDENING-G5-G9-2026-08-10.md',
  'docs/audits/FULL-DEPTH-AUDIT-2026-08-10.md',
  'docs/rebuild/ADAPTIVE-ASSURANCE-AND-PLURAL-AUTHORITY.md',
  'docs/rebuild/LONG-HORIZON-CAPABILITY-MAP.md',
  'docs/rebuild/AGENT-INTEROPERABILITY-AND-CAPABILITY-SUBSTRATE.md',
  'docs/rebuild/AGENT-INTEROPERABILITY-CAPABILITY-MAP.md',
  'docs/rebuild/PRODUCT-DEFINITION.md',
  'docs/rebuild/REQUIREMENTS.md',
  'docs/rebuild/ROLLBACK.md',
  'docs/rebuild/SOURCE-TRACEABILITY.md',
  'docs/rebuild/STATUS.md',
  'docs/reviews/PLURAL-AUTHORITY-ARCHITECTURE-REVIEW-2026-08-03.md',
  'docs/reviews/AGENT-INTEROPERABILITY-ARCHITECTURE-REVIEW-2026-08-09.md',
  'docs/security/CREDENTIAL-HISTORY-REVOCATION.md',
  'docs/security/CURRENT-BUILD-THREAT-MODEL.md',
  'docs/security/DENY-EGRESS-BOUNDARY.md',
  'docs/security/INDEPENDENT-SECURITY-REVIEW.md',
  'docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md',
  'docs/operations/AUTOMATED-SOURCE-SETUP.md',
  'docs/operations/EXPLICIT-SERVICE-NETWORK-POLICY.md',
  'docs/operations/GATEWAY-CLIENT-CONTRACT.md',
  'docs/operations/AXIOM-ONE-LOCAL-PREVIEW.md',
  'docs/operations/EXTERNAL-TELEMETRY-AND-ALERTING.md',
  'docs/operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md',
  'docs/operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md',
  'docs/operations/INDEPENDENT-SERVICE-UNITS.md',
  'docs/operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md',
  'docs/operations/ONLINE-CAUSAL-EXCHANGE.md',
  'docs/operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md',
  'docs/operations/PILOT-DEPLOYMENT-DOSSIER.md',
  'docs/releases/0.12.0-dev.3.md',
  'docs/whitepapers_and_research/WHITEPAPER.md',
  'mesh/README.md',
  'mesh/PRODUCTION.md'
]);

const REQUIRED_CONTENT = Object.freeze({
  'README.md': [
    'mesh/config/capabilities.json',
    'docs/whitepapers_and_research/WHITEPAPER.md',
    'npm run setup'
  ],
  'CONTRIBUTING.md': [
    'npm run setup',
    'npm run setup:check',
    'search the supported tree for equivalent',
    'regression coverage for the class'
  ],
  'docs/README.md': [
    '## Canonical documents',
    '## Supported documentation boundary',
    'deprecated/pre-0.12-documentation-corpus',
    'ROADMAP-EXTENSION-PLURAL-AUTHORITY.md',
    'ROADMAP-EXTENSION-AGENT-INTEROPERABILITY.md'
  ],
  'docs/MASTER-TODO.md': ['## P0', '## Promotion rules'],
  'docs/MASTER-TODO-PLURAL-AUTHORITY.md': [
    '## Priority 0 — Protect current truth',
    '## Priority 6 — Circle identity and membership',
    '## Priority 12 — Jurisdiction taxonomy and public-law laboratory',
    '## Priority 18 — Required promotion artifacts',
    '## Completion rule'
  ],
  'docs/MASTER-TODO-AGENT-INTEROPERABILITY.md': [
    '## Priority 0 — Protect the current authority boundary',
    '## Priority 5 — Read-only MCP server laboratory',
    '## Priority 11 — A2A-compatible laboratory',
    '## Priority 17 — Required promotion artifacts',
    '## Completion rule'
  ],
  'docs/ROADMAP.md': ['## Promotion rules', '## Current Phase 2'],
  'docs/ROADMAP-EXTENSION-PLURAL-AUTHORITY.md': [
    '## Compatibility commitments effective immediately',
    '## Workstream B — Assurance model specification',
    '## Workstream C — Circle governance foundation',
    '## Workstream E — Jurisdictional and sovereign architecture laboratory',
    '## Workstream F — Sovereignty-preserving interoperability',
    '## Documentation and claims maintenance'
  ],
  'docs/ROADMAP-EXTENSION-AGENT-INTEROPERABILITY.md': [
    '## Compatibility commitments effective immediately',
    '## Workstream C — Machine principal and invocation semantics',
    '## Workstream E — MCP server laboratory',
    '## Workstream K — A2A-compatible discovery and task exchange',
    '## Documentation and claims maintenance',
    '## Current non-claims'
  ],
  'docs/PRODUCTION-GRADE.md': ['## Current readiness', '## Production promotion gates'],
  'docs/PRODUCTION-READINESS-TRACKER.md': ['## Current gate status', 'Not production-promoted'],
  'docs/PROJECT-STATUS-2026.md': ['## Current build', '## What is not claimed'],
  'docs/REPOSITORY-MIGRATION.md': ['## Provenance map', '## Credential boundary'],
  'docs/rebuild/ADAPTIVE-ASSURANCE-AND-PLURAL-AUTHORITY.md': [
    '## 1. Four dimensions that must remain separate',
    '## 3. Adaptive assurance profiles',
    '## 5. Retrospective reassessment',
    '## 6. Plural authority domains',
    '## 8. Sovereignty-preserving interoperability',
    '## 11. Non-waivable technical invariants',
    '## 17. Current claims and non-claims'
  ],
  'docs/rebuild/LONG-HORIZON-CAPABILITY-MAP.md': [
    '## Current authoritative surface',
    '## Layer 2 — Circles and voluntary collective governance',
    '## Layer 4 — Jurisdictional and sovereign domains',
    '## Layer 5 — Treaty and cross-sovereign interoperability',
    '## Cross-cutting capability requirements',
    '## Documentation update rule'
  ],
  'docs/rebuild/AGENT-INTEROPERABILITY-AND-CAPABILITY-SUBSTRATE.md': [
    '## 1. Agent runtimes are clients, not authorities',
    '## 2. Protocol-neutral core, standard-compatible edges',
    '## 3. AXIOM Invocation Envelope',
    '## 6. Skills and capsules',
    '## 12. Threat model additions',
    '## 14. Current non-claims'
  ],
  'docs/rebuild/AGENT-INTEROPERABILITY-CAPABILITY-MAP.md': [
    '## Layer B — Machine principals',
    '## Layer E — MCP server compatibility',
    '## Layer F — Skill and capsule interoperability',
    '## Layer K — A2A compatibility',
    '## Layer L — Authenticated remote execution',
    '## Current non-claims'
  ],
  'docs/rebuild/SOURCE-TRACEABILITY.md': [
    '## Current implementation trace',
    '## Archived source boundary'
  ],
  'docs/reviews/PLURAL-AUTHORITY-ARCHITECTURE-REVIEW-2026-08-03.md': [
    '## Executive finding',
    '## Load-bearing architectural decision',
    '## Review of Circles',
    '## Review of sovereign domains',
    '## Known open gap carried into this programme',
    '## Final assessment'
  ],
  'docs/reviews/AGENT-INTEROPERABILITY-ARCHITECTURE-REVIEW-2026-08-09.md': [
    '## Executive finding',
    '## Load-bearing architectural decision',
    '## Review of the legacy agent portfolio',
    '## Review of MCP compatibility',
    '## Review of ethics and policy',
    '## Final assessment'
  ],
  'docs/security/CREDENTIAL-HISTORY-REVOCATION.md': [
    '## Repository trust result',
    '## External attestation procedure'
  ],
  'docs/security/CURRENT-BUILD-THREAT-MODEL.md': [
    '## Supported system and trust boundary',
    '## Assets and security objectives',
    '## Threat analysis',
    '## Residual risk and non-claims'
  ],
  'docs/security/DENY-EGRESS-BOUNDARY.md': [
    '## Enforced topology',
    '## Protected CI proof'
  ],
  'docs/security/INDEPENDENT-SECURITY-REVIEW.md': [
    '## Review policy and trust model',
    '## Findings and disposition contract',
    '## Fail-closed verification',
    '## Conformance evidence and non-claims'
  ],
  'docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md': [
    '## Severity and activation',
    '## Signed evidence and CI gate',
    '## Residual limitations and pilot repetition'
  ],
  'docs/operations/AUTOMATED-SOURCE-SETUP.md': [
    '## Current-build setup boundary',
    '## One-command setup',
    '## Dependency and lifecycle policy',
    '## CI and production separation',
    '## Failure behavior and non-claims'
  ],
  'docs/operations/GATEWAY-CLIENT-CONTRACT.md': [
    '## Purpose and boundary',
    '## Current route inventory',
    '## Intent requests and idempotency',
    '## Cancellation, timeout, and response bounds',
    '## Error contract',
    '## Verification and compatibility changes',
    '## Non-claims and next application boundary'
  ],
  'docs/operations/AXIOM-ONE-LOCAL-PREVIEW.md': [
    '## Purpose and exact claim',
    '## Start and stop the local preview',
    '## Implemented surfaces',
    '## Browser and token boundary',
    '## Loopback proxy and response controls',
    '## Security headers and offline policy',
    '## Accessibility and responsive foundation',
    '## Verification, rollback, and failures',
    '## Remaining gates and non-claims'
  ],
  'docs/operations/EXPLICIT-SERVICE-NETWORK-POLICY.md': [
    '## Enforced policy boundary',
    '## Exact communication graph',
    '## Four-segment unit topology',
    '## Runtime and protected-CI proof',
    '## Operator verification and rollback',
    '## Pilot repetition and non-claims'
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
  'docs/operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md': [
    '## Trust and authority boundary',
    '## Request and response protocol',
    '## Signed conformance drill',
    '## Provider adapter conformance',
    '## Pilot repetition and non-claims'
  ],
  'docs/operations/PILOT-DEPLOYMENT-DOSSIER.md': [
    '## Current-build boundary',
    '## Trust and signature model',
    '## Required evidence inventory',
    '## Offline exact-inventory package verification',
    '### Exact v2 detail contracts',
    '## Fail-closed verification sequence',
    '## Conformance drill and protected CI',
    '## Pilot repetition and non-claims'
  ],
  'docs/releases/0.12.0-dev.3.md': [
    '## Version boundary',
    '## Current implementation',
    '## Validation',
    '## Non-claims',
    'npm run setup'
  ],
  'docs/whitepapers_and_research/WHITEPAPER.md': [
    '## Non-claims',
    '## Reproducibility',
    'npm run setup'
  ],
  'mesh/README.md': ['npm run setup', 'AUTOMATED-SOURCE-SETUP.md'],
  'mesh/PRODUCTION.md': [
    '## Automated source setup',
    'npm run network-policy:check',
    'not evidence of a live deployment'
  ]
});

const MINIMUM_LENGTH = Object.freeze({
  'docs/MASTER-TODO.md': 2_000,
  'docs/MASTER-TODO-PLURAL-AUTHORITY.md': 8_000,
  'docs/MASTER-TODO-AGENT-INTEROPERABILITY.md': 7_000,
  'docs/ROADMAP.md': 2_000,
  'docs/ROADMAP-EXTENSION-PLURAL-AUTHORITY.md': 8_000,
  'docs/ROADMAP-EXTENSION-AGENT-INTEROPERABILITY.md': 7_000,
  'docs/PRODUCTION-GRADE.md': 3_000,
  'docs/PROJECT-STATUS-2026.md': 1_500,
  'docs/rebuild/ADAPTIVE-ASSURANCE-AND-PLURAL-AUTHORITY.md': 10_000,
  'docs/rebuild/LONG-HORIZON-CAPABILITY-MAP.md': 8_000,
  'docs/rebuild/AGENT-INTEROPERABILITY-AND-CAPABILITY-SUBSTRATE.md': 9_000,
  'docs/rebuild/AGENT-INTEROPERABILITY-CAPABILITY-MAP.md': 7_000,
  'docs/reviews/PLURAL-AUTHORITY-ARCHITECTURE-REVIEW-2026-08-03.md': 7_000,
  'docs/reviews/AGENT-INTEROPERABILITY-ARCHITECTURE-REVIEW-2026-08-09.md': 7_000,
  'docs/security/CREDENTIAL-HISTORY-REVOCATION.md': 2_500,
  'docs/security/CURRENT-BUILD-THREAT-MODEL.md': 5_000,
  'docs/security/DENY-EGRESS-BOUNDARY.md': 2_500,
  'docs/security/INDEPENDENT-SECURITY-REVIEW.md': 5_000,
  'docs/security/INCIDENT-RESPONSE-AND-TABLETOP.md': 4_000,
  'docs/operations/AUTOMATED-SOURCE-SETUP.md': 5_000,
  'docs/operations/EXPLICIT-SERVICE-NETWORK-POLICY.md': 6_000,
  'docs/operations/GATEWAY-CLIENT-CONTRACT.md': 6_000,
  'docs/operations/AXIOM-ONE-LOCAL-PREVIEW.md': 9_000,
  'docs/operations/EXTERNAL-TELEMETRY-AND-ALERTING.md': 4_500,
  'docs/operations/REQUEST-PRESSURE-AND-DEPENDENCY-LOSS.md': 4_500,
  'docs/operations/MUTUALLY-AUTHENTICATED-TRANSPORT.md': 5_000,
  'docs/operations/INDEPENDENT-SERVICE-UNITS.md': 5_000,
  'docs/operations/ADMITTED-NODE-DISCOVERY-AND-SCHEDULING.md': 5_000,
  'docs/operations/ONLINE-CAUSAL-EXCHANGE.md': 6_000,
  'docs/operations/DEPLOYMENT-INDEPENDENT-PROVIDERS.md': 8_000,
  'docs/operations/PILOT-DEPLOYMENT-DOSSIER.md': 8_000,
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
  await verifyRepositoryMarkdownBoundary(repositoryRoot);
  await verifySupportedDocumentationBoundary(repositoryRoot);
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
  verifyComputedDocumentationClaims(contents);

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

function verifyComputedDocumentationClaims(contents) {
  const network = validateServiceNetworkPolicy(ACTIVE_SERVICE_NETWORK_POLICY);
  const gatewayRoutes = ACTIVE_GATEWAY_CLIENT_CONTRACT.routes.length;
  const claims = [
    ['README.md', `permits only ${network.routes} current internal`],
    ['docs/PRODUCTION-GRADE.md', `permits only ${network.routes} current internal`],
    ['mesh/PRODUCTION.md', `policy additionally authorizes only ${network.routes} exact caller/destination/method/route`],
    ['docs/rebuild/PRODUCT-DEFINITION.md', `authorizes only ${network.routes} exact caller`],
    ['docs/PROJECT-STATUS-2026.md', `default-deny ${network.routes}-route application`],
    ['docs/operations/GATEWAY-CLIENT-CONTRACT.md', `covers all ${gatewayRoutes} authenticated \`/v1/\` Gateway routes`],
    ['docs/PROJECT-STATUS-2026.md', `implemented for all ${gatewayRoutes} authenticated routes`]
  ];
  for (const [path, expected] of claims) {
    if (!contents.get(path)?.includes(expected)) {
      throw new ValidationError(
        `Canonical documentation numeric claim drifted: ${path} -> ${expected}`
      );
    }
  }
}

async function verifyRepositoryMarkdownBoundary(repositoryRoot) {
  const expected = CANONICAL_DOCUMENTS
    .filter(path => path.toLowerCase().endsWith('.md'))
    .sort();
  const actual = await repositoryMarkdownFiles(repositoryRoot);
  const unexpected = actual.filter(path => !expected.includes(path));
  const missing = expected.filter(path => !actual.includes(path));
  if (unexpected.length || missing.length) {
    throw new ValidationError(
      `Repository Markdown boundary drifted; unexpected=${unexpected.join(',') || 'none'}; missing=${missing.join(',') || 'none'}`
    );
  }
}

async function verifySupportedDocumentationBoundary(repositoryRoot) {
  const expected = CANONICAL_DOCUMENTS
    .filter(path => path.startsWith('docs/'))
    .sort();
  const actual = await documentationFiles(resolve(repositoryRoot, 'docs'));
  const unexpected = actual.filter(path => !expected.includes(path));
  const missing = expected.filter(path => !actual.includes(path));
  if (unexpected.length || missing.length) {
    throw new ValidationError(
      `Supported documentation boundary drifted; unexpected=${unexpected.join(',') || 'none'}; missing=${missing.join(',') || 'none'}`
    );
  }
}

export async function repositoryMarkdownFiles(directory, prefix = '') {
  const files = [];
  const excludedDirectories = new Set(['.git', '.data', 'node_modules']);
  const entries = await readdir(directory, { withFileTypes: true });
  if (prefix && entries.some(entry => entry.name === '.git')) return files;
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        files.push(...await repositoryMarkdownFiles(
          resolve(directory, entry.name),
          relativePath
        ));
      }
    } else if (entry.name.toLowerCase().endsWith('.md')) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function documentationFiles(directory, prefix = 'docs') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await documentationFiles(
        resolve(directory, entry.name),
        relativePath
      ));
    } else {
      files.push(relativePath);
    }
  }
  return files.sort();
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
