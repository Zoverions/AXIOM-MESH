import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  AGENT_LINEAGE_ATTESTATION_SCHEMA,
  AGENT_SPAWN_PROPOSAL_SCHEMA,
  createAgentLineageAttestation,
  normalizeAgentSpawnProposal,
  verifyAgentLineageAttestation,
  verifyAgentLineageLink
} from '../src/lib/agent-lineage-delegation.mjs';

const humanSponsors = new Set(['owner.alice']);
const NOW = new Date('2026-09-01T20:00:00.000Z');
const INPUT_DIGEST = 'd'.repeat(64);

function parentPrincipal(overrides = {}) {
  const base = {
    id: 'agent.coordinator.1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['coordinator', 'researcher'],
    scopes: ['intent:execute', 'memory:read'],
    lifetime: 'session',
    expires_at: '2099-01-01T02:00:00.000Z',
    runtime: {
      id: 'runtime.local.parent.1',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['memory.read', 'system.echo'],
      purposes: ['research.assist', 'test.conformance'],
      destinations: ['local', 'provider:fixture'],
      budgets: {
        max_requests_per_minute: 30,
        max_concurrent_requests: 4,
        max_execution_ms: 20_000,
        max_request_bytes: 131_072,
        max_response_bytes: 524_288
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  };
  return { ...base, ...overrides };
}

function childPrincipal(overrides = {}) {
  const base = {
    id: 'agent.researcher.1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'ephemeral',
    expires_at: '2099-01-01T01:00:00.000Z',
    runtime: {
      id: 'runtime.local.child.1',
      kind: 'local-process',
      software_digest: 'b'.repeat(64)
    },
    constraints: {
      actions: ['memory.read', 'system.echo'],
      purposes: ['research.assist'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 20,
        max_concurrent_requests: 2,
        max_execution_ms: 10_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  };
  return { ...base, ...overrides };
}

function recursiveLimits(overrides = {}) {
  return {
    max_children: 4,
    max_total_descendants: 12,
    max_depth: 4,
    token_budget: 100_000,
    storage_bytes: 10_000_000,
    wall_clock_ms: 120_000,
    ...overrides
  };
}

function spawnProposal(overrides = {}) {
  const base = {
    schema: 'axiom-agent-spawn-proposal.v1',
    root_sponsor: 'owner.alice',
    parent: parentPrincipal(),
    child: childPrincipal(),
    task: {
      id: 'task.research.1',
      purpose: 'research.assist',
      input_digest: INPUT_DIGEST
    },
    lineage: {
      depth: 1,
      parent_attestation_digest: null
    },
    recursive_limits: recursiveLimits(),
    validity: {
      created_at: '2099-01-01T00:00:00.000Z',
      expires_at: '2099-01-01T00:30:00.000Z'
    }
  };
  return { ...base, ...overrides };
}

function normalize(raw = spawnProposal()) {
  return normalizeAgentSpawnProposal(raw, {
    knownHumanPrincipals: humanSponsors,
    now: NOW
  });
}

test('agent spawn proposal v1 binds a strictly attenuated child without authorizing spawn or inheriting trust', () => {
  const proposal = normalize();

  assert.equal(AGENT_SPAWN_PROPOSAL_SCHEMA, 'axiom-agent-spawn-proposal.v1');
  assert.equal(proposal.schema, AGENT_SPAWN_PROPOSAL_SCHEMA);
  assert.equal(proposal.root_sponsor, 'owner.alice');
  assert.equal(proposal.parent.id, 'agent.coordinator.1');
  assert.equal(proposal.child.id, 'agent.researcher.1');
  assert.equal(proposal.lineage.depth, 1);
  assert.equal(proposal.lineage.parent_attestation_digest, null);
  assert.equal(proposal.semantics.spawn_authorized, false);
  assert.equal(proposal.semantics.trust_inherited, false);
  assert.equal(proposal.semantics.task_success_claimed, false);
  assert.equal(proposal.semantics.output_verified, false);
  assert.equal(proposal.semantics.authority_effect, 'none');
  assert.equal(proposal.semantics.delegation_effect, 'none');
  assert.match(proposal.proposal_digest, /^[a-f0-9]{64}$/);
});

test('agent spawn proposal rejects authority amplification across roles scopes actions purposes and destinations', () => {
  const cases = [
    ['roles', childPrincipal({ roles: ['administrator', 'researcher'] }), /roles exceed parent ceiling|administrator role/],
    ['scopes', childPrincipal({ scopes: ['intent:execute', 'vault:write'] }), /scopes exceed parent ceiling/],
    ['actions', childPrincipal({
      constraints: { ...childPrincipal().constraints, actions: ['memory.read', 'system.delete', 'system.echo'] }
    }), /actions exceed parent ceiling/],
    ['purposes', childPrincipal({
      constraints: { ...childPrincipal().constraints, purposes: ['finance.transfer', 'research.assist'] }
    }), /purposes exceed parent ceiling/],
    ['destinations', childPrincipal({
      constraints: { ...childPrincipal().constraints, destinations: ['https://untrusted.example', 'local'] }
    }), /destinations exceed parent ceiling/]
  ];

  for (const [label, child, pattern] of cases) {
    assert.throws(
      () => normalize(spawnProposal({ child })),
      pattern,
      `${label} widening must fail closed`
    );
  }
});

test('agent spawn proposal rejects budget lifetime sponsor identity task and validity widening', () => {
  for (const budgetName of [
    'max_requests_per_minute',
    'max_concurrent_requests',
    'max_execution_ms',
    'max_request_bytes',
    'max_response_bytes'
  ]) {
    const parentBudget = parentPrincipal().constraints.budgets[budgetName];
    assert.throws(
      () => normalize(spawnProposal({
        child: childPrincipal({
          constraints: {
            ...childPrincipal().constraints,
            budgets: { ...childPrincipal().constraints.budgets, [budgetName]: parentBudget + 1 }
          }
        })
      })),
      new RegExp(`${budgetName} exceeds parent ceiling`)
    );
  }

  assert.throws(
    () => normalize(spawnProposal({ child: childPrincipal({ sponsor: 'owner.bob' }) })),
    /same human sponsor|known human principal/
  );
  assert.throws(
    () => normalize(spawnProposal({ child: childPrincipal({ id: 'agent.coordinator.1' }) })),
    /distinct principal/
  );
  assert.throws(
    () => normalize(spawnProposal({ child: childPrincipal({ lifetime: 'persistent', expires_at: undefined }) })),
    /persistent children/
  );
  assert.throws(
    () => normalize(spawnProposal({
      parent: parentPrincipal({ expires_at: '2099-01-01T00:45:00.000Z' })
    })),
    /child expiry exceeds parent expiry/
  );
  assert.throws(
    () => normalize(spawnProposal({
      validity: { created_at: '2099-01-01T00:00:00.000Z', expires_at: '2099-01-01T01:30:00.000Z' }
    })),
    /proposal expiry exceeds child expiry/
  );
  assert.throws(
    () => normalize(spawnProposal({
      task: { id: 'task.bad-purpose', purpose: 'test.conformance', input_digest: INPUT_DIGEST }
    })),
    /task purpose is outside child purpose ceiling/
  );
  assert.throws(
    () => normalizeAgentSpawnProposal(spawnProposal({
      validity: { created_at: '2026-09-01T18:00:00.000Z', expires_at: '2026-09-01T19:59:59.000Z' }
    }), { knownHumanPrincipals: humanSponsors, now: NOW }),
    /proposal is expired/
  );
});

test('agent spawn proposal enforces bounded canonical lineage metadata', () => {
  assert.throws(
    () => normalize(spawnProposal({
      lineage: { depth: 2, parent_attestation_digest: null }
    })),
    /parent attestation digest is required after depth 1/
  );
  assert.throws(
    () => normalize(spawnProposal({
      lineage: { depth: 1, parent_attestation_digest: 'a'.repeat(64) }
    })),
    /depth 1 must not include parent attestation digest/
  );
  assert.throws(
    () => normalize(spawnProposal({
      lineage: { depth: 5, parent_attestation_digest: 'a'.repeat(64) },
      recursive_limits: recursiveLimits({ max_depth: 4 })
    })),
    /lineage depth exceeds recursive max_depth/
  );
  assert.throws(
    () => normalize(spawnProposal({ unexpected: true })),
    /unsupported field unexpected/
  );
});

test('agent lineage attestation signs exact provenance and rejects tamper or issuer substitution', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const other = generateKeyPairSync('ed25519');
  const proposal = normalize();
  const attestation = createAgentLineageAttestation({
    proposal,
    issuerId: 'node.local.owner-alice',
    issuerPrivateKey: privateKey,
    knownHumanPrincipals: humanSponsors,
    now: NOW
  });

  assert.equal(AGENT_LINEAGE_ATTESTATION_SCHEMA, 'axiom-agent-lineage-attestation.v1');
  assert.equal(attestation.schema, AGENT_LINEAGE_ATTESTATION_SCHEMA);
  assert.match(attestation.attestation_digest, /^[a-f0-9]{64}$/);

  const verified = verifyAgentLineageAttestation(attestation, {
    trustedIssuerPublicKey: publicKey,
    expectedIssuerId: 'node.local.owner-alice',
    knownHumanPrincipals: humanSponsors,
    now: NOW
  });
  assert.equal(verified.proposal.proposal_digest, proposal.proposal_digest);
  assert.equal(verified.proposal.semantics.spawn_authorized, false);
  assert.equal(verified.proposal.semantics.trust_inherited, false);

  assert.throws(
    () => verifyAgentLineageAttestation({
      ...attestation,
      proposal: {
        ...attestation.proposal,
        task: { ...attestation.proposal.task, id: 'task.tampered' }
      }
    }, {
      trustedIssuerPublicKey: publicKey,
      expectedIssuerId: 'node.local.owner-alice',
      knownHumanPrincipals: humanSponsors,
      now: NOW
    }),
    /proposal digest mismatch|signature is invalid/
  );
  assert.throws(
    () => verifyAgentLineageAttestation(attestation, {
      trustedIssuerPublicKey: other.publicKey,
      expectedIssuerId: 'node.local.owner-alice',
      knownHumanPrincipals: humanSponsors,
      now: NOW
    }),
    /issuer key substitution/
  );
  assert.throws(
    () => verifyAgentLineageAttestation(attestation, {
      trustedIssuerPublicKey: publicKey,
      expectedIssuerId: 'node.local.someone-else',
      knownHumanPrincipals: humanSponsors,
      now: NOW
    }),
    /issuer id mismatch/
  );
});

test('agent lineage link binds the previous child as next parent and attenuates recursive ceilings', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const generationOne = normalize();
  const parentAttestation = createAgentLineageAttestation({
    proposal: generationOne,
    issuerId: 'node.local.owner-alice',
    issuerPrivateKey: privateKey,
    knownHumanPrincipals: humanSponsors,
    now: NOW
  });

  const grandchild = childPrincipal({
    id: 'agent.citation-checker.1',
    roles: [],
    scopes: ['intent:execute'],
    expires_at: '2099-01-01T00:50:00.000Z',
    runtime: {
      id: 'runtime.local.grandchild.1',
      kind: 'local-process',
      software_digest: 'c'.repeat(64)
    },
    constraints: {
      ...childPrincipal().constraints,
      actions: ['memory.read'],
      purposes: ['research.assist'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 5_000,
        max_request_bytes: 32_768,
        max_response_bytes: 131_072
      }
    }
  });
  const generationTwo = normalizeAgentSpawnProposal({
    schema: 'axiom-agent-spawn-proposal.v1',
    root_sponsor: 'owner.alice',
    parent: generationOne.child,
    child: grandchild,
    task: {
      id: 'task.citations.1',
      purpose: 'research.assist',
      input_digest: 'e'.repeat(64)
    },
    lineage: {
      depth: 2,
      parent_attestation_digest: parentAttestation.attestation_digest
    },
    recursive_limits: recursiveLimits({
      max_children: 2,
      max_total_descendants: 6,
      max_depth: 4,
      token_budget: 50_000,
      storage_bytes: 5_000_000,
      wall_clock_ms: 60_000
    }),
    validity: {
      created_at: '2099-01-01T00:10:00.000Z',
      expires_at: '2099-01-01T00:20:00.000Z'
    }
  }, { knownHumanPrincipals: humanSponsors, now: NOW });

  const linked = verifyAgentLineageLink({ parentAttestation, childProposal: generationTwo });
  assert.deepEqual(linked, {
    linked: true,
    root_sponsor: 'owner.alice',
    depth: 2,
    parent_attestation_digest: parentAttestation.attestation_digest,
    parent_principal_id: 'agent.researcher.1',
    child_principal_id: 'agent.citation-checker.1'
  });
});

test('agent lineage link rejects parent substitution depth skips and recursive resource widening', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const generationOne = normalize();
  const parentAttestation = createAgentLineageAttestation({
    proposal: generationOne,
    issuerId: 'node.local.owner-alice',
    issuerPrivateKey: privateKey,
    knownHumanPrincipals: humanSponsors,
    now: NOW
  });

  function linkedProposal({ lineage = {}, recursive = {}, parent = generationOne.child } = {}) {
    return normalizeAgentSpawnProposal({
      schema: 'axiom-agent-spawn-proposal.v1',
      root_sponsor: 'owner.alice',
      parent,
      child: childPrincipal({
        id: 'agent.citation-checker.2',
        roles: [],
        expires_at: '2099-01-01T00:50:00.000Z',
        constraints: {
          ...childPrincipal().constraints,
          actions: ['memory.read'],
          budgets: {
            max_requests_per_minute: 10,
            max_concurrent_requests: 1,
            max_execution_ms: 5_000,
            max_request_bytes: 32_768,
            max_response_bytes: 131_072
          }
        }
      }),
      task: { id: 'task.citations.2', purpose: 'research.assist', input_digest: 'f'.repeat(64) },
      lineage: {
        depth: 2,
        parent_attestation_digest: parentAttestation.attestation_digest,
        ...lineage
      },
      recursive_limits: recursiveLimits({
        max_children: 2,
        max_total_descendants: 6,
        max_depth: 4,
        token_budget: 50_000,
        storage_bytes: 5_000_000,
        wall_clock_ms: 60_000,
        ...recursive
      }),
      validity: { created_at: '2099-01-01T00:10:00.000Z', expires_at: '2099-01-01T00:20:00.000Z' }
    }, { knownHumanPrincipals: humanSponsors, now: NOW });
  }

  const wrongDigest = linkedProposal({ lineage: { parent_attestation_digest: '9'.repeat(64) } });
  assert.throws(
    () => verifyAgentLineageLink({ parentAttestation, childProposal: wrongDigest }),
    /parent attestation digest mismatch/
  );

  const wrongParent = linkedProposal({
    parent: parentPrincipal({ id: 'agent.other-parent.1' })
  });
  assert.throws(
    () => verifyAgentLineageLink({ parentAttestation, childProposal: wrongParent }),
    /previous child must be next parent/
  );

  const skippedDepth = normalizeAgentSpawnProposal({
    ...linkedProposal(),
    proposal_digest: undefined,
    lineage: { depth: 3, parent_attestation_digest: parentAttestation.attestation_digest }
  }, { knownHumanPrincipals: humanSponsors, now: NOW });
  assert.throws(
    () => verifyAgentLineageLink({ parentAttestation, childProposal: skippedDepth }),
    /lineage depth must increment exactly once/
  );

  for (const [name, value] of [
    ['max_children', 5],
    ['max_total_descendants', 13],
    ['max_depth', 5],
    ['token_budget', 100_001],
    ['storage_bytes', 10_000_001],
    ['wall_clock_ms', 120_001]
  ]) {
    const widened = linkedProposal({ recursive: { [name]: value } });
    assert.throws(
      () => verifyAgentLineageLink({ parentAttestation, childProposal: widened }),
      new RegExp(`${name} exceeds parent lineage ceiling`)
    );
  }
});
