import { createPublicKey } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { startDevelopmentStack } from './dev.mjs';
import {
  ValidationError,
  canonicalJson,
  sha256
} from './lib/canonical.mjs';
import { verifyObjectSignature } from './lib/identity.mjs';
import {
  activationGovernanceAction,
  attestationMemoryInput,
  buildIntentActivationRecord,
  buildIntentAttestationRecord
} from './lib/intent-grid-evidence.mjs';

const EVIDENCE_SCHEMA = 'axiom-intent-lifecycle-conformance-evidence.v1';
const KERNEL_VERSION = '0.12.0-dev.3';
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const UNBOUND_SOURCE = `unbound-local-intent-drill:${KERNEL_VERSION}`;

export async function runIntentLifecycleDrill({
  sourceRevision = process.env.GITHUB_SHA,
  now = () => Date.now()
} = {}) {
  const commitBound = REVISION.test(sourceRevision ?? '');
  const normalizedRevision = commitBound ? sourceRevision : null;
  const sourceDigest = sha256(commitBound ? sourceRevision : UNBOUND_SOURCE);
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-intent-lifecycle-'));
  const basePort = await findPortBlock();
  const tokens = {
    operator: `intent-operator-${crypto.randomUUID()}-${'o'.repeat(24)}`,
    approver: `intent-approver-${crypto.randomUUID()}-${'a'.repeat(24)}`,
    voter: `intent-voter-${crypto.randomUUID()}-${'v'.repeat(24)}`,
    verifierA: `intent-verifier-a-${crypto.randomUUID()}-${'x'.repeat(24)}`,
    verifierB: `intent-verifier-b-${crypto.randomUUID()}-${'y'.repeat(24)}`,
    verifierC: `intent-verifier-c-${crypto.randomUUID()}-${'z'.repeat(24)}`,
    observer: `intent-observer-${crypto.randomUUID()}-${'r'.repeat(24)}`
  };
  const principals = {
    operator: 'intent-operator',
    approver: 'intent-approver',
    voter: 'intent-voter',
    verifierA: 'intent-verifier-a',
    verifierB: 'intent-verifier-b',
    verifierC: 'intent-verifier-c',
    observer: 'intent-observer'
  };
  const overrides = {
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 2_000,
    rateLimitRefillPerSecond: 2_000,
    apiTokens: {
      [tokens.operator]: {
        id: principals.operator,
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      },
      [tokens.approver]: {
        id: principals.approver,
        type: 'human',
        roles: ['reviewer'],
        scopes: ['approval:write', 'intent:execute']
      },
      [tokens.voter]: {
        id: principals.voter,
        type: 'human',
        roles: ['reviewer'],
        scopes: ['governance:write']
      },
      [tokens.verifierA]: {
        id: principals.verifierA,
        type: 'service',
        roles: ['verifier'],
        scopes: ['memory:write']
      },
      [tokens.verifierB]: {
        id: principals.verifierB,
        type: 'service',
        roles: ['verifier'],
        scopes: ['memory:write']
      },
      [tokens.verifierC]: {
        id: principals.verifierC,
        type: 'service',
        roles: ['verifier'],
        scopes: ['memory:write']
      },
      [tokens.observer]: {
        id: principals.observer,
        type: 'human',
        roles: ['observer'],
        scopes: ['intent:execute']
      }
    }
  };

  let stack;
  try {
    stack = await startDevelopmentStack(overrides);
    const gateway = `http://127.0.0.1:${basePort}`;
    const contract = intentLifecycleContract();
    const activation = buildIntentActivationRecord(contract, {
      kernel_version: KERNEL_VERSION,
      source_digest: sourceDigest
    });

    const timingStart = now();
    const votingEndsAt = new Date(timingStart + 2_000).toISOString();
    const activateAfter = new Date(timingStart + 5_000).toISOString();
    const proposalInput = {
      title: 'Activate AXIOM Intent lifecycle drill contract',
      body: 'Conformance-only activation for the disposable four-service Intent lifecycle drill.',
      action: activationGovernanceAction(activation),
      voting_ends_at: votingEndsAt,
      activate_after: activateAfter
    };

    const checks = {};
    const proposal = await independentlyApprovedIntent({
      gateway,
      requesterToken: tokens.operator,
      requesterId: principals.operator,
      approverToken: tokens.approver,
      action: 'governance.propose',
      confirmation: 'confirm:governance.propose',
      input: proposalInput,
      checks,
      checkPrefix: 'proposal'
    });
    checks.proposal_created_through_gateway = proposal.status === 'completed'
      && typeof proposal.proposal_id === 'string';

    const vote = await api(gateway, tokens.voter, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'governance.vote',
        input: {
          proposal_id: proposal.proposal_id,
          chamber: 'human',
          choice: 'for',
          weight: 1
        }
      }
    });
    checks.independent_vote_recorded = vote.status === 'completed';

    await waitUntil(votingEndsAt);
    const lateVote = await api(gateway, tokens.voter, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'governance.vote',
        input: {
          proposal_id: proposal.proposal_id,
          chamber: 'human',
          choice: 'for',
          weight: 1
        }
      }
    }, 400);
    checks.late_vote_rejected = lateVote.error?.code === 'validation_error'
      && /Voting period is closed|not open for voting/i.test(lateVote.error?.message ?? '');

    const finalized = await independentlyApprovedIntent({
      gateway,
      requesterToken: tokens.operator,
      requesterId: principals.operator,
      approverToken: tokens.approver,
      action: 'governance.finalize',
      confirmation: 'confirm:governance.finalize',
      input: { proposal_id: proposal.proposal_id },
      checks,
      checkPrefix: 'finalize'
    });
    checks.proposal_finalized_through_gateway = finalized.status === 'completed';

    if (Date.now() < new Date(activateAfter).valueOf() - 500) {
      const earlyActivation = await independentlyApprovedIntent({
        gateway,
        requesterToken: tokens.operator,
        requesterId: principals.operator,
        approverToken: tokens.approver,
        action: 'governance.activate',
        confirmation: 'confirm:governance.activate',
        input: { proposal_id: proposal.proposal_id },
        expectedStatus: 409,
        checks,
        checkPrefix: 'early_activation'
      });
      checks.activation_timelock_enforced = earlyActivation.error?.code === 'proposal_timelocked'
        || /timelock|activate_after|not yet/i.test(earlyActivation.error?.message ?? '');
    } else {
      throw new ValidationError('Intent lifecycle drill reached activation window before testing timelock');
    }

    await waitUntil(activateAfter);
    const activated = await independentlyApprovedIntent({
      gateway,
      requesterToken: tokens.operator,
      requesterId: principals.operator,
      approverToken: tokens.approver,
      action: 'governance.activate',
      confirmation: 'confirm:governance.activate',
      input: { proposal_id: proposal.proposal_id },
      checks,
      checkPrefix: 'activation'
    });
    checks.contract_activated_through_gateway = activated.status === 'completed';

    const unauthorizedRead = await api(
      gateway,
      tokens.observer,
      '/v1/proposals?limit=100',
      {},
      403
    );
    checks.unauthorized_governance_read_rejected = unauthorizedRead.error?.code === 'forbidden';

    const wrongVerifier = buildIntentAttestationRecord(activation, {
      requirement_id: 'INV-FOUR-SERVICE-PATH',
      verdict: 'pass',
      evidence: evidenceFor('verifier-mismatch'),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      verifier: principals.verifierB
    });
    const mismatch = await api(gateway, tokens.verifierA, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'memory.put',
        input: attestationMemoryInput(wrongVerifier)
      }
    }, 400);
    checks.verifier_actor_mismatch_rejected = mismatch.error?.code === 'validation_error';

    const wrongActivation = buildIntentActivationRecord(contract, {
      kernel_version: KERNEL_VERSION,
      source_digest: sha256(`wrong-build:${sourceDigest}`)
    });
    const wrongBuildAttestation = buildIntentAttestationRecord(wrongActivation, {
      requirement_id: 'INV-FOUR-SERVICE-PATH',
      verdict: 'pass',
      evidence: evidenceFor('wrong-build'),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      verifier: principals.verifierA
    });
    const wrongBuild = await api(gateway, tokens.verifierA, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'memory.put',
        input: attestationMemoryInput(wrongBuildAttestation)
      }
    }, 400);
    checks.wrong_build_attestation_rejected = wrongBuild.error?.code === 'validation_error';

    const attestationA = buildIntentAttestationRecord(activation, {
      requirement_id: 'INV-FOUR-SERVICE-PATH',
      verdict: 'pass',
      evidence: evidenceFor('verified-path-a'),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      verifier: principals.verifierA
    });
    const storedA = await api(gateway, tokens.verifierA, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'memory.put',
        input: attestationMemoryInput(attestationA)
      }
    });
    checks.first_verifier_attested_through_gateway = storedA.status === 'completed';

    const oneVerifierState = await intentState(gateway, tokens.operator, activation.contract_id);
    checks.insufficient_verifiers_fail_closed = oneVerifierState.assessment.requirements[0].status === 'unknown'
      && oneVerifierState.reconciliation.state === 'blocked'
      && oneVerifierState.execution_authorized === false;

    const replayedAttestation = await api(gateway, tokens.verifierA, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'memory.put',
        input: attestationMemoryInput(attestationA)
      }
    }, 409);
    checks.content_addressed_attestation_replay_rejected = replayedAttestation.error?.code === 'intent_attestation_replayed';

    const attestationB = buildIntentAttestationRecord(activation, {
      requirement_id: 'INV-FOUR-SERVICE-PATH',
      verdict: 'pass',
      evidence: evidenceFor('verified-path-b'),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      verifier: principals.verifierB
    });
    await api(gateway, tokens.verifierB, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'memory.put',
        input: attestationMemoryInput(attestationB)
      }
    });
    const convergedState = await intentState(gateway, tokens.operator, activation.contract_id);
    const visibleRequirement = convergedState.assessment.requirements[0];
    checks.two_authenticated_verifiers_converge = visibleRequirement.status === 'pass'
      && visibleRequirement.independent_verifier_count === 2
      && convergedState.reconciliation.state === 'converged';
    checks.governance_view_is_privacy_minimized = !('independent_verifiers' in visibleRequirement)
      && !('attestation_ids' in visibleRequirement)
      && !canonicalJson(convergedState).includes(principals.verifierA)
      && !canonicalJson(convergedState).includes(principals.verifierB);
    checks.reconciliation_execution_remains_disabled = convergedState.execution_authorized === false;

    const conflict = buildIntentAttestationRecord(activation, {
      requirement_id: 'INV-FOUR-SERVICE-PATH',
      verdict: 'fail',
      evidence: evidenceFor('conflicting-path'),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      verifier: principals.verifierC
    });
    const storedConflict = await api(gateway, tokens.verifierC, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'memory.put',
        input: attestationMemoryInput(conflict)
      }
    });
    const conflictedState = await intentState(gateway, tokens.operator, activation.contract_id);
    checks.conflicting_evidence_fails_closed = conflictedState.assessment.requirements[0].status === 'unknown'
      && conflictedState.assessment.requirements[0].reason === 'conflicting_attestations'
      && conflictedState.reconciliation.state === 'blocked';

    const revoked = await api(gateway, tokens.verifierC, '/v1/intents', {
      method: 'POST',
      body: {
        action: 'memory.tombstone',
        input: {
          object_id: storedConflict.object_id,
          reason: 'Withdraw conformance-drill conflict attestation.'
        },
        confirmations: ['confirm:memory.tombstone']
      }
    });
    const restoredState = await intentState(gateway, tokens.operator, activation.contract_id);
    checks.verifier_owned_revocation_restores_assessment = revoked.status === 'completed'
      && restoredState.assessment.requirements[0].status === 'pass'
      && restoredState.reconciliation.state === 'converged';

    const idempotencyKey = `intent-drill-idempotency-${crypto.randomUUID()}`;
    await api(gateway, tokens.operator, '/v1/intents', {
      method: 'POST',
      idempotencyKey,
      body: { action: 'system.echo', input: { value: 'first' } }
    });
    const idempotencyConflict = await api(gateway, tokens.operator, '/v1/intents', {
      method: 'POST',
      idempotencyKey,
      body: { action: 'system.echo', input: { value: 'different' } }
    }, 409);
    checks.idempotency_conflict_rejected = idempotencyConflict.error?.code === 'idempotency_conflict';

    const audit = await api(gateway, tokens.operator, '/v1/audit/verify');
    checks.grid_chain_verified_after_lifecycle = audit.valid === true;
    const status = await api(gateway, tokens.operator, '/v1/status');
    const finalState = await intentState(gateway, tokens.operator, activation.contract_id);

    if (Object.values(checks).some(value => value !== true)) {
      throw new ValidationError(`AXIOM Intent lifecycle checks failed: ${canonicalJson(checks)}`);
    }

    const gridService = stack.services.find(service => service.name === 'grid');
    const gridPublicKeyPem = gridService.identity.publicKey.export({
      type: 'spki',
      format: 'pem'
    });
    const unsigned = {
      schema: EVIDENCE_SCHEMA,
      status: 'passed',
      generated_at: new Date().toISOString(),
      scope: 'disposable-four-service-intent-lifecycle-conformance',
      production_promotion_claimed: false,
      reconciliation_execution_claimed: false,
      source: {
        kernel_version: KERNEL_VERSION,
        revision: normalizedRevision,
        commit_bound: commitBound,
        source_digest: sourceDigest
      },
      lifecycle: {
        contract_id: activation.contract_id,
        activation_digest: activation.activation_digest,
        contract_digest: activation.contract_digest,
        graph_digest: activation.graph_digest,
        proposal_id: proposal.proposal_id,
        final_assessment_digest: finalState.assessment.source_assessment_digest,
        final_reconciliation_digest: finalState.reconciliation.reconciliation_digest,
        final_chain_last_hash: status.runtime.grid.last_hash,
        execution_authorized: finalState.execution_authorized
      },
      checks,
      signer: {
        service: 'grid',
        key_id: gridService.identity.keyId,
        public_key_pem: gridPublicKeyPem
      }
    };
    const evidence = {
      ...unsigned,
      attestation: gridService.identity.signObject(unsigned)
    };
    if (Object.values(tokens).some(token => canonicalJson(evidence).includes(token))) {
      throw new ValidationError('Intent lifecycle evidence contains a bearer token');
    }
    verifyIntentLifecycleEvidence(evidence);
    return evidence;
  } finally {
    if (stack) await stack.stop().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  }
}

