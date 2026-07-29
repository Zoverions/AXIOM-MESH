import {
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign
} from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  writeFile
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  digestObject,
  ValidationError,
  sha256
} from './lib/canonical.mjs';
import { ensureMeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import {
  applyOnlineCausalSyncBundle,
  loadOnlineCausalSyncRuntime,
  pollOnlineCausalSync
} from './lib/online-causal-sync.mjs';
import {
  productionHostEnvironment,
  reserveProductionPortBlock,
  startProductionHost,
  stopProductionHost
} from './lib/production-host.mjs';
import { provisionProduction } from './provision-production.mjs';

const EVIDENCE_SCHEMA = 'axiom-online-causal-sync-drill-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;
const OWNER = 'production-operator';

export async function runOnlineCausalSyncDrill({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString()
} = {}) {
  const revision = normalizeRevision(sourceRevision);
  const generated = normalizeTimestamp(generatedAt);
  const workspace = await prepareDisposableWorkspace(workspaceDir);
  const startedAt = performance.now();
  const [sourceLease, destinationLease] = await Promise.all([
    reserveProductionPortBlock('online causal source drill'),
    reserveProductionPortBlock('online causal destination drill')
  ]);
  let sourceHost;
  let destinationHost;
  try {
    const source = await provisionSite(workspace, 'source');
    const destination = await provisionSite(workspace, 'destination');
    const sourceGateway = `http://127.0.0.1:${sourceLease.base_port}`;
    const destinationGateway = `http://127.0.0.1:${destinationLease.base_port}`;
    [sourceHost, destinationHost] = await Promise.all([
      startProductionHost({
        environment: productionHostEnvironment(source.provisioned, sourceLease.base_port),
        gateway: sourceGateway,
        drill: 'online causal source'
      }),
      startProductionHost({
        environment: productionHostEnvironment(
          destination.provisioned,
          destinationLease.base_port
        ),
        gateway: destinationGateway,
        drill: 'online causal destination'
      })
    ]);

    const nodeA = signedNode('node:online-a');
    const nodeB = signedNode('node:online-b');
    for (const site of [
      { gateway: sourceGateway, token: source.operatorToken },
      { gateway: destinationGateway, token: destination.operatorToken }
    ]) {
      await submitIntent(site.gateway, site.token, {
        action: 'node.register',
        input: nodeA.admission
      });
      await submitIntent(site.gateway, site.token, {
        action: 'node.register',
        input: nodeB.admission
      });
    }

    const sourceToDestination = await relayDirection({
      workspace,
      name: 'source-to-destination',
      source,
      destination,
      sourceGateway,
      destinationGateway
    });
    const destinationToSource = await relayDirection({
      workspace,
      name: 'destination-to-source',
      source: destination,
      destination: source,
      sourceGateway: destinationGateway,
      destinationGateway: sourceGateway
    });

    const baseline = signedBundle(nodeA, {
      counter: 1,
      vector: { [nodeA.nodeId]: 1 },
      value: { state: 'baseline' },
      nonce: 'online-baseline'
    });
    await approvedSync(
      sourceGateway,
      source.operatorToken,
      source.approverToken,
      baseline
    );
    const firstStage = await pollOnlineCausalSync(
      sourceToDestination.runtime,
      { fetchImpl: fetch }
    );
    const firstApproval = await grantRelayApproval({
      gateway: destinationGateway,
      approverToken: destination.approverToken,
      pending: firstStage.pending[0]
    });
    sourceToDestination.approvalsGranted += 1;
    await applyOnlineCausalSyncBundle(sourceToDestination.runtime, {
      bundleDigest: firstStage.pending[0].bundle_digest,
      approvalId: firstApproval,
      fetchImpl: fetch
    });
    const reverseBaseline = await pollOnlineCausalSync(
      destinationToSource.runtime,
      { fetchImpl: fetch }
    );

    const sourceCursorBeforePartition = (
      await pollOnlineCausalSync(sourceToDestination.runtime, { fetchImpl: fetch })
    ).source_cursor;
    const destinationCursorBeforePartition = reverseBaseline.source_cursor;
    const sourceDivergence = signedBundle(nodeA, {
      counter: 2,
      vector: { [nodeA.nodeId]: 2 },
      value: { state: 'source partition head' },
      nonce: 'online-source-partition'
    });
    const destinationDivergence = signedBundle(nodeB, {
      counter: 1,
      vector: {
        [nodeA.nodeId]: 1,
        [nodeB.nodeId]: 1
      },
      value: { state: 'destination partition head' },
      nonce: 'online-destination-partition'
    });
    await approvedSync(
      sourceGateway,
      source.operatorToken,
      source.approverToken,
      sourceDivergence
    );
    await approvedSync(
      destinationGateway,
      destination.operatorToken,
      destination.approverToken,
      destinationDivergence
    );

    const blockedOrigins = new Set([sourceGateway, destinationGateway]);
    const partitionFetch = async (url, options) => {
      const target = new URL(url);
      if (
        blockedOrigins.has(target.origin)
        && target.pathname === '/v1/events'
      ) {
        throw new Error('controlled online sync partition');
      }
      return fetch(url, options);
    };
    const partitionAt = Date.now();
    const sourcePartition = await pollOnlineCausalSync(
      sourceToDestination.runtime,
      { fetchImpl: partitionFetch, now: partitionAt }
    );
    const destinationPartition = await pollOnlineCausalSync(
      destinationToSource.runtime,
      { fetchImpl: partitionFetch, now: partitionAt }
    );

    const rejoinAt = partitionAt + 1_000;
    const sourceRejoin = await pollOnlineCausalSync(
      sourceToDestination.runtime,
      { fetchImpl: fetch, now: rejoinAt }
    );
    const destinationRejoin = await pollOnlineCausalSync(
      destinationToSource.runtime,
      { fetchImpl: fetch, now: rejoinAt }
    );
    const reloadedSourceToDestination = await loadOnlineCausalSyncRuntime(
      sourceToDestination.configPath,
      { allowInsecureLoopback: true }
    );
    const reloadedDestinationToSource = await loadOnlineCausalSyncRuntime(
      destinationToSource.configPath,
      { allowInsecureLoopback: true }
    );
    await approveAndApplyRelay({
      relay: sourceToDestination,
      runtime: reloadedSourceToDestination,
      gateway: destinationGateway,
      approverToken: destination.approverToken,
      pending: sourceRejoin.pending[0]
    });
    await approveAndApplyRelay({
      relay: destinationToSource,
      runtime: reloadedDestinationToSource,
      gateway: sourceGateway,
      approverToken: source.approverToken,
      pending: destinationRejoin.pending[0]
    });

    const sourceConflict = await api(
      sourceGateway,
      source.operatorToken,
      '/v1/sync?record_id=record:online'
    );
    const destinationConflict = await api(
      destinationGateway,
      destination.operatorToken,
      '/v1/sync?record_id=record:online'
    );
    const sourceHeads = sourceConflict.records[0].heads
      .map(head => head.update_id)
      .sort();
    const resolution = signedBundle(nodeA, {
      counter: 3,
      vector: {
        [nodeA.nodeId]: 3,
        [nodeB.nodeId]: 1
      },
      value: { state: 'explicitly merged' },
      nonce: 'online-explicit-resolution',
      resolves: sourceHeads
    });
    await approvedSync(
      sourceGateway,
      source.operatorToken,
      source.approverToken,
      resolution
    );
    const resolutionStage = await pollOnlineCausalSync(
      reloadedSourceToDestination,
      { fetchImpl: fetch }
    );
    await approveAndApplyRelay({
      relay: sourceToDestination,
      runtime: reloadedSourceToDestination,
      gateway: destinationGateway,
      approverToken: destination.approverToken,
      pending: resolutionStage.pending[0]
    });

    const [sourceConverged, destinationConverged] = await Promise.all([
      api(
        sourceGateway,
        source.operatorToken,
        '/v1/sync?record_id=record:online'
      ),
      api(
        destinationGateway,
        destination.operatorToken,
        '/v1/sync?record_id=record:online'
      )
    ]);
    const duplicateDirection = await relayDirection({
      workspace,
      name: 'duplicate-source-to-destination',
      source,
      destination,
      sourceGateway,
      destinationGateway
    });
    const duplicateReplay = await pollOnlineCausalSync(
      duplicateDirection.runtime,
      { fetchImpl: fetch }
    );

    const checks = {
      two_real_production_stacks_ready: (
        sourceHost.processes.length === 4
        && destinationHost.processes.length === 4
      ),
      source_grid_events_pinned_and_verified: (
        firstStage.source_grid_key_digest === source.gridKeyDigest
        && firstStage.pending_count === 1
      ),
      encrypted_queue_survived_runtime_reload: (
        sourceRejoin.pending_count === 1
        && destinationRejoin.pending_count === 1
      ),
      partition_preserved_both_cursors: (
        sourcePartition.outcome === 'failed'
        && destinationPartition.outcome === 'failed'
        && sourcePartition.source_cursor === sourceCursorBeforePartition
        && destinationPartition.source_cursor === destinationCursorBeforePartition
      ),
      rejoin_replayed_both_directions: (
        sourceRejoin.pending_count === 1
        && destinationRejoin.pending_count === 1
      ),
      exact_independent_approval_applied_each_bundle: (
        sourceToDestination.approvalsGranted === 3
        && destinationToSource.approvalsGranted === 1
      ),
      concurrent_heads_visible_on_both_grids: (
        sourceConflict.conflicts === 1
        && destinationConflict.conflicts === 1
        && sourceConflict.records[0].heads.length === 2
        && destinationConflict.records[0].heads.length === 2
      ),
      explicit_all_head_resolution_converged: (
        sourceConverged.conflicts === 0
        && destinationConverged.conflicts === 0
        && sourceConverged.records[0].heads.length === 1
        && destinationConverged.records[0].heads.length === 1
        && sourceConverged.records[0].heads[0].value.state === 'explicitly merged'
        && destinationConverged.records[0].heads[0].value.state === 'explicitly merged'
        && sourceConverged.records[0].heads[0].update_id
          === destinationConverged.records[0].heads[0].update_id
      ),
      duplicate_delivery_absorbed_before_approval: (
        duplicateReplay.pending_count === 0
        && duplicateReplay.receipts.length >= 4
        && duplicateReplay.receipts.every(
          receipt => receipt.outcome === 'already_present'
        )
        && duplicateDirection.approvalsGranted === 0
      )
    };
    const failed = Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    if (failed.length) {
      throw new ValidationError(
        `Online causal sync drill checks failed: ${failed.join(', ')}`
      );
    }

    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    );
    const signingIdentity = await ensureMeshIdentity(
      source.provisioned.data_dir,
      'grid',
      { create: false }
    );
    const unsigned = {
      schema: EVIDENCE_SCHEMA,
      status: 'passed',
      generated_at: generated,
      source: {
        kernel_version: packageJson.version,
        revision
      },
      profile: {
        exchange_mode: 'bidirectional operator-approved relay',
        source_authentication: 'pinned Grid Ed25519 event evidence',
        transport: 'exact HTTPS origins; controlled loopback only in drill',
        state_protection: 'AES-256-GCM encrypted atomic state',
        conflict_policy: 'visible concurrent heads; explicit all-head resolution',
        consensus_claimed: false,
        automatic_authority_claimed: false
      },
      execution: {
        disposable_workspace: true,
        production_supervisors: 2,
        production_service_processes: 8,
        controlled_partition: true,
        total_duration_ms: elapsedMilliseconds(startedAt),
        node: process.version,
        platform: process.platform,
        architecture: process.arch
      },
      observations: {
        source_cursor_before_partition: sourceCursorBeforePartition,
        destination_cursor_before_partition: destinationCursorBeforePartition,
        source_cursor_after_rejoin: sourceRejoin.source_cursor,
        destination_cursor_after_rejoin: destinationRejoin.source_cursor,
        conflict_heads_per_grid: 2,
        final_heads_per_grid: 1,
        duplicate_receipts: duplicateReplay.receipts.length
      },
      signer: {
        service: 'grid',
        key_id: signingIdentity.keyId,
        public_key_pem: String(signingIdentity.publicKey.export({
          type: 'spki',
          format: 'pem'
        }))
      },
      checks,
      limitations: [
        'the relay stages signed causal bundles but cannot grant or bypass destination approval',
        'the drill injects a controlled application-transport partition on one host rather than claiming wide-area network conditions',
        'the protocol converges one owner namespace and is not replicated Grid consensus, leader election, or BFT',
        'pilot promotion still requires independently operated hosts, external identity custody, latency and clock-fault measurements, and an independent security review'
      ]
    };
    const evidence = {
      ...unsigned,
      attestation: signingIdentity.signObject(unsigned)
    };
    verifyOnlineCausalSyncDrillEvidence(evidence);
    await assertNoSecrets(evidence, [source, destination]);
    return evidence;
  } finally {
    await Promise.all([
      sourceHost ? stopProductionHost(sourceHost.child) : undefined,
      destinationHost ? stopProductionHost(destinationHost.child) : undefined
    ]);
    await Promise.all([
      sourceLease.release(),
      destinationLease.release()
    ]);
  }
}

export function verifyOnlineCausalSyncDrillEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || evidence.profile?.consensus_claimed !== false
    || evidence.profile?.automatic_authority_claimed !== false
    || evidence.execution?.production_supervisors !== 2
    || evidence.execution?.production_service_processes !== 8
    || evidence.observations?.conflict_heads_per_grid !== 2
    || evidence.observations?.final_heads_per_grid !== 1
    || (
      evidence.source?.revision !== null
      && !REVISION.test(evidence.source?.revision ?? '')
    )
    || !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
  ) {
    throw new ValidationError(
      'Online causal sync drill evidence metadata or checks are invalid'
    );
  }
  if (
    evidence.signer?.service !== 'grid'
    || typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
  ) {
    throw new ValidationError('Online causal sync drill signer metadata is invalid');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Online causal sync drill signer public key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Online causal sync drill signer is not Ed25519');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Online causal sync drill attestation is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    source_revision: evidence.source.revision,
    duplicate_receipts: evidence.observations.duplicate_receipts
  };
}

async function provisionSite(workspace, name) {
  const provisioned = await provisionProduction({
    dataDir: join(workspace, name, 'data'),
    secretDir: join(workspace, name, 'secrets')
  });
  const operatorToken = (
    await readFile(provisioned.operator_token_file, 'utf8')
  ).trim();
  const approverToken = randomBytes(32).toString('base64url');
  const registry = JSON.parse(
    await readFile(provisioned.api_tokens_file, 'utf8')
  );
  registry[approverToken] = {
    id: 'production-approver',
    type: 'human',
    roles: ['independent-approver'],
    scopes: ['approval:write']
  };
  await writeFile(
    provisioned.api_tokens_file,
    `${canonicalJson(registry)}\n`,
    { mode: 0o600 }
  );
  const approverTokenPath = join(provisioned.secret_dir, 'approver.token');
  await writeFile(approverTokenPath, `${approverToken}\n`, { mode: 0o600 });
  const gridPublicKeyPath = join(
    provisioned.data_dir,
    'identities',
    'grid',
    'public.pem'
  );
  const gridPublicKey = await readFile(gridPublicKeyPath, 'utf8');
  return {
    name,
    provisioned,
    operatorToken,
    approverToken,
    approverTokenPath,
    gridPublicKeyPath,
    gridKeyDigest: sha256(gridPublicKey)
  };
}

