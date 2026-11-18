import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const inputs = process.argv.slice(2);

function normalizeSection(raw) {
  const match = raw.match(/^\s*([^\s".]+)(?:(?:\s+"((?:\\.|[^"\\])*)")|(?:\.([^\s]+)))?\s*$/);
  if (!match) return null;
  const [, section, quotedSubsection, legacySubsection] = match;
  const subsection = quotedSubsection ?? legacySubsection ?? null;
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

function beginsShellAlias(rawValue) {
  const trimmed = rawValue.trim();
  return trimmed.startsWith('!') || /^"\s*!/.test(trimmed);
}

function stripUnquotedComment(text) {
  let inQuotes = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === '#' || ch === ';')) {
      return text.slice(0, i);
    }
  }
  return text;
}

function parseLeadingSectionHeader(trimmed) {
  if (!trimmed.startsWith('[')) return null;
  let inQuotes = false;
  let escaped = false;
  for (let i = 1; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === ']') {
      return {
        headerContent: trimmed.slice(1, i),
        remainder: trimmed.slice(i + 1)
      };
    }
  }
  return null;
}

function endsWithUnescapedBackslash(line) {
  let count = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function joinContinuedLines(rawLines) {
  const logicalLines = [];
  let index = 0;
  while (index < rawLines.length) {
    const startLine = index + 1;
    let combined = rawLines[index];
    while (endsWithUnescapedBackslash(combined) && index + 1 < rawLines.length) {
      combined = combined.slice(0, -1) + rawLines[index + 1];
      index += 1;
    }
    logicalLines.push({ lineNumber: startLine, text: combined });
    index += 1;
  }
  return logicalLines;
}

function evaluateAssignment(assignmentText, section, subsection, lineNumber, findings) {
  const cleanAssignment = stripUnquotedComment(assignmentText);
  const assignment = cleanAssignment.match(/^\s*([^=\s]+)\s*=\s*(.*)$/u);
  if (!assignment) return;

  const [, key, value] = assignment;
  let classification = classify(section, subsection, key);

  if (section === 'alias' && !subsection && beginsShellAlias(value)) {
    classification = { normalized_key: `alias.${key.toLowerCase()}`, risk_class: 'shell-alias' };
  }

  if (!classification) return;

  findings.push({
    line: lineNumber,
    key: classification.normalized_key,
    risk_class: classification.risk_class,
    value: 'REDACTED'
  });
}

function scanConfig(path, inputIndex) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    return {
      input_index: inputIndex,
      file_name: basename(path),
      readable: false,
      error: error?.code ?? 'READ_ERROR',
      findings: []
    };
  }

  let section = null;
  let subsection = null;
  const findings = [];
  const rawLines = text.split(/\r?\n/u);
  const logicalLines = joinContinuedLines(rawLines);

  for (const { lineNumber, text: line } of logicalLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    if (trimmed.startsWith('[')) {
      const header = parseLeadingSectionHeader(trimmed);
      if (!header) continue;
      const parsed = normalizeSection(header.headerContent);
      section = parsed?.section ?? null;
      subsection = parsed?.subsection ?? null;
      const remainder = stripUnquotedComment(header.remainder).trim();
      if (section && remainder) {
        evaluateAssignment(remainder, section, subsection, lineNumber, findings);
      }
      continue;
    }

    if (!section) continue;
    evaluateAssignment(line, section, subsection, lineNumber, findings);
  }

  return {
    input_index: inputIndex,
    file_name: basename(path),
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
  const files = inputs.map((input, inputIndex) => scanConfig(resolve(input), inputIndex));
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
