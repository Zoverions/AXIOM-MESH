import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  ValidationError,
  sha256
} from './lib/canonical.mjs';
import { ensureMeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import { normalizeNodeScheduleRequest } from './lib/node-scheduling.mjs';
import { verifyNodeAdmission } from './lib/nodes.mjs';
import { loadDataProtector } from './lib/protector.mjs';
import { GridStore } from './grid/store.mjs';

const EVIDENCE_SCHEMA = 'axiom-node-scheduling-drill-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;

export async function runNodeSchedulingDrill({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString()
} = {}) {
  const revision = normalizeRevision(sourceRevision);
  const generated = normalizeTimestamp(generatedAt);
  const workspace = await prepareDisposableWorkspace(workspaceDir);
  const startedAt = performance.now();
  const dataDir = join(workspace, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({
    dataDir,
    autoBootstrap: true
  });
  const databasePath = join(dataDir, 'grid.sqlite');
  let store = new GridStore({
    path: databasePath,
    dataDir,
    identity,
    protector
  });
  try {
    const nodeA = signedNode({
      nodeId: 'node:drill-a',
      owner: 'owner:drill-a',
      endpoint: 'https://drill-a.mesh.invalid',
      failureDomain: 'zone:a',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString()
    });
    const nodeB = signedNode({
      nodeId: 'node:drill-b',
      owner: 'owner:drill-b',
      endpoint: 'https://drill-b.mesh.invalid',
      failureDomain: 'zone:b',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString()
    });
    const partitioned = signedNode({
      nodeId: 'node:partitioned',
      owner: 'owner:partitioned',
      endpoint: 'https://partitioned.mesh.invalid',
      failureDomain: 'zone:c',
      expiresAt: new Date(Date.now() + 30_000).toISOString()
    });
    for (const node of [nodeA, nodeB, partitioned]) {
      appendAdmission(store, node);
    }

    let duplicateIdentityRejected = false;
    try {
      appendAdmission(store, signedNode({
        nodeId: 'node:sybil-copy',
        owner: 'owner:sybil-copy',
        endpoint: 'https://sybil-copy.mesh.invalid',
        failureDomain: 'zone:d',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        keys: nodeA.keys
      }));
    } catch (error) {
      duplicateIdentityRejected = error?.code === 'node_identity_conflict';
    }

    const initialDiscovery = store.discoverNodes({
      required_capabilities: ['compute.batch'],
      required_roles: ['compute'],
      minimum_security_level: 2,
      minimum_lease_seconds: 5,
      limit: 10
    });
    const normalized = normalizeNodeScheduleRequest({
      request_id: 'drill-primary-placement',
      required_capabilities: ['compute.batch'],
      required_roles: ['compute'],
      minimum_security_level: 2,
      resources: {
        cpu_millis: 750,
        memory_bytes: 1_024,
        storage_bytes: 0
      },
      replicas: 2,
      lease_seconds: 300,
      distinct_failure_domains: true,
      max_per_owner: 1
    }, 'owner:scheduler');
    appendSchedule(store, normalized, 'trace_schedule_primary');
    const active = store.getNodeSchedule(
      normalized.schedule_id,
      normalized.requester
    );

    let resourceExhaustionRejected = false;
    const exhausted = normalizeNodeScheduleRequest({
      ...normalized.request,
      request_id: 'drill-resource-exhaustion',
      replicas: 1,
      max_per_owner: 1
    }, normalized.requester);
    try {
      appendSchedule(store, exhausted, 'trace_schedule_exhaustion');
    } catch (error) {
      resourceExhaustionRejected = (
        error?.code === 'schedule_capacity_unavailable'
      );
    }

    const quarantinedNode = active.placements[0].node_id;
    store.appendEvents({
      traceId: 'trace_schedule_quarantine',
      actor: 'owner:security',
      events: [{
        kind: 'node.quarantined',
        subject: quarantinedNode,
        payload: {
          node_id: quarantinedNode,
          quarantined_by: 'owner:security',
          reason: 'Controlled scheduling drill quarantine'
        }
      }]
    });
    const degraded = store.getNodeSchedule(
      normalized.schedule_id,
      normalized.requester
    );
    const partitionAsOf = new Date(Date.now() + 60_000).toISOString();
    const postPartitionDiscovery = store.discoverNodes({
      required_capabilities: ['compute.batch'],
      required_roles: ['compute'],
      minimum_security_level: 2,
      limit: 10
    }, { asOf: partitionAsOf });
    const expiredSchedule = store.getNodeSchedule(
      normalized.schedule_id,
      normalized.requester,
      {
        asOf: new Date(
          Date.parse(active.expires_at) + 1_000
        ).toISOString()
      }
    );
    const evidenceHead = store.verifyChain().head;
    store.close();
    store = null;

    store = new GridStore({
      path: databasePath,
      dataDir,
      identity,
      protector
    });
    const restarted = store.getNodeSchedule(
      normalized.schedule_id,
      normalized.requester
    );
    const checks = {
      signed_v2_admissions_verified: initialDiscovery.count === 3,
      duplicate_signing_identity_rejected: duplicateIdentityRejected,
      deterministic_complete_placement: (
        active.status === 'active'
        && active.placements.length === 2
      ),
      distinct_failure_domains_selected: (
        new Set(active.placements.map(item => item.failure_domain)).size === 2
      ),
      distinct_authenticated_owners_selected: (
        new Set(active.placements.map(item => item.owner)).size === 2
      ),
      bounded_resource_exhaustion_rejected: resourceExhaustionRejected,
      quarantine_degraded_existing_schedule: degraded.status === 'degraded',
      quarantined_node_removed_from_discovery: (
        !postPartitionDiscovery.nodes.some(
          node => node.node_id === quarantinedNode
        )
      ),
      missed_renewal_partition_expired: (
        !postPartitionDiscovery.nodes.some(
          node => node.node_id === 'node:partitioned'
        )
      ),
      schedule_lease_expired: expiredSchedule.status === 'expired',
      restart_preserved_schedule_and_evidence: (
        restarted.status === 'degraded'
        && store.verifyChain().head === evidenceHead
      )
    };
    const failed = Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    if (failed.length) {
      throw new ValidationError(
        `Node scheduling drill checks failed: ${failed.join(', ')}`
      );
    }
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
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
        admission_format: 'axiom-node-admission.v2',
        discovery_format: 'axiom-node-discovery.v1',
        schedule_format: 'axiom-node-schedule.v1',
        maximum_active_nodes_per_owner: 64,
        placement_mode: 'deterministic lease reservation',
        remote_execution_authorized: false
      },
      execution: {
        disposable_workspace: true,
        encrypted_grid_state: true,
        evidence_chain_rebuilt_on_restart: true,
        total_duration_ms: elapsedMilliseconds(startedAt),
        node: process.version,
        platform: process.platform,
        architecture: process.arch
      },
      signer: {
        service: 'grid',
        key_id: identity.keyId,
        public_key_pem: String(identity.publicKey.export({
          type: 'spki',
          format: 'pem'
        }))
      },
      observations: {
        initial_discovered_nodes: initialDiscovery.count,
        scheduled_replicas: active.placements.length,
        scheduled_failure_domains: new Set(
          active.placements.map(item => item.failure_domain)
        ).size,
        post_partition_discovered_nodes: postPartitionDiscovery.count,
        quarantine_schedule_status: degraded.status,
        expired_schedule_status: expiredSchedule.status
      },
      checks,
      limitations: [
        'placement is an authenticated reservation and does not authorize arbitrary remote execution',
        'owner authentication, node-key uniqueness, and per-owner limits reduce but do not solve global human-identity Sybil resistance',
        'partition behavior is lease expiry after missed renewal, not a live wide-area network experiment',
        'multi-host routing, workload transfer, consensus, and replicated Grid remain unimplemented'
      ]
    };
    const evidence = {
      ...unsigned,
      attestation: identity.signObject(unsigned)
    };
    verifyNodeSchedulingDrillEvidence(evidence);
    await assertNoSecrets(evidence, dataDir);
    return evidence;
  } finally {
    store?.close();
  }
}

export function verifyNodeSchedulingDrillEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || evidence.profile?.admission_format !== 'axiom-node-admission.v2'
    || evidence.profile?.schedule_format !== 'axiom-node-schedule.v1'
    || evidence.profile?.remote_execution_authorized !== false
    || (
      evidence.source?.revision !== null
      && !REVISION.test(evidence.source?.revision ?? '')
    )
    || evidence.observations?.scheduled_replicas !== 2
    || evidence.observations?.scheduled_failure_domains !== 2
    || evidence.observations?.quarantine_schedule_status !== 'degraded'
    || evidence.observations?.expired_schedule_status !== 'expired'
    || !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
  ) {
    throw new ValidationError(
      'Node scheduling drill evidence metadata or checks are invalid'
    );
  }
  if (
    evidence.signer?.service !== 'grid'
    || typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
  ) {
    throw new ValidationError('Node scheduling drill signer metadata is invalid');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Node scheduling drill signer public key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Node scheduling drill signer is not Ed25519');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Node scheduling drill attestation is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    source_revision: evidence.source.revision,
    scheduled_replicas: evidence.observations.scheduled_replicas
  };
}

function signedNode({
  nodeId,
  owner,
  endpoint,
  failureDomain,
  expiresAt,
  keys = generateKeyPairSync('ed25519')
}) {
  const publicKey = String(keys.publicKey.export({
    type: 'spki',
    format: 'pem'
  }));
  const statement = {
    format: 'axiom-node-admission.v2',
    node_id: nodeId,
    public_key: publicKey,
    security_profile: 'S2_HARDENED',
    capabilities: ['compute.batch', 'storage.offer'],
    software_digest: sha256(`drill-software:${nodeId}`),
    expires_at: expiresAt,
    nonce: `drill-nonce:${nodeId}`,
    discovery: {
      endpoint,
      failure_domain: failureDomain,
      roles: ['compute'],
      resources: {
        cpu_millis: 1_000,
        memory_bytes: 2_048,
        storage_bytes: 0,
        max_concurrent_assignments: 1
      }
    }
  };
  return {
    owner,
    keys,
    input: {
      ...statement,
      signature: sign(
        null,
        Buffer.from(canonicalJson(statement)),
        keys.privateKey
      ).toString('base64url')
    }
  };
}

