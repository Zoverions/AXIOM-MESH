import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  discoverAdmittedNodes,
  effectiveScheduleStatus,
  normalizeNodeScheduleRequest,
  selectNodePlacements
} from '../src/lib/node-scheduling.mjs';
import {
  verifyNodeAdmission,
  verifyNodeRenewal
} from '../src/lib/nodes.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';
import {
  runNodeSchedulingDrill,
  verifyNodeSchedulingDrillEvidence
} from '../src/node-scheduling-drill.mjs';

const NOW = '2026-07-29T12:00:00.000Z';

test('signed v2 admission binds discovery origin, roles, resources, and domain', () => {
  const node = signedAdmission({
    nodeId: 'node:discovery',
    owner: 'owner:discovery',
    expiresAt: '2026-07-29T13:00:00.000Z',
    endpoint: 'https://node-a.mesh.example:9443',
    failureDomain: 'ca-central-1a'
  });
  const verified = verifyNodeAdmission(node.input, { requireFuture: false });
  assert.equal(verified.statement.format, 'axiom-node-admission.v2');
  assert.equal(
    verified.statement.discovery.endpoint,
    'https://node-a.mesh.example:9443'
  );
  assert.deepEqual(
    verified.statement.discovery.roles,
    ['compute', 'storage']
  );
  assert.equal(
    verified.statement.discovery.resources.max_concurrent_assignments,
    2
  );

  assert.throws(
    () => verifyNodeAdmission({
      ...node.input,
      discovery: {
        ...node.input.discovery,
        endpoint: 'https://user:secret@node-a.mesh.example/'
      }
    }, { requireFuture: false }),
    /without credentials/
  );
  assert.throws(
    () => verifyNodeAdmission({
      ...node.input,
      discovery: {
        ...node.input.discovery,
        resources: {
          ...node.input.discovery.resources,
          cpu_millis: 0
        }
      }
    }, { requireFuture: false }),
    /cpu_millis/
  );
});

test('discovery and scheduler exclude expired, quarantined, and unqualified nodes', () => {
  const nodes = [
    candidate('node:a', {
      owner: 'owner:a',
      domain: 'zone:a',
      security: 'S3_HARDENED',
      expiresAt: '2026-07-29T14:00:00.000Z'
    }),
    candidate('node:b', {
      owner: 'owner:b',
      domain: 'zone:b',
      expiresAt: '2026-07-29T14:00:00.000Z'
    }),
    candidate('node:expired', {
      owner: 'owner:c',
      domain: 'zone:c',
      expiresAt: '2026-07-29T11:59:59.000Z'
    }),
    candidate('node:quarantined', {
      owner: 'owner:d',
      domain: 'zone:d',
      status: 'quarantined',
      expiresAt: '2026-07-29T14:00:00.000Z'
    }),
    candidate('node:no-capability', {
      owner: 'owner:e',
      domain: 'zone:e',
      capabilities: ['storage.offer'],
      expiresAt: '2026-07-29T14:00:00.000Z'
    })
  ];
  const discovery = discoverAdmittedNodes(nodes, {
    required_capabilities: ['compute.batch'],
    required_roles: ['compute'],
    minimum_security_level: 2,
    minimum_lease_seconds: 300,
    limit: 10
  }, { asOf: NOW });
  assert.deepEqual(
    discovery.nodes.map(node => node.node_id),
    ['node:a', 'node:b']
  );
  assert.equal('public_key' in discovery.nodes[0], false);

  const request = normalizeNodeScheduleRequest({
    request_id: 'request:spread',
    required_capabilities: ['compute.batch'],
    required_roles: ['compute'],
    minimum_security_level: 2,
    resources: {
      cpu_millis: 500,
      memory_bytes: 512,
      storage_bytes: 0
    },
    replicas: 2,
    lease_seconds: 300,
    distinct_failure_domains: true,
    max_per_owner: 1
  }, 'owner:scheduler');
  const first = selectNodePlacements({
    nodes,
    schedules: [],
    normalizedRequest: request,
    occurredAt: NOW
  });
  const second = selectNodePlacements({
    nodes: [...nodes].reverse(),
    schedules: [],
    normalizedRequest: request,
    occurredAt: NOW
  });
  assert.deepEqual(first, second);
  assert.equal(new Set(
    first.placements.map(item => item.failure_domain)
  ).size, 2);
  assert.equal(new Set(
    first.placements.map(item => item.owner)
  ).size, 2);

  assert.throws(
    () => selectNodePlacements({
      nodes,
      schedules: [first],
      normalizedRequest: request,
      occurredAt: '2026-07-29T12:01:00.000Z'
    }),
    /complete admitted-node placement/
  );

  const shared = candidate('node:shared', {
    owner: 'owner:shared',
    domain: 'zone:shared',
    expiresAt: '2026-07-29T13:00:00.000Z'
  });
  shared.discovery.resources.max_concurrent_assignments = 2;
  const sharedRequest = normalizeNodeScheduleRequest({
    ...request.request,
    request_id: 'request:shared-one',
    replicas: 1,
    distinct_failure_domains: false,
    resources: {
      cpu_millis: 400,
      memory_bytes: 256,
      storage_bytes: 0
    }
  }, 'owner:scheduler');
  const sharedOne = selectNodePlacements({
    nodes: [shared],
    schedules: [],
    normalizedRequest: sharedRequest,
    occurredAt: NOW
  });
  const sharedTwo = selectNodePlacements({
    nodes: [shared],
    schedules: [sharedOne],
    normalizedRequest: normalizeNodeScheduleRequest({
      ...sharedRequest.request,
      request_id: 'request:shared-two'
    }, 'owner:scheduler'),
    occurredAt: NOW
  });
  const reduced = structuredClone(shared);
  reduced.discovery.resources.cpu_millis = 500;
  assert.equal(effectiveScheduleStatus(
    sharedOne,
    [reduced],
    { asOf: NOW, schedules: [sharedOne, sharedTwo] }
  ), 'degraded');
  const moved = structuredClone(shared);
  moved.discovery.endpoint = 'https://moved.mesh.example';
  assert.equal(effectiveScheduleStatus(
    sharedOne,
    [moved],
    { asOf: NOW, schedules: [sharedOne] }
  ), 'degraded');
});

