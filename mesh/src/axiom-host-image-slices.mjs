#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import {
  HOST_IMAGE_DIAGNOSTIC_SCHEMA
} from './axiom-host-image-diagnostics.mjs';
import { canonicalJson, sha256, ValidationError } from './lib/canonical.mjs';

export const HOST_IMAGE_SLICE_SCHEMA = 'axiom-host-h0-image-slices.v1';

const SHA256 = /^[a-f0-9]{64}$/;
const SELECTOR = /^([A-Za-z0-9-]+):([0-9]+)$/;
const MAX_SLICES = 8;
const MAX_SLICE_BYTES = 32 * 1024 * 1024;

export async function exportDiagnosticSlices(rawImagePath, diagnostic, outputDirectory, selectors) {
  verifyDiagnosticEnvelope(diagnostic);
  if (!Array.isArray(selectors) || selectors.length < 1 || selectors.length > MAX_SLICES) {
    throw new ValidationError(`AXIOM Host H0 requires between 1 and ${MAX_SLICES} diagnostic slice selectors`);
  }

  const raw = await stat(rawImagePath);
  if (!raw.isFile() || raw.size !== diagnostic.image.disk_bytes) {
    throw new ValidationError('AXIOM Host H0 diagnostic slice input does not match the bound disk size');
  }
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true, mode: 0o700 });

  const slices = [];
  const seen = new Set();
  for (const selector of selectors) {
    const match = SELECTOR.exec(selector);
    if (!match || seen.has(selector)) {
      throw new ValidationError(`AXIOM Host H0 diagnostic slice selector is invalid or repeated: ${selector}`);
    }
    seen.add(selector);
    const [, partitionName, chunkText] = match;
    const chunkIndex = Number(chunkText);
    const partition = diagnostic.image.partitions.find(current => current.name === partitionName);
    const chunk = partition?.chunks?.find(current => current.index === chunkIndex);
    if (!partition || !chunk || !Number.isSafeInteger(chunk.bytes) || chunk.bytes < 1 || chunk.bytes > MAX_SLICE_BYTES) {
      throw new ValidationError(`AXIOM Host H0 diagnostic slice is outside the recorded partition: ${selector}`);
    }
    const absoluteOffset = partition.first_lba * diagnostic.image.sector_size + chunk.offset_bytes;
    if (
      !Number.isSafeInteger(absoluteOffset)
      || absoluteOffset < 0
      || absoluteOffset + chunk.bytes > raw.size
    ) {
      throw new ValidationError(`AXIOM Host H0 diagnostic slice has invalid geometry: ${selector}`);
    }

    const name = `${partitionName}-chunk-${chunkIndex}.bin`;
    const path = join(output, name);
    await pipeline(
      createReadStream(rawImagePath, { start: absoluteOffset, end: absoluteOffset + chunk.bytes - 1 }),
      createWriteStream(path, { mode: 0o600 })
    );
    const digest = await hashFile(path);
    if (digest !== chunk.sha256) {
      throw new ValidationError(`AXIOM Host H0 exported diagnostic slice hash drifted: ${selector}`);
    }
    slices.push({
      selector,
      artifact: name,
      partition: partitionName,
      chunk_index: chunkIndex,
      partition_offset_bytes: chunk.offset_bytes,
      disk_offset_bytes: absoluteOffset,
      bytes: chunk.bytes,
      sha256: digest
    });
  }

  const result = {
    schema: HOST_IMAGE_SLICE_SCHEMA,
    status: 'diagnostic-only',
    source: diagnostic.source,
    input: {
      artifact: basename(rawImagePath),
      disk_bytes: diagnostic.image.disk_bytes,
      disk_sha256: diagnostic.image.disk_sha256,
      diagnostic_sha256: diagnostic.diagnostic_sha256
    },
    slices,
    controls: {
      source_image_secret_scan_required_by_bound_build_evidence: true,
      diagnostic_only: true,
      production_promoted: false
    },
    interpretation: 'These bounded byte slices localize H0 image nondeterminism. They do not establish filesystem correctness, boot success, authenticity, or production readiness.'
  };
  const envelope = {
    ...result,
    slice_manifest_sha256: sha256(canonicalJson(result))
  };
  await writeFile(join(output, 'axiom-host-h0-image-slices.json'), `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
  return envelope;
}

function verifyDiagnosticEnvelope(diagnostic) {
  if (
    diagnostic?.schema !== HOST_IMAGE_DIAGNOSTIC_SCHEMA
    || diagnostic?.status !== 'diagnostic-only'
    || diagnostic?.controls?.raw_image_bound_to_build_evidence !== true
    || diagnostic?.controls?.diagnostic_only !== true
    || diagnostic?.controls?.production_promoted !== false
    || !SHA256.test(diagnostic?.diagnostic_sha256 ?? '')
  ) {
    throw new ValidationError('AXIOM Host H0 diagnostic slice manifest input is invalid');
  }
  const { diagnostic_sha256: digest, ...unsigned } = diagnostic;
  if (sha256(canonicalJson(unsigned)) !== digest) {
    throw new ValidationError('AXIOM Host H0 diagnostic slice manifest input digest is invalid');
  }
}

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  const [rawImagePath, diagnosticPath, outputDirectory, ...selectors] = process.argv.slice(2);
  if (!rawImagePath || !diagnosticPath || !outputDirectory || selectors.length < 1) {
    throw new ValidationError('Usage: axiom-host-image-slices.mjs <raw-image> <diagnostics.json> <output-directory> <partition:chunk> [...]');
  }
  let diagnostic;
  try {
    diagnostic = JSON.parse(await readFile(diagnosticPath, 'utf8'));
  } catch {
    throw new ValidationError('AXIOM Host H0 diagnostics input is not valid JSON');
  }
  const result = await exportDiagnosticSlices(rawImagePath, diagnostic, outputDirectory, selectors);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
