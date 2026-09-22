// Deterministic verifier for the AXIOM One TWA *rehearsal* configuration.
// Checks twa-manifest.json for the rehearsal invariants: placeholder
// .invalid host, debug-only keystore path, empty DAL fingerprints, icons,
// shortcuts. No network access. Exit 0 = all checks pass, 1 = failure.
//
// Usage: node verify-twa-rehearsal.mjs [path/to/twa-manifest.json]
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifestPath = resolve(process.argv[2] ??
  join(dirname(fileURLToPath(import.meta.url)), 'twa-manifest.json'));

const failures = [];
const check = (name, ok, detail = '') => {
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

// 1. Placeholder host: RFC 2606 .invalid, can never resolve.
check('host is the .invalid rehearsal placeholder',
  manifest.host === 'axiom-one.twa-rehearsal.invalid', `host=${manifest.host}`);

// 2. Package id derived from the placeholder host, never a release id.
check('packageId is placeholder-derived',
  typeof manifest.packageId === 'string' &&
  manifest.packageId.startsWith('invalid.') &&
  manifest.packageId === 'invalid.twa_rehearsal.axiom_one.twa',
  `packageId=${manifest.packageId}`);

// 3. Debug-only signing key: relative path, git-ignored, never committed.
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

// 4. No Digital Asset Links fingerprints: nothing published, Zov-gated.
check('fingerprints is empty (no DAL publication claimed)',
  Array.isArray(manifest.fingerprints) && manifest.fingerprints.length === 0);

// 5. Icons: 512 any + 512 maskable, served from the placeholder origin.
check('512px any icon URL present',
  typeof manifest.iconUrl === 'string' &&
  manifest.iconUrl === 'https://axiom-one.twa-rehearsal.invalid/icons/icon-512.png',
  `iconUrl=${manifest.iconUrl}`);
check('512px maskable icon URL present',
  typeof manifest.maskableIconUrl === 'string' &&
  manifest.maskableIconUrl === 'https://axiom-one.twa-rehearsal.invalid/icons/icon-maskable-512.png',
  `maskableIconUrl=${manifest.maskableIconUrl}`);

// 6. Shortcuts carried over from the item-6 PWA manifest.
const shortcuts = manifest.shortcuts ?? [];
const byName = Object.fromEntries(shortcuts.map(s => [s.name, s]));
check('Local Social shortcut → /#social',
  byName['Local Social']?.url === '/#social', JSON.stringify(byName['Local Social']));
check('Vault shortcut → /#vault',
  byName['Vault']?.url === '/#vault', JSON.stringify(byName['Vault']));

// 7. TWA behavior: standalone, Custom Tab fallback (no verified origin).
check('startUrl is /', manifest.startUrl === '/');
check('display is standalone', manifest.display === 'standalone');
check('fallbackType is customtabs (no verified TWA without DAL)',
  manifest.fallbackType === 'customtabs');

console.log(failures.length === 0
  ? `\nOK: ${manifestPath} satisfies all rehearsal invariants.`
  : `\n${failures.length} CHECK(S) FAILED`);
process.exit(failures.length === 0 ? 0 : 1);
