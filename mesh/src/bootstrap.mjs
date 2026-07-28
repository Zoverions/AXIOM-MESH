import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { meshConfig } from './lib/config.mjs';
import { ensureMeshIdentity } from './lib/identity.mjs';

export async function bootstrap(config = meshConfig()) {
  if (config.environment === 'production') {
    throw new Error('Local bootstrap does not generate production credentials');
  }
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  const identities = {};
  for (const service of ['gateway', 'hypervisor', 'sandbox', 'grid']) {
    const identity = await ensureMeshIdentity(config.dataDir, service, { create: true });
    identities[service] = identity.keyId;
  }
  const tokenPath = join(config.dataDir, 'dev-admin.token');
  let token;
  try {
    token = (await readFile(tokenPath, 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    token = randomBytes(32).toString('base64url');
    await atomicWrite(tokenPath, `${token}\n`, 0o600);
  }
  return { data_dir: config.dataDir, token_path: tokenPath, token, identities };
}

async function atomicWrite(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, content, { mode, flag: 'wx' });
  await rename(temp, path);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await bootstrap();
  process.stdout.write(`${JSON.stringify({
    data_dir: result.data_dir,
    token_path: result.token_path,
    identities: result.identities
  }, null, 2)}\n`);
}
