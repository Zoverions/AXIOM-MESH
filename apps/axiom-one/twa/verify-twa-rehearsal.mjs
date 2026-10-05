// Deterministic verifier for the AXIOM One TWA *rehearsal* configuration.
// Checks twa-manifest.json for rehearsal invariants only. No network access.
// Exit 0 = all checks pass, 1 = failure.
//
// Usage: node verify-twa-rehearsal.mjs [path/to/twa-manifest.json]
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifestPath = resolve(process.argv[2] ??
  join(dirname(fileURLToPath(import.meta.url)), 'twa-manifest.json'));

const failures = [];
let checksRun = 0;
const check = (name, ok, detail = '') => {
  checksRun += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error(`FAIL  manifest parses as JSON — ${e.message}`);
  process.exit(1);
}

// 1. Placeholder identity: RFC 2606 .invalid, never a production origin.
check('host is the .invalid rehearsal placeholder',
  manifest.host === 'axiom-one.twa-rehearsal.invalid', `host=${manifest.host}`);
check('packageId is placeholder-derived',
  typeof manifest.packageId === 'string' &&
  manifest.packageId.startsWith('invalid.') &&
  manifest.packageId === 'invalid.twa_rehearsal.axiom_one.twa',
  `packageId=${manifest.packageId}`);

// 2. Debug-only signing key: relative path, git-ignored, never committed.
check('signingKey points at the throwaway debug keystore',
  manifest.signingKey?.path === './twa-debug.keystore' &&
  manifest.signingKey?.alias === 'axiomone-rehearsal-debug',
  `path=${manifest.signingKey?.path} alias=${manifest.signingKey?.alias}`);
const here = dirname(manifestPath);
check('debug keystore file is absent from the repo (git-ignored)',
  !existsSync(join(here, 'twa-debug.keystore')));
check('.gitignore excludes keystores',
  existsSync(join(here, '.gitignore')) &&
  readFileSync(join(here, '.gitignore'), 'utf8').split('\n')
    .some(l => l.trim() === '*.keystore'));

// 3. No origin expansion or notification permission in the rehearsal.
check('fingerprints is empty (no DAL publication claimed)',
  Array.isArray(manifest.fingerprints) && manifest.fingerprints.length === 0);
check('additionalTrustedOrigins is empty',
  Array.isArray(manifest.additionalTrustedOrigins) &&
  manifest.additionalTrustedOrigins.length === 0);
check('notifications are disabled for the rehearsal',
  manifest.enableNotifications === false);

// 4. Icons remain bound to the placeholder origin.
check('512px any icon URL present',
  typeof manifest.iconUrl === 'string' &&
  manifest.iconUrl === 'https://axiom-one.twa-rehearsal.invalid/icons/icon-512.png',
  `iconUrl=${manifest.iconUrl}`);
check('512px maskable icon URL present',
  typeof manifest.maskableIconUrl === 'string' &&
  manifest.maskableIconUrl === 'https://axiom-one.twa-rehearsal.invalid/icons/icon-maskable-512.png',
  `maskableIconUrl=${manifest.maskableIconUrl}`);

// 5. Exactly the two reviewed shortcuts are present, with distinct names.
const shortcuts = manifest.shortcuts ?? [];
const shortcutNames = shortcuts.map(s => s?.name);
check('exactly two shortcuts are present',
  Array.isArray(shortcuts) && shortcuts.length === 2,
  `count=${Array.isArray(shortcuts) ? shortcuts.length : 'not-array'}`);
check('shortcut names are distinct',
  shortcutNames.length === new Set(shortcutNames).size,
  JSON.stringify(shortcutNames));
const byName = Object.fromEntries(shortcuts.map(s => [s.name, s]));
check('Local Social shortcut → /#social',
  byName['Local Social']?.url === '/#social', JSON.stringify(byName['Local Social']));
check('Vault shortcut → /#vault',
  byName['Vault']?.url === '/#vault', JSON.stringify(byName['Vault']));

// 6. TWA behavior remains non-production and unverified-origin safe.
check('startUrl is /', manifest.startUrl === '/');
check('display is standalone', manifest.display === 'standalone');
check('fallbackType is customtabs (no verified TWA without DAL)',
  manifest.fallbackType === 'customtabs');

console.log(failures.length === 0
  ? `\nOK: ${checksRun} checks passed; ${manifestPath} satisfies all rehearsal invariants.`
  : `\n${failures.length} of ${checksRun} CHECK(S) FAILED`);
process.exit(failures.length === 0 ? 0 : 1);
