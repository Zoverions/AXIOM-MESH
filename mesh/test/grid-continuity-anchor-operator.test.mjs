import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createExternalContinuityAnchor,
  verifyExternalContinuityAnchor,
  verificationHelp
} from '../src/verify-grid-chain.mjs';

async function dataDir(t) {
  const path = await mkdtemp(join(tmpdir(), 'axiom-continuity-operator-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('operator refuses to create an alleged external anchor inside AXIOM_DATA_DIR', async t => {
  const root = await dataDir(t);
  await assert.rejects(
    () => createExternalContinuityAnchor({
      exportManifestPath: join(root, 'missing-export.json'),
      anchorPath: join(root, 'anchors', 'anchor.json'),
      config: {
        dataDir: root,
        capabilitiesPath: join(root, 'missing-capabilities.json')
      }
    }),
    /outside AXIOM_DATA_DIR/
  );
});

test('operator refuses to verify an anchor retained inside AXIOM_DATA_DIR', async t => {
  const root = await dataDir(t);
  await assert.rejects(
    () => verifyExternalContinuityAnchor({
      anchorPath: join(root, 'anchor.json'),
      exportManifestPath: join(root, 'export.json'),
      config: {
        dataDir: root,
        capabilitiesPath: join(root, 'missing-capabilities.json')
      }
    }),
    /outside AXIOM_DATA_DIR/
  );
});

test('operator help states external retention and full-chain verification requirements', () => {
  const help = verificationHelp();
  assert.match(help, /outside AXIOM_DATA_DIR/);
  assert.match(help, /full genesis chain verification/);
  assert.match(help, /anchor-create/);
  assert.match(help, /anchor-verify/);
});
