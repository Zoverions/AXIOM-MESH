#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { verifyMachineReceiptLike } from './verify-receipt.mjs';
import { verifyContinuityAnchor } from './verify-continuity.mjs';
import { verifyExportPackage } from './verify-export.mjs';

function usage() {
  return [
    'Usage:',
    '  node packages/axiom-verify/cli.mjs receipt <receipt.json> <grid-public.pem>',
    '  node packages/axiom-verify/cli.mjs continuity <anchor.json> <chain-segment.json> <grid-public.pem>',
    '  node packages/axiom-verify/cli.mjs export <manifest.json> <bundle-file> <grid-public.pem>',
    '  node packages/axiom-verify/cli.mjs <receipt.json> <grid-public.pem>   # receipt shorthand',
    '',
    'Experimental MVP scaffold only — not a released Verify product.'
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
    return;
  }

  let mode = 'receipt';
  let rest = args;
  if (['receipt', 'continuity', 'export'].includes(args[0])) {
    mode = args[0];
    rest = args.slice(1);
  }

  let result;
  if (mode === 'receipt') {
    const [receiptPath, publicKeyPath] = rest;
    if (!receiptPath || !publicKeyPath) {
      process.stderr.write(`${usage()}\n`);
      process.exitCode = 2;
      return;
    }
    const [receiptRaw, publicKeyPem] = await Promise.all([
      readFile(receiptPath, 'utf8'),
      readFile(publicKeyPath, 'utf8')
    ]);
    result = verifyMachineReceiptLike(receiptRaw, { publicKeyPem });
  } else if (mode === 'continuity') {
    const [anchorPath, segmentPath, publicKeyPath] = rest;
    if (!anchorPath || !segmentPath || !publicKeyPath) {
      process.stderr.write(`${usage()}\n`);
      process.exitCode = 2;
      return;
    }
    const [anchorRaw, segmentRaw, publicKeyPem] = await Promise.all([
      readFile(anchorPath, 'utf8'),
      readFile(segmentPath, 'utf8'),
      readFile(publicKeyPath, 'utf8')
    ]);
    result = verifyContinuityAnchor(anchorRaw, {
      publicKeyPem,
      chainSegment: JSON.parse(segmentRaw)
    });
  } else if (mode === 'export') {
    const [manifestPath, bundlePath, publicKeyPath] = rest;
    if (!manifestPath || !bundlePath || !publicKeyPath) {
      process.stderr.write(`${usage()}\n`);
      process.exitCode = 2;
      return;
    }
    const [manifestRaw, bundleBytes, publicKeyPem] = await Promise.all([
      readFile(manifestPath, 'utf8'),
      readFile(bundlePath),
      readFile(publicKeyPath, 'utf8')
    ]);
    const manifest = JSON.parse(manifestRaw);
    const fileName = manifest.files?.[0]?.name ?? 'bundle.jsonl';
    result = verifyExportPackage(
      { manifest, files: { [fileName]: bundleBytes } },
      { publicKeyPem }
    );
  }

  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
