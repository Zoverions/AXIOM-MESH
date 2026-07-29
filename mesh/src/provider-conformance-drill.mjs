import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID
} from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import {
  dirname,
  join,
  resolve
} from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ValidationError,
  canonicalJson
} from './lib/canonical.mjs';
import {
  ensureMeshIdentity,
  verifyObjectSignature
} from './lib/identity.mjs';
import {
  productionHostEnvironment,
  reserveProductionPortBlock,
  startProductionHost,
  stopProductionHost
} from './lib/production-host.mjs';
import { provisionProduction } from './provision-production.mjs';

const EVIDENCE_SCHEMA = 'axiom-provider-conformance-evidence.v1';
const ADAPTER_PATH = fileURLToPath(
  new URL('./file-provider-adapter.mjs', import.meta.url)
);
const MESH_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVICES = Object.freeze([
  'gateway',
  'grid',
  'hypervisor',
  'sandbox',
  'supervisor'
]);
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REQUEST_TIMEOUT_MS = 5_000;

export async function runProviderConformanceDrill({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString()
} = {}) {
  const workspace = await prepareDisposableWorkspace(workspaceDir);
  const revision = normalizeRevision(sourceRevision);
  const generated = normalizeTimestamp(generatedAt);
  const startedAt = performance.now();
  const lease = await reserveProductionPortBlock('provider conformance drill');
  let host;
  try {
    const fixture = await createProviderFixture(workspace);
    const identity = await ensureMeshIdentity(
      fixture.provisioned.data_dir,
      'grid',
      { create: false }
    );
    const gateway = `http://127.0.0.1:${lease.base_port}`;
    const firstEnvironment = providerHostEnvironment(
      fixture.provisioned,
      lease.base_port,
      fixture.runtimeConfigPath
    );
    const first = await startProductionHost({
      environment: firstEnvironment,
      gateway,
      drill: 'provider conformance initial startup'
    });
    host = first;
    const baselineEcho = await intent(
      gateway,
      fixture.operatorToken,
      'system.echo',
      { message: 'provider-baseline' }
    );
    const firstOperations = await route(
      gateway,
      fixture.operatorToken,
      '/v1/operations'
    );
    const firstStop = await stopProductionHost(host.child);
    host = null;
    const firstClean = (await readdir(fixture.runtimeDirectory)).length === 0;

    const replacementToken = randomBytes(32).toString('base64url');
    const rotatedPrincipals = structuredClone(fixture.principals);
    const operator = rotatedPrincipals[fixture.operatorToken];
    delete rotatedPrincipals[fixture.operatorToken];
    rotatedPrincipals[replacementToken] = operator;
    await privateWrite(
      fixture.provisioned.api_tokens_file,
      `${canonicalJson(rotatedPrincipals)}\n`
    );
    const restrictivePolicy = JSON.parse(
      await readFile(fixture.policyPath, 'utf8')
    );
    restrictivePolicy.version = `${restrictivePolicy.version}.provider-deny`;
    restrictivePolicy.actions['system.echo'].decision = 'deny';
    await privateWrite(
      fixture.policyPath,
      `${canonicalJson(restrictivePolicy)}\n`
    );

    const second = await startProductionHost({
      environment: firstEnvironment,
      gateway,
      drill: 'provider conformance rotated restart'
    });
    host = second;
    const retiredStatus = await route(
      gateway,
      fixture.operatorToken,
      '/v1/operations'
    );
    const replacementStatus = await route(
      gateway,
      replacementToken,
      '/v1/operations'
    );
    const hashAfterRotation = await intent(
      gateway,
      replacementToken,
      'system.hash',
      { value: 'provider-rotation' }
    );
    const policyDenial = await intent(
      gateway,
      replacementToken,
      'system.echo',
      { message: 'provider-policy-denial' }
    );
    const secondStop = await stopProductionHost(host.child);
    host = null;
    const secondClean = (await readdir(fixture.runtimeDirectory)).length === 0;

    const invalidConfigPath = await mismatchedProviderConfig(fixture);
    let invalidStartupRejected = false;
    try {
      await startProductionHost({
        environment: providerHostEnvironment(
          fixture.provisioned,
          lease.base_port,
          invalidConfigPath
        ),
        gateway,
        startupTimeoutMs: 5_000,
        drill: 'provider conformance invalid signature'
      });
    } catch {
      invalidStartupRejected = true;
    }
    const failedStartupClean = (
      await readdir(fixture.runtimeDirectory)
    ).length === 0;

    const checks = {
      initial_provider_startup_ready: (
        firstOperations.status === 200
        && baselineEcho.status === 200
        && baselineEcho.payload?.status === 'completed'
      ),
      independent_provider_identities: (
        fixture.secretIdentity.providerId
        !== fixture.policyIdentity.providerId
      ),
      signed_provider_receipts_recorded: (
        validReceipt(first.provider_receipt)
        && validReceipt(second.provider_receipt)
      ),
      exact_resource_inventory_materialized: (
        first.provider_receipt.resources.length === 16
        && second.provider_receipt.resources.length === 16
      ),
      first_private_generation_removed: firstClean,
      secret_rotation_activated_after_restart: (
        retiredStatus.status === 401
        && replacementStatus.status === 200
        && hashAfterRotation.status === 200
        && hashAfterRotation.payload?.status === 'completed'
      ),
      policy_rotation_activated_after_restart: (
        policyDenial.status === 403
        && policyDenial.payload?.error?.code === 'policy_denied'
      ),
      resource_versions_changed_with_content: (
        resourceVersion(first.provider_receipt, 'api_tokens')
          !== resourceVersion(second.provider_receipt, 'api_tokens')
        && resourceVersion(first.provider_receipt, 'policy.0')
          !== resourceVersion(second.provider_receipt, 'policy.0')
      ),
      second_private_generation_removed: secondClean,
      invalid_provider_rejected_before_runtime: invalidStartupRejected,
      failed_startup_left_no_generation: failedStartupClean,
      graceful_shutdowns_completed: (
        firstStop.code === 0
        && firstStop.signal === null
        && secondStop.code === 0
        && secondStop.signal === null
      )
    };
    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    if (failedChecks.length) {
      throw new ValidationError(
        `Provider conformance checks failed: ${failedChecks.join(', ')}`
      );
    }

    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    );
    const publicKeyPem = String(identity.publicKey.export({
      type: 'spki',
      format: 'pem'
    }));
    const unsigned = {
      schema: EVIDENCE_SCHEMA,
      status: 'passed',
      generated_at: generated,
      source: {
        kernel_version: packageJson.version,
        revision
      },
      execution: {
        disposable_workspace: true,
        host_mode: true,
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        services: 4,
        provider_processes_per_start: 2
      },
      signer: {
        key_id: identity.keyId,
        public_key_pem: publicKeyPem
      },
      providers: {
        secret: providerSummary(first.provider_receipt, 'secret'),
        policy: providerSummary(first.provider_receipt, 'policy')
      },
      cycles: [
        cycleSummary('initial', first),
        cycleSummary('rotated', second)
      ],
      results: {
        initial_startup_ms: first.startup_duration_ms,
        rotated_startup_ms: second.startup_duration_ms,
        first_shutdown_ms: firstStop.duration_ms,
        second_shutdown_ms: secondStop.duration_ms,
        materialized_resources_per_start: 16,
        provider_responses_per_start: 2
      },
      checks,
      limitations: [
        'reference adapter reads deployment-mounted files; vendor custody adapters remain deployment-owned',
        'provider responses are one-shot at startup; runtime refresh requires a controlled restart',
        'disposable host evidence is not an independent cloud, HSM, or vault assessment',
        'runtime generations require an ephemeral private filesystem in production'
      ],
      total_duration_ms: elapsedMilliseconds(startedAt)
    };
    assertNoSecrets(unsigned, [
      fixture.dataKey,
      fixture.operatorToken,
      replacementToken,
      fixture.secretIdentity.privatePem,
      fixture.policyIdentity.privatePem
    ]);
    const evidence = {
      ...unsigned,
      attestation: identity.signObject(unsigned)
    };
    verifyProviderConformanceEvidence(evidence);
    return evidence;
  } finally {
    if (host) await stopProductionHost(host.child);
    await lease.release();
  }
}