export function verifyIntentLifecycleEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new ValidationError('Intent lifecycle evidence must be an object');
  }
  if (
    evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || evidence.scope !== 'disposable-four-service-intent-lifecycle-conformance'
    || evidence.production_promotion_claimed !== false
    || evidence.reconciliation_execution_claimed !== false
    || evidence.lifecycle?.execution_authorized !== false
    || evidence.source?.kernel_version !== KERNEL_VERSION
    || !DIGEST.test(evidence.source?.source_digest ?? '')
    || !DIGEST.test(evidence.lifecycle?.activation_digest ?? '')
    || !DIGEST.test(evidence.lifecycle?.contract_digest ?? '')
    || !DIGEST.test(evidence.lifecycle?.graph_digest ?? '')
    || !DIGEST.test(evidence.lifecycle?.final_assessment_digest ?? '')
    || !DIGEST.test(evidence.lifecycle?.final_reconciliation_digest ?? '')
    || !DIGEST.test(evidence.lifecycle?.final_chain_last_hash ?? '')
    || !Object.values(evidence.checks ?? {}).length
    || Object.values(evidence.checks ?? {}).some(value => value !== true)
  ) {
    throw new ValidationError('Intent lifecycle evidence fields are invalid');
  }
  if (
    evidence.source.commit_bound === true
      ? !REVISION.test(evidence.source.revision ?? '')
      : evidence.source.commit_bound !== false || evidence.source.revision !== null
  ) {
    throw new ValidationError('Intent lifecycle source binding is invalid');
  }
  const expectedSourceDigest = sha256(
    evidence.source.commit_bound === true ? evidence.source.revision : UNBOUND_SOURCE
  );
  if (evidence.source.source_digest !== expectedSourceDigest) {
    throw new ValidationError('Intent lifecycle source digest does not match the revision binding');
  }
  if (!Number.isFinite(Date.parse(evidence.generated_at))) {
    throw new ValidationError('Intent lifecycle generated_at is invalid');
  }
  if (new Date(evidence.generated_at).toISOString() !== evidence.generated_at) {
    throw new ValidationError('Intent lifecycle generated_at is not canonical');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer?.public_key_pem);
  } catch {
    throw new ValidationError('Intent lifecycle signer public key is invalid');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (
    evidence.signer?.service !== 'grid'
    || !evidence.signer?.key_id?.endsWith(
      `:${sha256(evidence.signer.public_key_pem).slice(0, 16)}`
    )
    || evidence.attestation?.key_id !== evidence.signer?.key_id
    || !verifyObjectSignature(unsigned, evidence.attestation, publicKey)
  ) {
    throw new ValidationError('Intent lifecycle evidence signature is invalid');
  }
  const forbiddenKeys = /(?:^|_)(?:token|password|secret|private_key|authorization|credential)(?:_|$)/i;
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (forbiddenKeys.test(key)) {
        throw new ValidationError(`Intent lifecycle evidence contains forbidden secret field: ${key}`);
      }
      visit(item);
    }
  };
  visit(evidence);
  return {
    valid: true,
    schema: evidence.schema,
    commit_bound: evidence.source.commit_bound,
    production_promotion_claimed: false,
    reconciliation_execution_claimed: false
  };
}

