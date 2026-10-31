import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';

import {
  createRepositoryOperatorTestSocket
} from '../test-support/repository-operator-socket.mjs';

test('repository-operator test socket stays within the production byte limit on a deep macOS temp root', async t => {
  const tempRoot = join(
    '/var/folders',
    'ab',
    'abcdefghijklmnopqrstuvwxyz123456',
    'T'
  );
  const socketPath = await createRepositoryOperatorTestSocket(t, {
    tempRoot,
    mkdtempFn: async template => `${template}123456`
  });

  assert.equal(
    socketPath,
    join(tempRoot, 'ax-ro-123456', 'op.sock')
  );
  assert.ok(
    Buffer.byteLength(socketPath) <= 100,
    `repository-operator socket path exceeds 100 bytes: ${socketPath}`
  );
});