export function verifyProviderConformanceEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
  ) {
    throw new ValidationError('Provider conformance evidence format is invalid');
  }
  if (
    !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
    || !Array.isArray(evidence.cycles)
    || evidence.cycles.length !== 2
    || evidence.results?.materialized_resources_per_start !== 16
    || evidence.results?.provider_responses_per_start !== 2
  ) {
    throw new ValidationError('Provider conformance evidence checks are invalid');
  }
  for (const providerClass of ['secret', 'policy']) {
    const provider = evidence.providers?.[providerClass];
    if (
      typeof provider?.provider_id !== 'string'
      || !DIGEST.test(provider.response_digest ?? '')
      || !DIGEST.test(provider.signing_key_digest ?? '')
    ) {
      throw new ValidationError('Provider conformance signer summary is invalid');
    }
  }
  if (
    evidence.providers.secret.provider_id === evidence.providers.policy.provider_id
    || evidence.providers.secret.signing_key_digest
      === evidence.providers.policy.signing_key_digest
  ) {
    throw new ValidationError('Provider conformance identities are not independent');
  }
  if (
    typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer.key_id
  ) {
    throw new ValidationError('Provider conformance evidence signer is invalid');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Provider conformance public key is invalid');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Provider conformance attestation is invalid');
  }
  return {
    valid: true,
    schema: EVIDENCE_SCHEMA,
    source_revision: evidence.source?.revision,
    resources_per_start: evidence.results.materialized_resources_per_start,
    provider_responses_per_start: evidence.results.provider_responses_per_start
  };
}

