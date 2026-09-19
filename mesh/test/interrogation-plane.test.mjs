import test from 'node:test';
import assert from 'node:assert/strict';
import { digestObject, ValidationError } from '../src/lib/canonical.mjs';
import {
  AUTHORITY_SEQUENCE,
  INTERROGATION_PLANE_SCHEMA,
  buildInterrogationPlane
} from '../src/lib/interrogation-plane.mjs';
import { generateInterrogationPlane } from '../src/interrogation-plane.mjs';

function fixture() {
  const capabilityRegistry = {
    schema: 'axiom-capabilities.v1',
    verified_at: '2026-09-18',
    kernel_version: '0.12.0-dev.3',
    capabilities: [
      {
        id: 'core.alpha',
        family: 'core',
        status: 'implemented',
        summary: 'Implemented fixture capability with executable evidence.',
        evidence: ['mesh/test/alpha.test.mjs']
      },
      {
        id: 'lab.beta',
        family: 'lab',
        status: 'experimental',
        summary: 'Experimental fixture deliberately lacking exact assertion binding.',
        evidence: ['mesh/test/beta.test.mjs']
      }
    ]
  };
  const evidenceBindings = {
    schema: 'axiom-capability-evidence-bindings.v1',
    kernel_version: capabilityRegistry.kernel_version,
    registry_digest: digestObject(capabilityRegistry),
    bindings: [
      {
        capability_id: 'core.alpha',
        path: 'mesh/test/alpha.test.mjs',
        test: 'alpha behaves deterministically',
        assertions: ["assert.equal(result.valid, true);"]
      }
    ]
  };
  const serviceNetworkPolicy = {
    schema: 'axiom-service-network-policy.v1',
    version: 1,
    kernel_version: capabilityRegistry.kernel_version,
    default_action: 'deny',
    public_ingress: {
      service: 'gateway',
      channel: 'unix_domain_socket',
      container_bind: '127.0.0.1',
      published_tcp_ports: 0
    },
    network_segments: [
      { id: 'gateway-hypervisor', members: ['gateway', 'hypervisor'] },
      { id: 'hypervisor-sandbox', members: ['hypervisor', 'sandbox'] }
    ],
    flows: [
      {
        id: 'gateway-to-hypervisor',
        source: 'gateway',
        destination: 'hypervisor',
        routes: [{ method: 'POST', path: '/internal/v1/intents' }]
      },
      {
        id: 'hypervisor-to-sandbox',
        source: 'hypervisor',
        destination: 'sandbox',
        routes: [{ method: 'POST', path: '/internal/v1/execute' }]
      }
    ]
  };
  const verification = Object.fromEntries(
    ['registry', 'evidence_bindings', 'service_network', 'documentation']
      .map(key => [key, { valid: true }])
  );
  return {
    capabilityRegistry,
    evidenceBindings,
    serviceNetworkPolicy,
    verification
  };
}

test('Interrogation Plane is deterministic and keeps semantic state non-authorizing', () => {
  const input = fixture();
  const first = buildInterrogationPlane(input);
  const second = buildInterrogationPlane(input);

  assert.equal(first.schema, INTERROGATION_PLANE_SCHEMA);
  assert.equal(first.report_digest, second.report_digest);
  assert.equal(first.posture.mode, 'read_only');
  assert.equal(first.posture.execution_authority, 'none');
  assert.equal(first.posture.discovery_is_authorization, false);
  assert.equal(first.posture.semantic_judgments, 'advisory_only_not_loaded');
  assert.deepEqual(first.authority.sequence, [...AUTHORITY_SEQUENCE]);
  assert.deepEqual(first.attention, [{
    kind: 'experimental_without_exact_binding',
    capability_id: 'lab.beta'
  }]);
});

test('Interrogation Plane separates conceptual authority sequence from network topology', () => {
  const report = buildInterrogationPlane(fixture());
  const authorityEdges = report.edges.filter(edge => edge.kind === 'authority_sequence');
  const networkEdges = report.edges.filter(edge => edge.kind === 'network_flow');

  assert.equal(authorityEdges.length, 3);
  assert.ok(authorityEdges.every(edge => edge.conceptual === true && edge.network_edge === false));
  assert.ok(networkEdges.every(edge => edge.conceptual === false && edge.network_edge === true));
  assert.ok(
    authorityEdges.some(edge => (
      edge.source === 'authority-stage:sandbox'
      && edge.destination === 'authority-stage:grid'
    ))
  );
  assert.equal(
    networkEdges.some(edge => (
      edge.source === 'service:sandbox'
      && edge.destination === 'service:grid'
    )),
    false
  );
});

test('Interrogation Plane fails closed when implemented capability has no exact binding', () => {
  const input = fixture();
  input.evidenceBindings.bindings = [];
  input.evidenceBindings.registry_digest = digestObject(input.capabilityRegistry);

  assert.throws(
    () => buildInterrogationPlane(input),
    error => (
      error instanceof ValidationError
      && error.message.includes('implemented capability without exact evidence binding')
    )
  );
});

test('Interrogation Plane fails closed on stale evidence-binding registry digest', () => {
  const input = fixture();
  input.evidenceBindings.registry_digest = '0'.repeat(64);

  assert.throws(
    () => buildInterrogationPlane(input),
    error => (
      error instanceof ValidationError
      && error.message.includes('exact capability registry digest')
    )
  );
});

test('current repository generates a verified read-only Interrogation Plane', async () => {
  const report = await generateInterrogationPlane();

  assert.equal(report.schema, INTERROGATION_PLANE_SCHEMA);
  assert.equal(report.posture.mode, 'read_only');
  assert.equal(report.posture.execution_authority, 'none');
  assert.equal(report.network.default_action, 'deny');
  assert.deepEqual(report.authority.sequence, [...AUTHORITY_SEQUENCE]);
  assert.equal(report.verification.registry.valid, true);
  assert.equal(report.verification.evidence_bindings.valid, true);
  assert.equal(report.verification.service_network.valid, true);
  assert.equal(report.verification.documentation.valid, true);
  assert.equal(
    report.summary.network_routes,
    report.verification.service_network.routes
  );

  const networkEdges = report.edges.filter(edge => edge.kind === 'network_flow');
  assert.ok(networkEdges.some(edge => (
    edge.source === 'service:gateway'
    && edge.destination === 'service:grid'
  )));
  assert.ok(networkEdges.some(edge => (
    edge.source === 'service:hypervisor'
    && edge.destination === 'service:sandbox'
  )));
  assert.equal(networkEdges.some(edge => (
    edge.source === 'service:sandbox'
    && edge.destination === 'service:grid'
  )), false);
});
