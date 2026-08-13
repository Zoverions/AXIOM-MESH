#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { canonicalJson, sha256, ValidationError } from './lib/canonical.mjs';

export const HOST_LAB_SECRET_SCAN_SCHEMA = 'axiom-host-h0-secret-scan.v1';

const OVERLAP_BYTES = 256 * 1024;
const PATTERNS = Object.freeze([
  // A header literal alone is common in crypto implementations. Require a
  // bounded base64 body and matching footer before classifying a PEM key.
  Object.freeze({
    id: 'pem-private-key',
    expression: /-----BEGIN ((?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY)-----[\r\n]+[A-Za-z0-9+/=\r\n]{128,131072}-----END \1-----/g
  }),
  Object.freeze({
    id: 'github-classic-pat',
    expression: /ghp_[A-Za-z0-9]{36}/g
  }),
  Object.freeze({
    id: 'openai-project-key',
    expression: /sk-proj-[A-Za-z0-9_-]{16,}/g
  }),
  Object.freeze({
    id: 'aws-access-key-id',
    // AWS publishes AKIAIOSFODNN7EXAMPLE in its own documentation. It is not a
    // credential; all other access-key-shaped values remain fail-closed.
    expression: /AKIA(?!IOSFODNN7EXAMPLE)[A-Z0-9]{16}/g
  }),
  Object.freeze({
    id: 'authorization-bearer-token',
    expression: /Authorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi
  })
]);

export async function scanAxiomHostH0Secrets(inputs) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 8) {
    throw new ValidationError('AXIOM Host H0 secret scan requires one to eight inputs');
  }
  const labels = new Set();
  const files = [];
  for (const input of inputs) {
    const label = String(input?.label ?? '');
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(label) || labels.has(label)) {
      throw new ValidationError('AXIOM Host H0 secret scan input labels must be unique safe names');
    }
    labels.add(label);
    files.push(await scanOneFile(input.path, label));
  }

  const matchedPatternIds = [...new Set(files.flatMap(file => file.matched_pattern_ids))].sort();
  const result = {
    schema: HOST_LAB_SECRET_SCAN_SCHEMA,
    status: matchedPatternIds.length === 0 ? 'passed' : 'failed',
    passed: matchedPatternIds.length === 0,
    method: {
      encoding: 'byte-preserving-latin1-sliding-window',
      overlap_bytes: OVERLAP_BYTES,
      pattern_ids: PATTERNS.map(pattern => pattern.id),
      matched_values_omitted: true
    },
    files,
    matched_pattern_ids: matchedPatternIds,
    authority: {
      production_promoted: false
    }
  };
  return {
    ...result,
    scan_sha256: sha256(canonicalJson(result))
  };
}

async function scanOneFile(path, label) {
  const metadata = await stat(path);
  if (!metadata.isFile()) {
    throw new ValidationError(`AXIOM Host H0 secret scan input must be a regular file: ${label}`);
  }

  const digest = createHash('sha256');
  const found = new Set();
  let carry = Buffer.alloc(0);
  let bytes = 0;
  for await (const chunk of createReadStream(path, { highWaterMark: 1024 * 1024 })) {
    digest.update(chunk);
    bytes += chunk.length;
    const window = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
    const text = window.toString('latin1');
    for (const pattern of PATTERNS) {
      pattern.expression.lastIndex = 0;
      if (pattern.expression.test(text)) found.add(pattern.id);
    }
    carry = window.subarray(Math.max(0, window.length - OVERLAP_BYTES));
  }

  return {
    label,
    bytes,
    sha256: digest.digest('hex'),
    matched_pattern_ids: [...found].sort()
  };
}