async function createProviderFixture(workspace) {
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'custody', 'secret')
  });
  const policyDirectory = join(workspace, 'custody', 'policy');
  await mkdir(policyDirectory, { recursive: true, mode: 0o700 });
  const policyPath = join(policyDirectory, 'policy.json');
  const capabilitiesPath = join(policyDirectory, 'capabilities.json');
  await cp(join(MESH_ROOT, 'config', 'policy.json'), policyPath);
  await cp(join(MESH_ROOT, 'config', 'capabilities.json'), capabilitiesPath);
  await Promise.all([
    chmod(policyPath, 0o600),
    chmod(capabilitiesPath, 0o600)
  ]);
  const secretIdentity = await providerIdentity(
    join(workspace, 'provider-identities', 'secret'),
    'secret-provider'
  );
  const policyIdentity = await providerIdentity(
    join(workspace, 'provider-identities', 'policy'),
    'policy-provider'
  );
  const secretAdapterPath = join(workspace, 'secret-provider.json');
  const policyAdapterPath = join(workspace, 'policy-provider.json');
  await privateWrite(secretAdapterPath, `${canonicalJson({
    schema: 'axiom-file-provider-adapter.v1',
    provider_id: secretIdentity.providerId,
    private_key_file: secretIdentity.privatePath,
    public_key_file: secretIdentity.publicPath,
    resources: secretResources(provisioned)
  })}\n`);
  await privateWrite(policyAdapterPath, `${canonicalJson({
    schema: 'axiom-file-provider-adapter.v1',
    provider_id: policyIdentity.providerId,
    private_key_file: policyIdentity.privatePath,
    public_key_file: policyIdentity.publicPath,
    resources: {
      'policy/base': resource(
        policyPath,
        'policy',
        'application/vnd.axiom.policy+json'
      ),
      'policy/capabilities': resource(
        capabilitiesPath,
        'policy',
        'application/vnd.axiom.capabilities+json'
      )
    }
  })}\n`);
  const runtimeDirectory = join(workspace, 'runtime');
  await mkdir(runtimeDirectory, { mode: 0o700 });
  const runtimeConfigPath = join(workspace, 'provider-runtime.json');
  const executableDigest = await fileDigest(process.execPath);
  const adapterDigest = await fileDigest(ADAPTER_PATH);
  const runtimeConfig = {
    schema: 'axiom-provider-runtime-config.v1',
    deployment_id: 'provider-conformance',
    runtime_directory: runtimeDirectory,
    providers: {
      secret: providerConfig({
        identity: secretIdentity,
        adapterConfigPath: secretAdapterPath,
        executableDigest,
        adapterDigest,
        adapterConfigDigest: await fileDigest(secretAdapterPath)
      }),
      policy: providerConfig({
        identity: policyIdentity,
        adapterConfigPath: policyAdapterPath,
        executableDigest,
        adapterDigest,
        adapterConfigDigest: await fileDigest(policyAdapterPath)
      })
    },
    resources: resourceBindings()
  };
  await privateWrite(
    runtimeConfigPath,
    `${canonicalJson(runtimeConfig)}\n`
  );
  const principals = JSON.parse(
    await readFile(provisioned.api_tokens_file, 'utf8')
  );
  return {
    provisioned,
    secretIdentity,
    policyIdentity,
    policyPath,
    runtimeDirectory,
    runtimeConfig,
    runtimeConfigPath,
    principals,
    operatorToken: (
      await readFile(provisioned.operator_token_file, 'utf8')
    ).trim(),
    dataKey: (
      await readFile(provisioned.data_key_file, 'utf8')
    ).trim()
  };
}

