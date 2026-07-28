import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { assertString, ValidationError } from './lib/canonical.mjs';
import { verifyCausalBundle } from './lib/causal-sync.mjs';

const DIGEST = /^[a-f0-9]{64}$/;

export function verifySyncBundle(bundle, { expectedPublicKeyDigest } = {}) {
  const expected = assertString(
    expectedPublicKeyDigest,
    'expected_public_key_digest',
    { min: 64, max: 64, pattern: DIGEST }
  );
  const verified = verifyCausalBundle(bundle, {
    expectedPublicKeyDigest: expected,
    requireNotFuture: false
  });
  return {
    valid: true,
    format: verified.statement.format,
    owner: verified.statement.owner,
    source_node_id: verified.statement.source_node_id,
    public_key_digest: verified.public_key_digest,
    bundle_digest: verified.bundle_digest,
    update_count: verified.updates.length,
    update_ids: verified.updates.map(update => update.update_id)
  };
}

async function main() {
  const [bundlePath, expectedPublicKeyDigest] = process.argv.slice(2);
  if (!bundlePath || !expectedPublicKeyDigest) {
    throw new ValidationError(
      'Usage: node src/verify-sync.mjs <bundle.json> <expected-node-public-key-sha256>'
    );
  }
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  process.stdout.write(`${JSON.stringify(
    verifySyncBundle(bundle, { expectedPublicKeyDigest }),
    null,
    2
  )}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
