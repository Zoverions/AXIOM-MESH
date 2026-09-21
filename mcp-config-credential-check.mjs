#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const CREDENTIAL_KEY = /(^|[_-])(api[_-]?key|token|secret|password|passwd|credential|private[_-]?key)($|[_-])/i;
const AUTHORIZATION_KEY = /^(authorization|proxy-authorization|auth)$/i;
const PLACEHOLDER = /^(?:<[^>]+>|REPLACE[_-]?ME|CHANGE[_-]?ME|YOUR[_-][A-Z0-9_-]+|NONE|NULL)$/i;

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

function inspect(value, path = []) {
  const findings = [];
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) findings.push(...inspect(value[i], [...path, String(i)]));
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
