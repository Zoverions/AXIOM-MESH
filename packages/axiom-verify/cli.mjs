#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { verifyMachineReceiptLike } from './verify-receipt.mjs';

async function main() {
  const [receiptPath, publicKeyPath] = process.argv.slice(2);
  if (!receiptPath || !publicKeyPath) {
    process.stderr.write(
      'Usage: node packages/axiom-verify/cli.mjs <receipt.json> <grid-public.pem>\n'
      + 'Experimental MVP scaffold only — not a released Verify product.\n'
    );
    process.exitCode = 2;
    return;
  }
  const [receiptRaw, publicKeyPem] = await Promise.all([
    readFile(receiptPath, 'utf8'),
    readFile(publicKeyPath, 'utf8')
  ]);
  const result = verifyMachineReceiptLike(receiptRaw, { publicKeyPem });
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
