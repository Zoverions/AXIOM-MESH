import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { canonicalJson, sha256, ValidationError } from './canonical.mjs';
import { ensureMeshIdentity } from './identity.mjs';
import {
  loadTransportRuntime,
  TRANSPORT_SERVICES,
  validateTransportCredentials
} from './transport-credentials.mjs';

const SERVICE_UNITS_SCHEMA = 'axiom-service-units.v1';
const DEPLOYABLE_SERVICES = Object.freeze([
  'gateway',
  'grid',
  'hypervisor',
  'sandbox'
]);

export async function provisionServiceUnits({
  sourceDataDir,
  sourceTransportDir,
  unitsDir
}) {
  const sourceData = resolveRequiredPath(sourceDataDir, 'source data directory');
  const sourceTransport = resolveRequiredPath(
    sourceTransportDir,
    'source transport directory'
  );
  const units = resolveRequiredPath(unitsDir, 'service-units directory');
  const existing = await pathKind(units);
  if (existing !== null) {
    if (existing !== 'directory') {
      throw new ValidationError('Service-units path must be a directory');
    }
    return validateServiceUnits({
      sourceDataDir: sourceData,
      sourceTransportDir: sourceTransport,
      unitsDir: units
    });
  }

  const parent = dirname(units);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const staged = join(parent, `.service-units-${process.pid}-${Date.now()}`);
  await mkdir(staged, { mode: 0o700 });
  try {
    const source = await sourceDescription({
      sourceDataDir: sourceData,
      sourceTransportDir: sourceTransport
    });
    for (const service of DEPLOYABLE_SERVICES) {
      await createUnit({
        service,
        sourceDataDir: sourceData,
        sourceTransportDir: sourceTransport,
        unitDir: join(staged, service)
      });
    }
    const manifest = {
      schema: SERVICE_UNITS_SCHEMA,
      version: 1,
      services: [...DEPLOYABLE_SERVICES],
      isolation: {
        private_application_identity_per_unit: true,
        private_transport_leaf_per_unit: true,
        public_trust_records_per_unit: true,
        grid_only_durable_state: true
      },
      source
    };
    await atomicWrite(
      join(staged, 'manifest.json'),
      `${canonicalJson(manifest)}\n`,
      0o600
    );
    await validateServiceUnits({
      sourceDataDir: sourceData,
      sourceTransportDir: sourceTransport,
      unitsDir: staged
    });
    await rename(staged, units);
  } catch (error) {
    await removeTree(staged);
    throw error;
  }
  return validateServiceUnits({
    sourceDataDir: sourceData,
    sourceTransportDir: sourceTransport,
    unitsDir: units
  });
}

export async function validateServiceUnits({
  sourceDataDir,
  sourceTransportDir,
  unitsDir
}) {
  const sourceData = resolveRequiredPath(sourceDataDir, 'source data directory');
  const sourceTransport = resolveRequiredPath(
    sourceTransportDir,
    'source transport directory'
  );
  const units = resolveRequiredPath(unitsDir, 'service-units directory');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(units, 'manifest.json'), 'utf8'));
  } catch {
    throw new ValidationError('Service-units manifest is missing or invalid');
  }
  if (
    manifest?.schema !== SERVICE_UNITS_SCHEMA
    || manifest.version !== 1
    || canonicalJson(manifest.services) !== canonicalJson(DEPLOYABLE_SERVICES)
    || manifest.isolation?.private_application_identity_per_unit !== true
    || manifest.isolation?.private_transport_leaf_per_unit !== true
    || manifest.isolation?.public_trust_records_per_unit !== true
    || manifest.isolation?.grid_only_durable_state !== true
  ) {
    throw new ValidationError('Service-units manifest shape is invalid');
  }
  const expectedSource = await sourceDescription({
    sourceDataDir: sourceData,
    sourceTransportDir: sourceTransport
  });
  if (canonicalJson(manifest.source) !== canonicalJson(expectedSource)) {
    throw new ValidationError(
      'Service-units projection is stale relative to the provisioned source'
    );
  }

  const serviceUnits = {};
  for (const service of DEPLOYABLE_SERVICES) {
    const unitDir = join(units, service);
    const dataDir = join(unitDir, 'data');
    const transportDir = join(unitDir, 'transport');
    const identity = await ensureMeshIdentity(
      dataDir,
      service,
      { create: false }
    );
    const transport = await loadTransportRuntime({
      transportDir,
      service
    });
    if (
      identity.keyId !== expectedSource.application_identities[service]
      || transport.fingerprint
        !== expectedSource.transport_fingerprints[service]
    ) {
      throw new ValidationError(`${service} unit identity projection is invalid`);
    }
    for (const other of DEPLOYABLE_SERVICES) {
      if (other === service) continue;
      if (
        await pathKind(join(
          dataDir,
          'identities',
          other,
          'private.pem'
        )) !== null
      ) {
        throw new ValidationError(
          `${service} unit contains another application private key`
        );
      }
      if (
        await pathKind(join(
          transportDir,
          'services',
          `${other}.key.pem`
        )) !== null
      ) {
        throw new ValidationError(
          `${service} unit contains another transport private key`
        );
      }
    }
    if (
      service !== 'grid'
      && await pathKind(join(dataDir, 'grid.sqlite')) !== null
    ) {
      throw new ValidationError(`${service} unit contains Grid durable state`);
    }
    for (const forbidden of [
      join(transportDir, 'ca-key.pem'),
      join(unitDir, 'data-protection.key'),
      join(unitDir, 'api-tokens.json'),
      join(unitDir, 'operator.token')
    ]) {
      if (await pathKind(forbidden) !== null) {
        throw new ValidationError(
          `${service} unit contains a forbidden shared secret`
        );
      }
    }
    await Promise.all([
      assertPrivatePath(unitDir, `${service} unit directory`),
      assertPrivatePath(
        join(dataDir, 'identities', service, 'private.pem'),
        `${service} application private key`
      ),
      assertPrivatePath(
        join(transportDir, 'services', `${service}.key.pem`),
        `${service} transport private key`
      )
    ]);
    serviceUnits[service] = {
      service,
      unit_dir: unitDir,
      data_dir: dataDir,
      transport_dir: transportDir,
      application_key_id: identity.keyId,
      transport_fingerprint_sha256: transport.fingerprint
    };
  }
  return {
    valid: true,
    schema: SERVICE_UNITS_SCHEMA,
    units_dir: units,
    source: expectedSource,
    services: serviceUnits
  };
}

