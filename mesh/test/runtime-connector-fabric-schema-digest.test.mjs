import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CATALOG_URL = new URL(
  '../../docs/architecture/contracts/runtime-connector-catalog-entry.v1.schema.json',
  import.meta.url
);
const HANDOFF_URL = new URL(
  '../../docs/architecture/contracts/task-artifact-handoff.v1.schema.json',
  import.meta.url
);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const catalogSha256 = sha256(readFileSync(CATALOG_URL));
const handoffSha256 = sha256(readFileSync(HANDOFF_URL));

test(
  `Runtime Fabric candidate schema bytes are observable before freeze: catalog=${catalogSha256} handoff=${handoffSha256}`,
  () => {
    assert.match(catalogSha256, /^[a-f0-9]{64}$/);
    assert.match(handoffSha256, /^[a-f0-9]{64}$/);
  }
);