async function relayDirection({
  workspace,
  name,
  source,
  destination,
  sourceGateway,
  destinationGateway
}) {
  const root = join(workspace, 'relays', name);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stateKeyPath = join(root, 'state.key');
  const statePath = join(root, 'state.enc');
  const configPath = join(root, 'config.json');
  await writeFile(
    stateKeyPath,
    `${randomBytes(32).toString('base64url')}\n`,
    { mode: 0o600 }
  );
  await writeFile(configPath, `${canonicalJson({
    schema: 'axiom-online-causal-sync-config.v1',
    owner: OWNER,
    source: {
      origin: sourceGateway,
      token_file: source.provisioned.operator_token_file,
      grid_public_key_file: source.gridPublicKeyPath
    },
    destination: {
      origin: destinationGateway,
      token_file: destination.provisioned.operator_token_file
    },
    state_file: statePath,
    state_key_file: stateKeyPath,
    poll_interval_ms: 1_000,
    request_timeout_ms: 8_000,
    retry: {
      base_ms: 1_000,
      maximum_ms: 8_000,
      maximum_attempts: 4
    }
  })}\n`, { mode: 0o600 });
  return {
    configPath,
    stateKeyPath,
    statePath,
    approvalsGranted: 0,
    runtime: await loadOnlineCausalSyncRuntime(configPath, {
      allowInsecureLoopback: true
    })
  };
}