function intentLifecycleContract() {
  return {
    schema: 'axiom-intent-contract.v1',
    contract_id: 'intent-four-service-conformance',
    title: 'AXIOM Intent Four-Service Conformance',
    mission: 'Prove the authenticated AXIOM Intent lifecycle without authorizing remediation execution.',
    objectives: [],
    invariants: [{
      id: 'INV-FOUR-SERVICE-PATH',
      statement: 'Intent activation, verification, and read-back traverse the ordinary four-service authority and evidence path.',
      severity: 'critical',
      verification: {
        classification: 'deterministic',
        method: 'Run the disposable four-service AXIOM Intent lifecycle conformance drill.',
        evidence_required: ['drill result'],
        minimum_independent_verifiers: 2
      },
      remediation_actions: []
    }],
    authority: {
      autonomous: [],
      approval_required: [],
      forbidden: ['authority.self-expand', 'evidence.fabricate']
    },
    evidence: {
      default_minimum_independent_verifiers: 2
    },
    optimization: {
      priority: ['correctness', 'security', 'verifiability']
    }
  };
}

function evidenceFor(label) {
  return [{
    obligation: 'drill result',
    artifact_digest: sha256(`axiom-intent-lifecycle:${label}`),
    artifact_type: 'conformance-result',
    ref: `conformance:${label}`
  }];
}