test('Grid rejects node-key Sybils and preserves auditable schedule degradation', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-node-scheduling-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  let store = new GridStore({ path, dataDir, identity, protector });
  const first = signedAdmission({
    nodeId: 'node:grid-a',
    owner: 'owner:grid',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    endpoint: 'https://grid-a.mesh.example',
    failureDomain: 'zone:a'
  });
  const second = signedAdmission({
    nodeId: 'node:grid-b',
    owner: 'owner:grid',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    endpoint: 'https://grid-b.mesh.example',
    failureDomain: 'zone:b'
  });
  appendAdmission(store, first);
  appendAdmission(store, second);

  const duplicateIdentity = {
    ...first,
    input: signedAdmission({
      nodeId: 'node:sybil',
      owner: 'owner:other',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      endpoint: 'https://sybil.mesh.example',
      failureDomain: 'zone:c',
      keys: first.keys
    }).input
  };
  assert.throws(
    () => appendAdmission(store, duplicateIdentity),
    error => error.code === 'node_identity_conflict'
  );
  const downgradeStatement = {
    format: 'axiom-node-renewal.v1',
    node_id: first.input.node_id,
    capabilities: first.input.capabilities,
    software_digest: sha256('software:downgrade-attempt'),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    nonce: 'nonce:renewal-downgrade'
  };
  const downgrade = verifyNodeRenewal({
    ...downgradeStatement,
    public_key: first.input.public_key,
    signature: sign(
      null,
      Buffer.from(canonicalJson(downgradeStatement)),
      first.keys.privateKey
    ).toString('base64url')
  });
  assert.throws(
    () => store.appendEvents({
      traceId: 'trace_renewal_downgrade',
      actor: first.owner,
      events: [{
        kind: 'node.renewed',
        subject: downgrade.statement.node_id,
        payload: {
          owner: first.owner,
          renewal: downgrade
        }
      }]
    }),
    /cannot downgrade to v1/
  );

  const normalized = normalizeNodeScheduleRequest({
    request_id: 'request:grid-store',
    required_capabilities: ['compute.batch'],
    required_roles: ['compute'],
    minimum_security_level: 2,
    resources: {
      cpu_millis: 500,
      memory_bytes: 512,
      storage_bytes: 0
    },
    replicas: 2,
    lease_seconds: 300,
    distinct_failure_domains: true,
    max_per_owner: 2
  }, 'owner:grid');
  store.appendEvents({
    traceId: 'trace_schedule_create',
    actor: 'owner:grid',
    events: [{
      kind: 'node.schedule.requested',
      subject: normalized.schedule_id,
      payload: {
        requester: normalized.requester,
        request: normalized.request,
        request_digest: normalized.request_digest,
        schedule_id: normalized.schedule_id
      }
    }]
  });
  const active = store.getNodeSchedule(
    normalized.schedule_id,
    'owner:grid'
  );
  assert.equal(active.status, 'active');
  assert.equal(active.placements.length, 2);

  store.appendEvents({
    traceId: 'trace_schedule_quarantine',
    actor: 'owner:security',
    events: [{
      kind: 'node.quarantined',
      subject: active.placements[0].node_id,
      payload: {
        node_id: active.placements[0].node_id,
        quarantined_by: 'owner:security',
        reason: 'Partition and quarantine test'
      }
    }]
  });
  assert.equal(
    store.getNodeSchedule(normalized.schedule_id, 'owner:grid').status,
    'degraded'
  );
  assert.equal(
    store.discoverNodes(
      { required_capabilities: ['compute.batch'] },
      { asOf: new Date(Date.now() + 7_200_000).toISOString() }
    ).count,
    0
  );
  assert.equal(store.verifyChain().valid, true);
  store.close();

  store = new GridStore({ path, dataDir, identity, protector });
  assert.equal(
    store.getNodeSchedule(normalized.schedule_id, 'owner:grid').status,
    'degraded'
  );
  assert.equal(store.verifyChain().valid, true);
  store.close();
});