async function approveAndApplyRelay({
  relay,
  runtime,
  gateway,
  approverToken,
  pending
}) {
  if (!pending) {
    throw new ValidationError('Expected an online causal bundle awaiting approval');
  }
  const approvalId = await grantRelayApproval({
    gateway,
    approverToken,
    pending
  });
  relay.approvalsGranted += 1;
  const status = await applyOnlineCausalSyncBundle(runtime, {
    bundleDigest: pending.bundle_digest,
    approvalId,
    fetchImpl: fetch
  });
  return status;
}

async function grantRelayApproval({ gateway, approverToken, pending }) {
  const approval = await submitIntent(gateway, approverToken, {
    action: 'approval.grant',
    input: {
      requester: OWNER,
      action: 'sync.apply',
      request_digest: pending.request_digest,
      expires_at: new Date(Date.now() + 60_000).toISOString()
    }
  });
  return approval.approval_id;
}

async function approvedSync(gateway, requesterToken, approverToken, bundle) {
  const approvalNeeded = await api(
    gateway,
    requesterToken,
    '/v1/intents',
    {
      method: 'POST',
      idempotencyKey: `online-approval-probe-${randomUUID()}`,
      body: {
        action: 'sync.apply',
        input: { bundle },
        confirmations: ['confirm:sync.apply']
      }
    },
    409
  );
  if (approvalNeeded.error?.code !== 'independent_approval_required') {
    throw new ValidationError('Online sync drill did not require independent approval');
  }
  const approval = await submitIntent(gateway, approverToken, {
    action: 'approval.grant',
    input: {
      requester: OWNER,
      action: 'sync.apply',
      request_digest: approvalNeeded.error.details.request_digest,
      expires_at: new Date(Date.now() + 60_000).toISOString()
    }
  });
  return submitIntent(gateway, requesterToken, {
    action: 'sync.apply',
    input: { bundle },
    confirmations: ['confirm:sync.apply'],
    approval_ids: [approval.approval_id]
  });
}