async function intentState(gateway, token, contractId) {
  const page = await api(gateway, token, '/v1/proposals?limit=100');
  const proposal = page.proposals?.find(item => item.intent_state?.contract_id === contractId);
  if (!proposal?.intent_state) {
    throw new ValidationError(`Intent governance state is missing for ${contractId}`);
  }
  return proposal.intent_state;
}

async function independentlyApprovedIntent({
  gateway,
  requesterToken,
  requesterId,
  approverToken,
  action,
  confirmation,
  input,
  checks,
  checkPrefix,
  expectedStatus = 200
}) {
  const confirmationRequired = await api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: { action, input }
  }, 409);
  checks[`${checkPrefix}_confirmation_required`] = confirmationRequired.error?.code === 'confirmation_required';
  const approvalRequired = await api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: { action, input, confirmations: [confirmation] }
  }, 409);
  checks[`${checkPrefix}_independent_approval_required`] = approvalRequired.error?.code === 'independent_approval_required';
  const requestDigest = approvalRequired.error?.details?.request_digest;
  const approval = await api(gateway, approverToken, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'approval.grant',
      input: {
        requester: requesterId,
        action,
        request_digest: requestDigest,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }
    }
  });
  checks[`${checkPrefix}_independent_approval_granted`] = approval.status === 'completed'
    && typeof approval.approval_id === 'string';
  return api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: {
      action,
      input,
      confirmations: [confirmation],
      approval_ids: [approval.approval_id]
    }
  }, expectedStatus);
}

async function api(base, token, path, {
  method = 'GET',
  body,
  idempotencyKey = `intent-drill-${crypto.randomUUID()}`
} = {}, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body === undefined ? {} : {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey
      })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  if (response.status !== expectedStatus) {
    throw new ValidationError(
      `Intent lifecycle HTTP ${method} ${path} expected ${expectedStatus}, got ${response.status}: ${canonicalJson(payload)}`
    );
  }
  return payload;
}

async function waitUntil(isoTimestamp) {
  const delay = Math.max(0, new Date(isoTimestamp).valueOf() - Date.now() + 25);
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
}

async function findPortBlock() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const base = 20_000 + Math.floor(Math.random() * 20_000);
    const servers = [];
    try {
      for (let port = base; port < base + 4; port += 1) {
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, '127.0.0.1', resolve);
        });
        servers.push(server);
      }
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
      return base;
    } catch {
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    }
  }
  throw new ValidationError('Unable to reserve a local four-port block for Intent lifecycle drill');
}

async function main() {
  const evidence = await runIntentLifecycleDrill({
    sourceRevision: process.argv[2] ?? process.env.GITHUB_SHA
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`AXIOM Intent lifecycle drill failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
