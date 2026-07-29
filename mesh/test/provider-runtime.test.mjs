import assert from 'node:assert/strict';
import {
  createHash,
  generateKeyPairSync,
  sign
} from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  dirname,
  join
} from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  canonicalJson,
  digestObject,
  sha256
} from '../src/lib/canonical.mjs';
import {
  assertProviderStartupEnvironment,
  prepareProviderRuntime,
  verifyProviderResponse
} from '../src/lib/provider-runtime.mjs';
import { provisionProduction } from '../src/provision-production.mjs';

const MESH_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ADAPTER_PATH = fileURLToPath(
  new URL('../src/file-provider-adapter.mjs', import.meta.url)
);

test('signed secret and policy providers materialize a private exact runtime', async t => {
  const fixture = await providerFixture(t);
  const runtime = await prepareProviderRuntime(fixture.runtimeConfigPath, {
    now: Date.now()
  });
  assert.equal(runtime.receipt.schema, 'axiom-provider-runtime-receipt.v1');
  assert.equal(runtime.receipt.deployment_id, 'provider-test');
  assert.deepEqual(
    Object.keys(runtime.receipt.providers).sort(),
    ['policy', 'secret']
  );
  assert.equal(runtime.receipt.resources.length, 16);
  assert.equal(
    (await readFile(runtime.paths.data_key, 'utf8')).trim(),
    fixture.dataKey
  );
  assert.deepEqual(
    JSON.parse(await readFile(runtime.paths.api_tokens, 'utf8')),
    fixture.principals
  );
  assert.equal(runtime.paths.policy_layers.length, 1);
  assert.equal(
    runtime.environment.AXIOM_POLICY_PATHS,
    JSON.stringify(runtime.paths.policy_layers)
  );
  assert.equal(runtime.environment.AXIOM_PROVIDER_CONFIG, '');
  const receipt = JSON.stringify(runtime.receipt);
  assert.equal(receipt.includes(fixture.dataKey), false);
  assert.equal(receipt.includes(fixture.operatorToken), false);
  assert.equal(receipt.includes('PRIVATE KEY'), false);
  await assert.rejects(
    prepareProviderRuntime(fixture.runtimeConfigPath),
    error => error.code === 'provider_runtime_locked'
  );
  if (process.platform !== 'win32') {
    assert.equal((await stat(runtime.session_path)).mode & 0o077, 0);
    for (const path of Object.values(runtime.paths.by_alias)) {
      assert.equal((await stat(path)).mode & 0o077, 0);
    }
  }
  await runtime.cleanup();
  await assert.rejects(
    stat(runtime.session_path),
    error => error.code === 'ENOENT'
  );
  await runtime.cleanup();
  const stalePath = join(fixture.runtimeDirectory, 'session-stale');
  await mkdir(stalePath, { mode: 0o700 });
  await assert.rejects(
    prepareProviderRuntime(fixture.runtimeConfigPath),
    error => error.code === 'provider_runtime_not_empty'
  );
  assert.deepEqual(await readdir(fixture.runtimeDirectory), ['session-stale']);
  await rm(stalePath, { recursive: true, force: true });
});

test('provider startup rejects ambiguous direct credentials', async t => {
  const fixture = await providerFixture(t);
  assert.equal(
    assertProviderStartupEnvironment({
      AXIOM_PROVIDER_CONFIG: fixture.runtimeConfigPath
    }),
    fixture.runtimeConfigPath
  );
  assert.throws(
    () => assertProviderStartupEnvironment({
      AXIOM_PROVIDER_CONFIG: fixture.runtimeConfigPath,
      AXIOM_DATA_KEY_FILE: fixture.provisioned.data_key_file
    }),
    /AXIOM_DATA_KEY_FILE must be unset/
  );
});

