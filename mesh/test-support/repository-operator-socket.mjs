import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPOSITORY_OPERATOR_SOCKET_MAX_BYTES = 100;

export async function createRepositoryOperatorTestSocket(t, {
  tempRoot = tmpdir(),
  mkdtempFn = mkdtemp
} = {}) {
  const directory = await mkdtempFn(join(tempRoot, 'ax-ro-'));
  const socketPath = join(directory, 'op.sock');

  if (Buffer.byteLength(socketPath) > REPOSITORY_OPERATOR_SOCKET_MAX_BYTES) {
    await rm(directory, { recursive: true, force: true });
    throw new Error('repository-operator test socket path exceeds the 100-byte production limit');
  }

  t.after(() => rm(directory, { recursive: true, force: true }));
  return socketPath;
}