function appendAdmission(store, node) {
  const admission = verifyNodeAdmission(node.input);
  store.appendEvents({
    traceId: `trace_${admission.statement.node_id.replaceAll(':', '_')}`,
    actor: node.owner,
    events: [{
      kind: 'node.registered',
      subject: admission.statement.node_id,
      payload: {
        owner: node.owner,
        admission
      }
    }]
  });
}

function appendSchedule(store, normalized, traceId) {
  store.appendEvents({
    traceId,
    actor: normalized.requester,
    events: [{
      kind: 'node.schedule.requested',
      subject: normalized.schedule_id,
      payload: {
        requester: normalized.requester,
        schedule_id: normalized.schedule_id,
        request_digest: normalized.request_digest,
        request: normalized.request
      }
    }]
  });
}

async function assertNoSecrets(evidence, dataDir) {
  const serialized = canonicalJson(evidence);
  const dataKey = (
    await readFile(join(dataDir, 'secrets', 'data-protection.key'), 'utf8')
  ).trim();
  const gridPrivateKey = await readFile(
    join(dataDir, 'identities', 'grid', 'private.pem'),
    'utf8'
  );
  if (
    serialized.includes(dataKey)
    || serialized.includes(gridPrivateKey)
    || /PRIVATE KEY|authorization:\s*bearer|operator\.token/i.test(serialized)
  ) {
    throw new ValidationError('Node scheduling drill evidence contains secrets');
  }
}

async function prepareDisposableWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(
      'Node scheduling drill requires an explicit disposable workspace'
    );
  }
  const workspace = resolve(value);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length !== 0) {
    throw new ValidationError('Node scheduling drill workspace must be empty');
  }
  return workspace;
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !REVISION.test(value)) {
    throw new ValidationError(
      'Node scheduling drill revision must be a 40-character SHA'
    );
  }
  return value;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError('Node scheduling drill timestamp is invalid');
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
      'Usage: node src/node-scheduling-drill.mjs <empty-disposable-workspace>'
    );
  }
  const evidence = await runNodeSchedulingDrill({
    workspaceDir: process.argv[2]
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

export { EVIDENCE_SCHEMA };