async function mismatchedProviderConfig(fixture) {
  const rogue = await providerIdentity(
    join(dirname(fixture.runtimeConfigPath), 'provider-identities', 'rogue'),
    'rogue-provider'
  );
  const config = structuredClone(fixture.runtimeConfig);
  config.providers.policy.public_key_files = [rogue.publicPath];
  const path = join(dirname(fixture.runtimeConfigPath), 'provider-runtime-invalid.json');
  await privateWrite(path, `${canonicalJson(config)}\n`);
  return path;
}

function providerHostEnvironment(provisioned, basePort, configPath) {
  return {
    ...productionHostEnvironment(provisioned, basePort),
    AXIOM_DATA_KEY: '',
    AXIOM_DATA_KEY_FILE: '',
    AXIOM_API_TOKENS: '',
    AXIOM_API_TOKENS_FILE: '',
    AXIOM_TRANSPORT_DIR: '',
    AXIOM_POLICY_PATH: '',
    AXIOM_POLICY_PATHS: '',
    AXIOM_CAPABILITIES_PATH: '',
    AXIOM_PROVIDER_CONFIG: configPath
  };
}

function secretResources(provisioned) {
  const resources = {
    'secret/data-key': resource(
      provisioned.data_key_file,
      'secret',
      'application/vnd.axiom.data-key'
    ),
    'secret/api-tokens': resource(
      provisioned.api_tokens_file,
      'secret',
      'application/vnd.axiom.api-principals+json'
    ),
    'secret/transport-manifest': resource(
      provisioned.transport.manifest_file,
      'configuration',
      'application/vnd.axiom.transport-manifest+json'
    ),
    'secret/transport-ca': resource(
      provisioned.transport.ca_certificate_file,
      'configuration',
      'application/x-pem-file'
    )
  };
  for (const [service, transport] of Object.entries(
    provisioned.transport.services
  )) {
    resources[`secret/transport/${service}/certificate`] = resource(
      transport.certificate_file,
      'configuration',
      'application/x-pem-file'
    );
    resources[`secret/transport/${service}/private-key`] = resource(
      transport.key_file,
      'secret',
      'application/x-pem-file'
    );
  }
  return resources;
}

function resourceBindings() {
  return {
    data_key: 'secret/data-key',
    api_tokens: 'secret/api-tokens',
    transport: {
      manifest: 'secret/transport-manifest',
      ca_certificate: 'secret/transport-ca',
      services: Object.fromEntries(SERVICES.map(service => [service, {
        certificate: `secret/transport/${service}/certificate`,
        private_key: `secret/transport/${service}/private-key`
      }]))
    },
    policy_layers: ['policy/base'],
    capabilities: 'policy/capabilities'
  };
}

function providerConfig({
  identity,
  adapterConfigPath,
  executableDigest,
  adapterDigest,
  adapterConfigDigest
}) {
  return {
    provider_id: identity.providerId,
    executable: process.execPath,
    executable_sha256: executableDigest,
    arguments: [ADAPTER_PATH, adapterConfigPath],
    artifacts: [
      { path: ADAPTER_PATH, sha256: adapterDigest },
      { path: adapterConfigPath, sha256: adapterConfigDigest }
    ],
    public_key_files: [identity.publicPath],
    inherit_environment: [],
    timeout_ms: 10_000,
    maximum_response_bytes: 16_777_216
  };
}