async function createUnit({
  service,
  sourceDataDir,
  sourceTransportDir,
  unitDir
}) {
  const dataDir = join(unitDir, 'data');
  const transportDir = join(unitDir, 'transport');
  await Promise.all([
    mkdir(join(dataDir, 'identities', service), {
      recursive: true,
      mode: 0o700
    }),
    mkdir(join(dataDir, 'trust'), { recursive: true, mode: 0o700 }),
    mkdir(join(transportDir, 'services'), {
      recursive: true,
      mode: 0o700
    })
  ]);
  await Promise.all([
    copyPrivate(
      join(sourceDataDir, 'identities', service, 'private.pem'),
      join(dataDir, 'identities', service, 'private.pem')
    ),
    copyPublic(
      join(sourceDataDir, 'identities', service, 'public.pem'),
      join(dataDir, 'identities', service, 'public.pem')
    ),
    copyPublic(
      join(sourceTransportDir, 'ca-cert.pem'),
      join(transportDir, 'ca-cert.pem')
    ),
    copyPrivate(
      join(sourceTransportDir, 'manifest.json'),
      join(transportDir, 'manifest.json')
    ),
    copyPrivate(
      join(sourceTransportDir, 'services', `${service}.key.pem`),
      join(transportDir, 'services', `${service}.key.pem`)
    ),
    copyPublic(
      join(sourceTransportDir, 'services', `${service}.cert.pem`),
      join(transportDir, 'services', `${service}.cert.pem`)
    )
  ]);
  for (const trustFile of await readdir(join(sourceDataDir, 'trust'))) {
    if (!/^[a-z][a-z0-9-]{0,63}\.pub\.pem$/.test(trustFile)) continue;
    await copyPublic(
      join(sourceDataDir, 'trust', trustFile),
      join(dataDir, 'trust', trustFile)
    );
  }
  if (service === 'grid') {
    for (const entry of await readdir(sourceDataDir, { withFileTypes: true })) {
      if (['identities', 'trust'].includes(entry.name)) continue;
      await cp(
        join(sourceDataDir, entry.name),
        join(dataDir, entry.name),
        {
          recursive: entry.isDirectory(),
          errorOnExist: true,
          force: false,
          preserveTimestamps: false
        }
      );
    }
  }
}

async function sourceDescription({ sourceDataDir, sourceTransportDir }) {
  const transport = await validateTransportCredentials({
    secretDir: dirname(sourceTransportDir),
    rootOverride: sourceTransportDir
  });
  const applicationIdentities = {};
  const trustDigests = {};
  for (const service of DEPLOYABLE_SERVICES) {
    applicationIdentities[service] = (
      await ensureMeshIdentity(sourceDataDir, service, { create: false })
    ).keyId;
    trustDigests[service] = sha256(
      await readFile(join(sourceDataDir, 'trust', `${service}.pub.pem`))
    );
  }
  return {
    application_identities: applicationIdentities,
    trust_sha256: trustDigests,
    transport_generation: transport.generation,
    transport_ca_fingerprint_sha256: transport.ca_fingerprint_sha256,
    transport_fingerprints: Object.fromEntries(
      DEPLOYABLE_SERVICES.map(service => [
        service,
        transport.services[service].fingerprint_sha256
      ])
    )
  };
}

async function copyPrivate(source, target) {
  await cp(source, target, {
    errorOnExist: true,
    force: false,
    preserveTimestamps: false
  });
  if (process.platform !== 'win32') {
    const { chmod } = await import('node:fs/promises');
    await chmod(target, 0o600);
  }
}

async function copyPublic(source, target) {
  await cp(source, target, {
    errorOnExist: true,
    force: false,
    preserveTimestamps: false
  });
  if (process.platform !== 'win32') {
    const { chmod } = await import('node:fs/promises');
    await chmod(target, 0o644);
  }
}

async function atomicWrite(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { mode, flag: 'wx' });
  await rename(temporary, path);
}

async function pathKind(path) {
  try {
    const metadata = await stat(path);
    return metadata.isDirectory() ? 'directory' : 'file';
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertPrivatePath(path, label) {
  if (process.platform === 'win32') return;
  const metadata = await stat(path);
  if ((metadata.mode & 0o077) !== 0) {
    throw new ValidationError(`${label} must not be accessible by group or other users`);
  }
}

async function removeTree(path) {
  const { rm } = await import('node:fs/promises');
  await rm(path, { recursive: true, force: true });
}

function resolveRequiredPath(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`A ${label} is required`);
  }
  return resolve(value);
}

export {
  DEPLOYABLE_SERVICES,
  SERVICE_UNITS_SCHEMA
};