async function submitIntent(gateway, token, body) {
  return api(gateway, token, '/v1/intents', {
    method: 'POST',
    idempotencyKey: `online-drill-${randomUUID()}`,
    body
  });
}

async function api(
  gateway,
  token,
  path,
  {
    method = 'GET',
    idempotencyKey,
    body
  } = {},
  expectedStatus = 200
) {
  const response = await fetch(`${gateway}${path}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body === undefined ? {} : {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey ?? `online-drill-${randomUUID()}`
      })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  if (response.status !== expectedStatus) {
    throw new ValidationError(
      `Online sync drill API expected ${expectedStatus}, received `
      + `${response.status}: ${payload?.error?.code ?? 'unknown'}`
    );
  }
  return payload;
}

function signedNode(nodeId) {
  const keys = generateKeyPairSync('ed25519');
  const publicKey = String(keys.publicKey.export({
    type: 'spki',
    format: 'pem'
  }));
  const statement = {
    format: 'axiom-node-admission.v1',
    node_id: nodeId,
    public_key: publicKey,
    security_profile: 'S2_HARDENED',
    capabilities: ['offline.causal-sync'],
    software_digest: sha256(`online-drill:${nodeId}`),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    nonce: `online-admission:${nodeId}`
  };
  return {
    nodeId,
    keys,
    publicKey,
    admission: {
      ...statement,
      signature: sign(
        null,
        Buffer.from(canonicalJson(statement)),
        keys.privateKey
      ).toString('base64url')
    }
  };
}

function signedBundle(node, {
  counter,
  vector,
  value,
  nonce,
  resolves = []
}) {
  const occurredAt = new Date().toISOString();
  const updateStatement = {
    format: 'axiom-causal-update.v1',
    owner: OWNER,
    node_id: node.nodeId,
    namespace: 'operator-notes',
    record_id: 'record:online',
    operation: 'put',
    value,
    value_digest: digestObject(value),
    vector,
    resolves: [...resolves].sort(),
    occurred_at: occurredAt,
    nonce: `${nonce}-update-${counter}`
  };
  const update = {
    ...updateStatement,
    public_key: node.publicKey,
    signature: sign(
      null,
      Buffer.from(canonicalJson(updateStatement)),
      node.keys.privateKey
    ).toString('base64url')
  };
  const statement = {
    format: 'axiom-causal-sync-bundle.v1',
    owner: OWNER,
    source_node_id: node.nodeId,
    updates: [update],
    created_at: occurredAt,
    nonce: `${nonce}-bundle-${counter}`
  };
  return {
    ...statement,
    public_key: node.publicKey,
    signature: sign(
      null,
      Buffer.from(canonicalJson(statement)),
      node.keys.privateKey
    ).toString('base64url')
  };
}

async function assertNoSecrets(evidence, sites) {
  const serialized = canonicalJson(evidence);
  const secrets = [];
  for (const site of sites) {
    secrets.push(
      site.operatorToken,
      site.approverToken,
      (await readFile(site.provisioned.data_key_file, 'utf8')).trim(),
      await readFile(
        join(
          site.provisioned.data_dir,
          'identities',
          'grid',
          'private.pem'
        ),
        'utf8'
      )
    );
  }
  if (
    secrets.some(secret => serialized.includes(secret))
    || /PRIVATE KEY|authorization:\s*bearer|operator\.token|approver\.token/i.test(
      serialized
    )
  ) {
    throw new ValidationError('Online causal sync drill evidence contains secrets');
  }
}

async function prepareDisposableWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(
      'Online causal sync drill requires an explicit disposable workspace'
    );
  }
  const workspace = resolve(value);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length !== 0) {
    throw new ValidationError(
      'Online causal sync drill workspace must be empty'
    );
  }
  return workspace;
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !REVISION.test(value)) {
    throw new ValidationError(
      'Online causal sync drill revision must be a 40-character SHA'
    );
  }
  return value;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError('Online causal sync drill timestamp is invalid');
  }
  return new Date(value).toISOString();
}

function elapsedMilliseconds(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 3) {
    throw new ValidationError(
      'Usage: node src/online-causal-sync-drill.mjs '
      + '<empty-disposable-workspace>'
    );
  }
  const evidence = await runOnlineCausalSyncDrill({
    workspaceDir: process.argv[2]
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

export { EVIDENCE_SCHEMA };
