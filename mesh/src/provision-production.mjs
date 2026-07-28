import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, ValidationError } from './lib/canonical.mjs';
import { ensureMeshIdentity } from './lib/identity.mjs';

export async function provisionProduction({
  dataDir,
  secretDir
}) {
  const resolvedDataDir = resolveRequiredDirectory(dataDir, 'data directory');
  const resolvedSecretDir = resolveRequiredDirectory(secretDir, 'secret directory');
  if (resolvedDataDir === resolvedSecretDir) {
    throw new ValidationError('Production data and secret directories must be distinct');
  }
  await Promise.all([
    mkdir(resolvedDataDir, { recursive: true, mode: 0o700 }),
    mkdir(resolvedSecretDir, { recursive: true, mode: 0o700 })
  ]);
  await Promise.all([
    assertPrivatePath(resolvedDataDir, 'Production data directory'),
    assertPrivatePath(resolvedSecretDir, 'Production secret directory')
  ]);
  const dataKeyPath = `${resolvedSecretDir}/data-protection.key`;
  const apiTokensPath = `${resolvedSecretDir}/api-tokens.json`;
  const operatorTokenPath = `${resolvedSecretDir}/operator.token`;
  const existing = await Promise.all([
    readOptional(dataKeyPath),
    readOptional(apiTokensPath),
    readOptional(operatorTokenPath)
  ]);
  const existingCount = existing.filter(value => value !== undefined).length;
  if (existingCount !== 0 && existingCount !== existing.length) {
    throw new ValidationError('Production secret directory is incomplete; no credentials were changed');
  }
  let operatorToken;
  if (existingCount === 0) {
    operatorToken = randomBytes(32).toString('base64url');
    await atomicWrite(dataKeyPath, `${randomBytes(32).toString('base64url')}\n`, 0o600);
    await atomicWrite(operatorTokenPath, `${operatorToken}\n`, 0o600);
    const tokenRegistry = {
      [operatorToken]: {
        id: 'production-operator',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      }
    };
    await atomicWrite(apiTokensPath, `${canonicalJson(tokenRegistry)}\n`, 0o600);
  } else {
    operatorToken = existing[2].trim();
    if (Buffer.from(existing[0].trim(), 'base64url').length !== 32) {
      throw new ValidationError('Existing production data-protection key is invalid');
    }
    let registry;
    try {
      registry = JSON.parse(existing[1]);
    } catch {
      throw new ValidationError('Existing production API token registry is invalid');
    }
    if (!Object.hasOwn(registry, operatorToken)) {
      throw new ValidationError('Existing operator token is not present in the API token registry');
    }
  }
  const identities = {};
  for (const service of ['gateway', 'hypervisor', 'sandbox', 'grid']) {
    identities[service] = (
      await ensureMeshIdentity(resolvedDataDir, service, { create: true })
    ).keyId;
    await assertPrivatePath(
      `${resolvedDataDir}/identities/${service}/private.pem`,
      `${service} private identity`
    );
  }
  await Promise.all([
    assertPrivatePath(dataKeyPath, 'Data-protection key'),
    assertPrivatePath(apiTokensPath, 'API token registry'),
    assertPrivatePath(operatorTokenPath, 'Operator token')
  ]);
  return {
    data_dir: resolvedDataDir,
    secret_dir: resolvedSecretDir,
    identities,
    data_key_file: dataKeyPath,
    api_tokens_file: apiTokensPath,
    operator_token_file: operatorTokenPath
  };
}

function resolveRequiredDirectory(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`A ${label} is required`);
  }
  return resolve(value);
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  }
}

async function assertPrivatePath(path, label) {
  if (process.platform === 'win32') return;
  const metadata = await stat(path);
  if ((metadata.mode & 0o077) !== 0) {
    throw new ValidationError(`${label} must not be accessible by group or other users`);
  }
}

async function atomicWrite(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { mode, flag: 'wx' });
  await rename(temporary, path);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await provisionProduction({
    dataDir: process.argv[2],
    secretDir: process.argv[3]
  });
  process.stdout.write(`${JSON.stringify({
    status: 'provisioned',
    ...result
  }, null, 2)}\n`);
}
