import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PolicyEngine } from '../../src/lib/policy.mjs';
import { buildMachineDiscovery } from '../../src/lib/machine-discovery.mjs';
import { normalizeMachinePrincipalDefinition } from '../../src/lib/machine-principal.mjs';
import { createMachineIdentityCredential } from '../../src/lib/agent-trust-machine-identity.mjs';
import { createAgentAuthorityManifest } from '../../src/lib/agent-trust-authority-manifest.mjs';
import { createAgentSignedHandoff } from '../../src/lib/agent-trust-signed-handoff.mjs';
import { createAgentCurrentnessCheckpoint } from '../../src/lib/agent-trust-currentness-checkpoint.mjs';
import {
  AGENT_EFFECT_CONSUMPTION_ACTION,
  consumeAgentReadSystemFactsHandoff
} from '../../src/lib/agent-trust-effect-consumption.mjs';

export const READ_SYSTEM_FACTS_INPUT_DIGEST = '1'.repeat(64);
export const READ_SYSTEM_FACTS_EFFECT_AT = '2026-08-17T20:02:40.000Z';
export const READ_SYSTEM_FACTS_TEST_REVISION = 'a'.repeat(40);

const humans = new Set(['owner.alice']);

function principal(id) {
  return normalizeMachinePrincipalDefinition({
    id,
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-01T00:00:00.000Z',
    runtime: {
      id: `runtime.${id}`,
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: [AGENT_EFFECT_CONSUMPTION_ACTION],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 2,
        max_execution_ms: 5_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  }, {
    knownHumanPrincipals: humans,
    now: new Date('2026-08-17T19:00:00.000Z')
  });
}

function policy() {
  return {
    version: 'read-system-facts-fixture-v1',
    actions: {
      [AGENT_EFFECT_CONSUMPTION_ACTION]: {
        decision: 'allow',
        risk: 'low',
        required_scopes: ['intent:execute'],
        required_confirmations: 1,
        required_confirmation_values: ['confirm.read-system-facts'],
        requires_independent_approval: false,
        required_assurance: 'A1',
        timeout_ms: 3_000,
        constraints: {},
        tool: 'builtin.read-system-facts',
        effect: AGENT_EFFECT_CONSUMPTION_ACTION
      }
    }
  };
}

function identity({ id, issuer, operational }) {
  const machine = principal(id);
  const credential = createMachineIdentityCredential({
    principal: machine,
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-08-17T20:00:00.000Z',
    validFrom: '2026-08-17T20:00:00.000Z',
    expiresAt: '2026-08-25T20:00:00.000Z',
    knownHumanPrincipals: humans
  });
  return { machine, credential };
}

export function createReadSystemFactsFixture() {
  const issuer = generateKeyPairSync('ed25519');
  const senderOperational = generateKeyPairSync('ed25519');
  const executorOperational = generateKeyPairSync('ed25519');
  const senderObserver = generateKeyPairSync('ed25519');
  const executorObserver = generateKeyPairSync('ed25519');
  const store = generateKeyPairSync('ed25519');
  const admissionIssuer = generateKeyPairSync('ed25519');

  const sender = identity({
    id: 'agent.read-facts.sender.1',
    issuer,
    operational: senderOperational
  });
  const executor = identity({
    id: 'agent.read-facts.executor.1',
    issuer,
    operational: executorOperational
  });

  const activePolicy = policy();
  const discovery = buildMachineDiscovery({
    principal: sender.machine,
    policy: new PolicyEngine(activePolicy),
    kernelVersion: '0.12.0-dev.3'
  });
  const capabilityRegistry = {
    schema: 'axiom-capabilities.v1',
    capabilities: [{ id: 'agent.read-system-facts-lab', status: 'implemented' }]
  };
  const authorityManifest = createAgentAuthorityManifest({
    principal: sender.machine,
    identityCredential: sender.credential,
    trustedIssuerPublicKey: issuer.publicKey,
    discovery,
    policy: activePolicy,
    capabilityRegistry,
    createdAt: '2026-08-17T20:01:00.000Z',
    expiresAt: '2026-08-17T20:10:00.000Z',
    knownHumanPrincipals: humans
  });
  const authorityEvidence = {
    principal: sender.machine,
    identityCredential: sender.credential,
    trustedIssuerPublicKey: issuer.publicKey,
    discovery,
    policy: activePolicy,
    capabilityRegistry,
    knownHumanPrincipals: humans
  };
  const handoff = createAgentSignedHandoff({
    handoffId: 'handoff.read-facts.1',
    parentTaskId: 'task.read-facts.parent.1',
    recipientPrincipalId: executor.machine.id,
    recipientIdentityDigest: executor.credential.credential_digest,
    intendedExecutorId: executor.machine.id,
    intendedExecutorIdentityDigest: executor.credential.credential_digest,
    identityCredential: sender.credential,
    trustedIssuerPublicKey: issuer.publicKey,
    authorityManifest,
    authorityEvidence,
    operationalPrivateKey: senderOperational.privateKey,
    action: AGENT_EFFECT_CONSUMPTION_ACTION,
    purpose: 'test.conformance',
    destination: 'local',
    inputDigest: READ_SYSTEM_FACTS_INPUT_DIGEST,
    contextDigests: [],
    evidenceObligations: ['consume-before-effect', 'effect.receipt'],
    expectedOutputClasses: ['system-facts.receipt'],
    resourceCeiling: {
      max_requests_per_minute: 5,
      max_concurrent_requests: 1,
      max_execution_ms: 2_000,
      max_request_bytes: 4_096,
      max_response_bytes: 16_384
    },
    notBefore: '2026-08-17T20:02:00.000Z',
    expiresAt: '2026-08-17T20:06:00.000Z',
    nonce: 'nonce.read-facts.1',
    idempotencyKey: 'idem.read-facts.1'
  });
  const handoffEvidence = {
    identityCredential: sender.credential,
    trustedIssuerPublicKey: issuer.publicKey,
    authorityManifest,
    authorityEvidence
  };

  const senderCheckpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.read-facts.sender.1',
    checkpointSequence: 1,
    credentialHistory: [sender.credential],
    revocations: [],
    trustedIssuerPublicKey: issuer.publicKey,
    observerId: 'observer.read-facts.sender',
    observerPrivateKey: senderObserver.privateKey,
    evaluatedAt: '2026-08-17T20:02:30.000Z'
  });
  const executorCheckpoint = createAgentCurrentnessCheckpoint({
    checkpointId: 'currentness.read-facts.executor.1',
    checkpointSequence: 1,
    credentialHistory: [executor.credential],
    revocations: [],
    trustedIssuerPublicKey: issuer.publicKey,
    observerId: 'observer.read-facts.executor',
    observerPrivateKey: executorObserver.privateKey,
    evaluatedAt: '2026-08-17T20:02:31.000Z'
  });
  const senderCurrentness = {
    checkpoint: senderCheckpoint,
    trustedObserverPublicKey: senderObserver.publicKey,
    credentialHistory: [sender.credential],
    revocations: [],
    trustedIssuerPublicKey: issuer.publicKey,
    expectedLatestCheckpointDigest: senderCheckpoint.checkpoint_digest
  };
  const executorCurrentness = {
    checkpoint: executorCheckpoint,
    trustedObserverPublicKey: executorObserver.publicKey,
    credentialHistory: [executor.credential],
    revocations: [],
    trustedIssuerPublicKey: issuer.publicKey,
    expectedLatestCheckpointDigest: executorCheckpoint.checkpoint_digest
  };

  return {
    issuer,
    senderOperational,
    executorOperational,
    senderObserver,
    executorObserver,
    store,
    admissionIssuer,
    sender,
    executor,
    authorityManifest,
    authorityEvidence,
    handoff,
    handoffEvidence,
    senderCheckpoint,
    executorCheckpoint,
    senderCurrentness,
    executorCurrentness
  };
}

export async function consumeReadSystemFactsFixture(fixture, {
  stateRoot,
  consumptionId = 'consumption.read-facts.1',
  effectAt = READ_SYSTEM_FACTS_EFFECT_AT
} = {}) {
  const root = stateRoot ?? await mkdtemp(join(tmpdir(), 'axiom-read-facts-'));
  const consumption = await consumeAgentReadSystemFactsHandoff({
    stateRoot: root,
    consumptionId,
    handoff: fixture.handoff,
    handoffEvidence: fixture.handoffEvidence,
    executorIdentityCredential: fixture.executor.credential,
    trustedExecutorIssuerPublicKey: fixture.issuer.publicKey,
    senderCurrentness: fixture.senderCurrentness,
    executorCurrentness: fixture.executorCurrentness,
    storePrivateKey: fixture.store.privateKey,
    effectAt,
    maxEvidenceAgeMs: 30_000
  });
  return { stateRoot: root, consumption };
}