function resource(path, classification, mediaType) {
  return {
    path,
    classification,
    media_type: mediaType
  };
}

async function providerIdentity(directory, providerId) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const pair = generateKeyPairSync('ed25519');
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const privatePath = join(directory, `${providerId}.private.pem`);
  const publicPath = join(directory, `${providerId}.public.pem`);
  await privateWrite(privatePath, privatePem);
  await privateWrite(publicPath, publicPem);
  return {
    providerId,
    privatePath,
    publicPath,
    privatePem,
    publicPem
  };
}

async function intent(gateway, token, action, input) {
  try {
    const response = await fetch(`${gateway}/v1/intents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'idempotency-key': `provider-drill-${randomUUID()}`
      },
      body: JSON.stringify({ action, input }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    return {
      status: response.status,
      payload: await response.json()
    };
  } catch {
    return { status: 0, payload: null };
  }
}

async function route(gateway, token, path) {
  try {
    const response = await fetch(`${gateway}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json'
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    await response.arrayBuffer();
    return { status: response.status };
  } catch {
    return { status: 0 };
  }
}

function validReceipt(receipt) {
  return (
    receipt?.schema === 'axiom-provider-runtime-receipt.v1'
    && receipt.providers?.secret
    && receipt.providers?.policy
    && receipt.providers.secret.provider_id
      !== receipt.providers.policy.provider_id
    && DIGEST.test(receipt.providers.secret.response_digest ?? '')
    && DIGEST.test(receipt.providers.policy.response_digest ?? '')
    && Array.isArray(receipt.resources)
  );
}

function resourceVersion(receipt, alias) {
  return receipt.resources.find(resource => resource.alias === alias)?.version;
}

function providerSummary(receipt, providerClass) {
  return structuredClone(receipt.providers[providerClass]);
}

function cycleSummary(name, host) {
  return {
    name,
    config_digest: host.provider_receipt.config_digest,
    prepared_at: host.provider_receipt.prepared_at,
    secret_response_digest: host.provider_receipt.providers.secret.response_digest,
    policy_response_digest: host.provider_receipt.providers.policy.response_digest,
    resources: host.provider_receipt.resources.map(resource => ({
      alias: resource.alias,
      provider_class: resource.provider_class,
      version: resource.version,
      media_type: resource.media_type,
      bytes: resource.bytes,
      sha256: resource.sha256
    }))
  };
}

function assertNoSecrets(evidence, secrets) {
  const serialized = JSON.stringify(evidence);
  for (const secret of secrets) {
    if (secret && serialized.includes(secret)) {
      throw new ValidationError('Provider conformance evidence contains secret material');
    }
  }
}

async function privateWrite(path, content) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, content, { mode: 0o600 });
  if (process.platform !== 'win32') await chmod(path, 0o600);
}

async function fileDigest(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', chunk => hash.update(chunk));
    stream.once('error', rejectPromise);
    stream.once('end', () => resolvePromise(hash.digest('hex')));
  });
}

async function prepareDisposableWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(
      'Provider conformance drill requires an explicit disposable workspace'
    );
  }
  const workspace = resolve(value);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length !== 0) {
    throw new ValidationError(
      'Provider conformance drill workspace must be empty'
    );
  }
  if (process.platform !== 'win32' && ((await stat(workspace)).mode & 0o077) !== 0) {
    throw new ValidationError(
      'Provider conformance drill workspace must be private'
    );
  }
  return workspace;
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') {
    return '0'.repeat(40);
  }
  if (typeof value !== 'string' || !REVISION.test(value)) {
    throw new ValidationError('Provider conformance source revision is invalid');
  }
  return value;
}

function normalizeTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new ValidationError(
      'Provider conformance generated_at must be a canonical timestamp'
    );
  }
  return value;
}

function elapsedMilliseconds(startedAt) {
  return Math.round((performance.now() - startedAt) * 1_000) / 1_000;
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const evidence = await runProviderConformanceDrill({
    workspaceDir: process.argv[2]
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

export {
  EVIDENCE_SCHEMA
};