test('node scheduling drill signs Sybil, expiry, quarantine, and partition evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-node-scheduling-drill-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const evidence = await runNodeSchedulingDrill({
    workspaceDir: join(root, 'workspace'),
    sourceRevision: 'c'.repeat(40),
    generatedAt: NOW
  });
  assert.equal(verifyNodeSchedulingDrillEvidence(evidence).valid, true);
  assert.ok(Object.values(evidence.checks).every(Boolean));
  assert.doesNotMatch(
    JSON.stringify(evidence),
    /PRIVATE KEY|operator\.token|authorization:\s*bearer/i
  );
  const tampered = structuredClone(evidence);
  tampered.observations.scheduled_replicas = 1;
  assert.throws(
    () => verifyNodeSchedulingDrillEvidence(tampered),
    /metadata or checks/
  );
});

function signedAdmission({
  nodeId,
  owner,
  expiresAt,
  endpoint,
  failureDomain,
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
    software_digest: sha256(`software:${nodeId}`),
    expires_at: expiresAt,
    nonce: `nonce:${nodeId}`,
    discovery: {
      endpoint,
      failure_domain: failureDomain,
      roles: ['compute', 'storage'],
      resources: {
        cpu_millis: 1_000,
        memory_bytes: 1_024,
        storage_bytes: 4_096,
        max_concurrent_assignments: 2
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

function appendAdmission(store, record) {
  const admission = verifyNodeAdmission(record.input);
  return store.appendEvents({
    traceId: `trace_${admission.statement.node_id.replaceAll(':', '_')}`,
    actor: record.owner,
    events: [{
      kind: 'node.registered',
      subject: admission.statement.node_id,
      payload: {
        owner: record.owner,
        admission
      }
    }]
  });
}

function candidate(nodeId, {
  owner,
  domain,
  security = 'S2_HARDENED',
  status = 'active',
  capabilities = ['compute.batch', 'storage.offer'],
  expiresAt
}) {
  return {
    node_id: nodeId,
    owner,
    status,
    security_profile: security,
    capabilities,
    software_digest: sha256(`software:${nodeId}`),
    public_key_digest: sha256(`key:${nodeId}`),
    expires_at: expiresAt,
    renewed_at: null,
    discovery: {
      endpoint: `https://${nodeId.replace(':', '-')}.mesh.example`,
      failure_domain: domain,
      roles: ['compute'],
      resources: {
        cpu_millis: 1_000,
        memory_bytes: 1_024,
        storage_bytes: 0,
        max_concurrent_assignments: 1
      }
    }
  };
}
