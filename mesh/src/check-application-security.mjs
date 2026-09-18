import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findCredentialCandidates } from './credential-history-audit.mjs';
import { validateApplicationSecurityProfile } from './lib/application-security-profile.mjs';
import { ValidationError } from './lib/canonical.mjs';
import { MESH_ROOT } from './lib/config.mjs';

const REPOSITORY_ROOT = dirname(MESH_ROOT);
const APPLICATIONS = Object.freeze([
  Object.freeze({
    id: 'axiom-one',
    profile: 'apps/axiom-one/security-profile.json',
    browser_assets: Object.freeze([
      'apps/axiom-one/index.html',
      'apps/axiom-one/app.mjs',
      'apps/axiom-one/presentation.mjs',
      'apps/axiom-one/sw.mjs',
      'apps/axiom-one/styles.css'
    ])
  })
]);

const FORBIDDEN_BROWSER_PATTERNS = Object.freeze([
  /document\.cookie/,
  /localStorage/,
  /sessionStorage/,
  /indexedDB/,
  /innerHTML/,
  /outerHTML/,
  /insertAdjacentHTML/,
  /https?:\/\//
]);

export function assertBrowserAssetSafe(
  content,
  path,
  { auditKey = randomBytes(32) } = {}
) {
  if (!Buffer.isBuffer(content)) {
    throw new ValidationError('Browser asset content must be a Buffer');
  }

  const candidates = findCredentialCandidates(content, path, auditKey);
  if (candidates.length > 0) {
    throw new ValidationError(
      `Browser-facing application asset contains a secret-like credential candidate: ${path}`
    );
  }

  const text = content.toString('utf8');
  if (FORBIDDEN_BROWSER_PATTERNS.some(pattern => pattern.test(text))) {
    throw new ValidationError(
      `Browser asset crosses the application browser security boundary: ${path}`
    );
  }
  return true;
}

export async function checkApplicationSecurity() {
  let scannedBrowserAssets = 0;
  let activeAdapters = 0;

  for (const application of APPLICATIONS) {
    const profile = JSON.parse(
      await readFile(join(REPOSITORY_ROOT, application.profile), 'utf8')
    );
    validateApplicationSecurityProfile(profile);
    if (profile.application_id !== application.id) {
      throw new ValidationError(
        `Application security profile id mismatch: ${application.profile}`
      );
    }

    activeAdapters += Object.values(profile.adapters).filter(Boolean).length;
    for (const asset of application.browser_assets) {
      const content = await readFile(join(REPOSITORY_ROOT, asset));
      assertBrowserAssetSafe(content, asset);
      scannedBrowserAssets += 1;
    }
  }

  return {
    valid: true,
    applications: APPLICATIONS.length,
    scanned_browser_assets: scannedBrowserAssets,
    active_adapters: activeAdapters
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await checkApplicationSecurity(), null, 2)}\n`);
}