test('provider signing identity mismatch fails before materialization', async t => {
  const fixture = await providerFixture(t);
  const rogue = generateKeyPairSync('ed25519');
  const roguePublicPath = join(fixture.workspace, 'rogue-provider.pub.pem');
  await privateWrite(
    roguePublicPath,
    rogue.publicKey.export({ type: 'spki', format: 'pem' })
  );
  const config = JSON.parse(
    await readFile(fixture.runtimeConfigPath, 'utf8')
  );
  config.providers.policy.public_key_files = [roguePublicPath];
  const mismatchedPath = join(fixture.workspace, 'runtime-mismatched.json');
  await privateWrite(mismatchedPath, `${canonicalJson(config)}\n`);
  await assert.rejects(
    prepareProviderRuntime(mismatchedPath),
    error => error.code === 'provider_signature_invalid'
  );
  assert.deepEqual(await readdir(fixture.runtimeDirectory), []);
});

test('provider artifact drift fails before executing the adapter', async t => {
  const fixture = await providerFixture(t);
  const config = JSON.parse(
    await readFile(fixture.runtimeConfigPath, 'utf8')
  );
  config.providers.secret.artifacts[1].sha256 = 'f'.repeat(64);
  const driftedPath = join(fixture.workspace, 'runtime-drifted.json');
  await privateWrite(driftedPath, `${canonicalJson(config)}\n`);
  await assert.rejects(
    prepareProviderRuntime(driftedPath),
    error => error.code === 'provider_artifact_digest_invalid'
  );
  assert.deepEqual(await readdir(fixture.runtimeDirectory), []);
});

test('provider response freshness and exact inventory fail closed', () => {
  const now = Date.parse('2026-07-29T12:00:00.000Z');
  const pair = generateKeyPairSync('ed25519');
  const keyDigest = sha256(
    pair.publicKey.export({ type: 'spki', format: 'der' })
  );
  const provider = {
    provider_id: 'manual-provider',
    public_keys: [pair.publicKey],
    public_key_digests: [keyDigest]
  };
  const expectations = [{
    alias: 'policy.0',
    resource_id: 'policy/base',
    classification: 'policy',
    media_type: 'application/vnd.axiom.policy+json',
    maximum_bytes: 1_024
  }];
  const request = {
    schema: 'axiom-provider-request.v1',
    provider_id: provider.provider_id,
    deployment_id: 'manual-deployment',
    request_id: 'provider-request-manual',
    nonce: 'a'.repeat(43),
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + 30_000).toISOString(),
    resources: expectations.map(item => ({
      alias: item.alias,
      resource_id: item.resource_id,
      classification: item.classification,
      media_type: item.media_type,
      maximum_bytes: item.maximum_bytes
    }))
  };
  const content = Buffer.from('{"version":"manual","actions":{}}');
  const unsigned = {
    schema: 'axiom-provider-response.v1',
    provider_id: provider.provider_id,
    deployment_id: request.deployment_id,
    request_id: request.request_id,
    request_digest: digestObject(request),
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + 20_000).toISOString(),
    resources: [{
      alias: 'policy.0',
      resource_id: 'policy/base',
      version: `sha256:${sha256(content)}`,
      media_type: 'application/vnd.axiom.policy+json',
      content_base64: content.toString('base64url'),
      bytes: content.length,
      sha256: sha256(content)
    }]
  };
  const response = signedProviderResponse(unsigned, pair.privateKey);
  assert.equal(verifyProviderResponse({
    response,
    request,
    provider,
    expectations,
    now
  }).signing_key_digest, keyDigest);

  const expired = structuredClone(response);
  expired.issued_at = new Date(now - 120_000).toISOString();
  expired.expires_at = new Date(now - 60_000).toISOString();
  assert.throws(
    () => verifyProviderResponse({
      response: expired,
      request,
      provider,
      expectations,
      now
    }),
    error => error.code === 'provider_response_expired'
  );

  const missing = signedProviderResponse({
    ...unsigned,
    resources: []
  }, pair.privateKey);
  assert.throws(
    () => verifyProviderResponse({
      response: missing,
      request,
      provider,
      expectations,
      now
    }),
    error => error.code === 'provider_resource_set_invalid'
  );
});

