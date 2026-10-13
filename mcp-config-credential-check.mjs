#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const CREDENTIAL_KEY = /(^|[_-])(api[_-]?key|token|secret|password|passwd|credential|private[_-]?key)($|[_-])/i;
const AUTHORIZATION_KEY = /^(authorization|proxy-authorization|auth)$/i;
const PLACEHOLDER = /^(?:<[^>]+>|REPLACE[_-]?ME|CHANGE[_-]?ME|YOUR[_-][A-Z0-9_-]+|NONE|NULL)$/i;
const CLI_FLAG_ASSIGNMENT = /^--?([A-Za-z0-9_-]+)=(.+)$/s;
const CLI_FLAG_ONLY = /^--?([A-Za-z0-9_-]+)$/;
const HEADER_STRING = /^(authorization|proxy-authorization)\s*:\s*(.+)$/is;

function normalizedKey(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2');
}

function isCredentialKey(key) {
  const normalized = normalizedKey(key);
  return AUTHORIZATION_KEY.test(normalized) || CREDENTIAL_KEY.test(normalized);
}

function isSafeReference(value) {
  const trimmed = value.trim();
  if (trimmed === '' || PLACEHOLDER.test(trimmed)) return true;
  if (/^\$\{(?:env:)?[A-Za-z_][A-Za-z0-9_]*\}$/.test(trimmed)) return true;
  if (/^\$\{input:[^}]+\}$/.test(trimmed)) return true;
  if (/^(?:op|vault):\/\/.+$/i.test(trimmed)) return true;
  if (/^(?:Bearer|Basic)\s+\$\{(?:(?:env:)?[A-Za-z_][A-Za-z0-9_]*|input:[^}]+)\}$/i.test(trimmed)) return true;
  if (/^(?:Bearer|Basic)\s+(?:op|vault):\/\/.+$/i.test(trimmed)) return true;
  return false;
}

function inspectArrayElement(value, index, path) {
  const findings = [];
  const item = value[index];
  if (typeof item !== 'string') return { findings, consumedNext: false };

  const flagAssign = item.match(CLI_FLAG_ASSIGNMENT);
  if (flagAssign) {
    const [, flagName, flagValue] = flagAssign;
    if (isCredentialKey(flagName)) {
      if (!isSafeReference(flagValue)) {
        findings.push({
          location: [...path, String(index)].join('.'),
          key: flagName,
          risk: 'hardcoded-credential-literal'
        });
      }
      return { findings, consumedNext: false };
    }
    const assignedHeader = flagValue.match(HEADER_STRING);
    if (assignedHeader) {
      const [, headerName, headerValue] = assignedHeader;
      if (!isSafeReference(headerValue)) {
        findings.push({
          location: [...path, String(index)].join('.'),
          key: headerName,
          risk: 'hardcoded-credential-literal'
        });
      }
      return { findings, consumedNext: false };
    }
    return { findings, consumedNext: false };
  }

  const headerMatch = item.match(HEADER_STRING);
  if (headerMatch) {
    const [, headerName, headerValue] = headerMatch;
    if (!isSafeReference(headerValue)) {
      findings.push({
        location: [...path, String(index)].join('.'),
        key: headerName,
        risk: 'hardcoded-credential-literal'
      });
    }
    return { findings, consumedNext: false };
  }

  const flagOnly = item.match(CLI_FLAG_ONLY);
  if (
    flagOnly
    && isCredentialKey(flagOnly[1])
    && index + 1 < value.length
    && typeof value[index + 1] === 'string'
    && !value[index + 1].startsWith('-')
  ) {
    if (!isSafeReference(value[index + 1])) {
      findings.push({
        location: [...path, String(index + 1)].join('.'),
        key: flagOnly[1],
        risk: 'hardcoded-credential-literal'
      });
    }
    return { findings, consumedNext: true };
  }

  return { findings, consumedNext: false };
}

function inspect(value, path = []) {
  const findings = [];
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      if (typeof value[i] === 'string') {
        const { findings: itemFindings, consumedNext } = inspectArrayElement(value, i, path);
        findings.push(...itemFindings);
        if (consumedNext) i += 1;
      } else {
        findings.push(...inspect(value[i], [...path, String(i)]));
      }
    }
    return findings;
  }
  if (!value || typeof value !== 'object') return findings;

  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (typeof child === 'string' && isCredentialKey(key) && !isSafeReference(child)) {
      findings.push({
        location: childPath.join('.'),
        key,
        risk: 'hardcoded-credential-literal'
      });
    } else {
      findings.push(...inspect(child, childPath));
    }
  }
  return findings;
}

function usage() {
  console.error('Usage: node mcp-config-credential-check.mjs <mcp-config.json> [more-config.json ...]');
  console.error('Checks explicit local JSON files only. It never prints credential values or contacts providers.');
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    usage();
    process.exitCode = 1;
    return;
  }

  let risky = false;
  let invalid = false;

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      invalid = true;
      console.error(`${file}: unable to read or parse JSON (${error?.code ?? error?.name ?? 'error'})`);
      continue;
    }

    const findings = inspect(parsed);
    if (findings.length === 0) {
      console.log(`${file}: no hardcoded credential literals found in credential-named JSON fields`);
      continue;
    }

    risky = true;
    console.log(`${file}: ${findings.length} hardcoded credential literal${findings.length === 1 ? '' : 's'} found`);
    for (const finding of findings) {
      console.log(`- ${finding.location} [${finding.risk}] value=REDACTED`);
    }
    console.log('  remediation: replace literals with environment/input/secret-manager references and rotate any credential that was committed to source control.');
  }

  if (invalid) process.exitCode = 1;
  else if (risky) process.exitCode = 2;
}

await main();
