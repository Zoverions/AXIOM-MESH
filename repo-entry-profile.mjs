import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const inputs = process.argv.slice(2);

function normalizeSection(raw) {
  const match = raw.match(/^\s*([^\s"]+)(?:\s+"([^"]+)")?\s*$/u);
  if (!match) return null;
  const [, section, subsection] = match;
  return {
    section: section.toLowerCase(),
    subsection: subsection ? subsection.toLowerCase() : null
  };
}

function classify(section, subsection, key) {
  const normalizedKey = key.toLowerCase();
  const full = subsection
    ? `${section}.*.${normalizedKey}`
    : `${section}.${normalizedKey}`;

  const exact = new Map([
    ['core.fsmonitor', 'automatic-helper'],
    ['core.hookspath', 'hook-redirection'],
    ['diff.external', 'external-command']
  ]);

  if (exact.has(full)) {
    return { normalized_key: full, risk_class: exact.get(full) };
  }

  if (section === 'filter' && subsection && ['clean', 'smudge', 'process'].includes(normalizedKey)) {
    return { normalized_key: `filter.*.${normalizedKey}`, risk_class: 'content-filter-command' };
  }

  if (section === 'diff' && subsection && normalizedKey === 'command') {
    return { normalized_key: 'diff.*.command', risk_class: 'external-command' };
  }

  if (section === 'merge' && subsection && normalizedKey === 'driver') {
    return { normalized_key: 'merge.*.driver', risk_class: 'merge-driver-command' };
  }

  return null;
}

function scanConfig(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    return {
      path,
      readable: false,
      error: error?.code ?? 'READ_ERROR',
      findings: []
    };
  }

  let section = null;
  let subsection = null;
  const findings = [];
  const lines = text.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/u);
    if (sectionMatch) {
      const parsed = normalizeSection(sectionMatch[1]);
      section = parsed?.section ?? null;
      subsection = parsed?.subsection ?? null;
      continue;
    }

    if (!section) continue;

    const assignment = line.match(/^\s*([^=\s]+)\s*=\s*(.*)$/u);
    if (!assignment) continue;

    const [, key, value] = assignment;
    let classification = classify(section, subsection, key);

    if (section === 'alias' && !subsection && value.trim().startsWith('!')) {
      classification = { normalized_key: `alias.${key.toLowerCase()}`, risk_class: 'shell-alias' };
    }

    if (!classification) continue;

    findings.push({
      line: index + 1,
      key: classification.normalized_key,
      risk_class: classification.risk_class,
      value: 'REDACTED'
    });
  }

  return {
    path,
    readable: true,
    error: null,
    findings
  };
}

if (inputs.length === 0) {
  const profile = {
    schema: 'axiom-repo-entry-profile.v0',
    scope: 'explicit-git-config-static-scan',
    production_certification: false,
    absence_proves_safety: false,
    network_access_required: false,
    telemetry_sent: false,
    authority_granted: false,
    files: [],
    finding_count: 0,
    passed: false,
    error: 'NO_INPUT'
  };
  process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
  process.exitCode = 1;
} else {
  const files = inputs.map((input) => scanConfig(resolve(input)));
  const findingCount = files.reduce((sum, file) => sum + file.findings.length, 0);
  const readable = files.every((file) => file.readable);

  const profile = {
    schema: 'axiom-repo-entry-profile.v0',
    scope: 'explicit-git-config-static-scan',
    production_certification: false,
    absence_proves_safety: false,
    network_access_required: false,
    telemetry_sent: false,
    authority_granted: false,
    files,
    finding_count: findingCount,
    passed: readable && findingCount === 0,
    error: readable ? null : 'INPUT_ERROR'
  };

  process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
  process.exitCode = readable ? (findingCount === 0 ? 0 : 2) : 1;
}