async function providerFixture(t) {
  const workspace = await mkdtemp(join(tmpdir(), 'axiom-provider-runtime-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
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
    join(workspace, 'secret-provider'),
    'secret-provider'
  );
  const policyIdentity = await providerIdentity(
    join(workspace, 'policy-provider'),
    'policy-provider'
  );
  const secretAdapterPath = join(workspace, 'secret-adapter.json');
  const policyAdapterPath = join(workspace, 'policy-adapter.json');
  await privateWrite(secretAdapterPath, `${canonicalJson({
    schema: 'axiom-file-provider-adapter.v1',
    provider_id: 'secret-provider',
    private_key_file: secretIdentity.privatePath,
    public_key_file: secretIdentity.publicPath,
    resources: secretResources(provisioned)
  })}\n`);
  await privateWrite(policyAdapterPath, `${canonicalJson({
    schema: 'axiom-file-provider-adapter.v1',
    provider_id: 'policy-provider',
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
  await privateWrite(runtimeConfigPath, `${canonicalJson({
    schema: 'axiom-provider-runtime-config.v1',
    deployment_id: 'provider-test',
    runtime_directory: runtimeDirectory,
    providers: {
      secret: providerConfig({
        providerId: 'secret-provider',
        publicKeyPath: secretIdentity.publicPath,
        adapterConfigPath: secretAdapterPath,
        executableDigest,
        adapterDigest,
        adapterConfigDigest: await fileDigest(secretAdapterPath)
      }),
      policy: providerConfig({
        providerId: 'policy-provider',
        publicKeyPath: policyIdentity.publicPath,
        adapterConfigPath: policyAdapterPath,
        executableDigest,
        adapterDigest,
        adapterConfigDigest: await fileDigest(policyAdapterPath)
      })
    },
    resources: resourceBindings()
  })}\n`);
  const principals = JSON.parse(
    await readFile(provisioned.api_tokens_file, 'utf8')
  );
  const operatorToken = (
    await readFile(provisioned.operator_token_file, 'utf8')
  ).trim();
  return {
    workspace,
    runtimeDirectory,
    runtimeConfigPath,
    provisioned,
    policyPath,
    capabilitiesPath,
    principals,
    operatorToken,
    dataKey: (
      await readFile(provisioned.data_key_file, 'utf8')
    ).trim()
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
      services: Object.fromEntries([
        'gateway',
        'grid',
        'hypervisor',
        'sandbox',
        'supervisor'
      ].map(service => [service, {
        certificate: `secret/transport/${service}/certificate`,
        private_key: `secret/transport/${service}/private-key`
      }]))
    },
    policy_layers: ['policy/base'],
    capabilities: 'policy/capabilities'
  };
}

function providerConfig({
  providerId,
  publicKeyPath,
  adapterConfigPath,
  executableDigest,
  adapterDigest,
  adapterConfigDigest
}) {
  return {
    provider_id: providerId,
    executable: process.execPath,
    executable_sha256: executableDigest,
    arguments: [ADAPTER_PATH, adapterConfigPath],
    artifacts: [
      { path: ADAPTER_PATH, sha256: adapterDigest },
      { path: adapterConfigPath, sha256: adapterConfigDigest }
    ],
    public_key_files: [publicKeyPath],
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
  const privatePath = join(directory, `${providerId}.private.pem`);
  const publicPath = join(directory, `${providerId}.public.pem`);
  await privateWrite(
    privatePath,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' })
  );
  await privateWrite(
    publicPath,
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
  return { privatePath, publicPath };
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

function signedProviderResponse(unsigned, privateKey) {
  const body = canonicalJson(unsigned);
  return {
    ...unsigned,
    signature: {
      algorithm: 'Ed25519',
      key_id: 'manual-provider:test',
      digest: sha256(body),
      signature: sign(
        null,
        Buffer.from(body),
        privateKey
      ).toString('base64url')
    }
  };
}
