import { createPublicKey, randomBytes, verify } from 'node:crypto';
import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  canonicalJson,
  digestObject,
  newId,
  sha256
} from '../lib/canonical.mjs';
import { validateImportBundle } from '../lib/importer.mjs';
import { validateAuthorityReducingPolicy } from '../lib/policy.mjs';
import {
  verifyNodeAdmission,
  verifyNodeRenewal,
  verifyStorageOffer
} from '../lib/nodes.mjs';
import { recipientKeyMetadata } from '../lib/recipient-encryption.mjs';
import { verifyCausalBundle } from '../lib/causal-sync.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function executeBuiltin({ tool, intent }) {
  assertPlainObject(intent, 'intent');
  const action = assertString(intent.action, 'intent.action', {
    max: 128,
    pattern: /^[a-z][a-z0-9.-]+$/
  });
  const input = assertPlainObject(intent.input ?? {}, 'intent.input');
  if (tool === 'builtin.echo') {
    if (action !== 'system.echo') throw new ValidationError('Capability tool does not match intent action');
    return { output: structuredClone(input) };
  }
  if (tool === 'builtin.hash') {
    if (action !== 'system.hash') throw new ValidationError('Capability tool does not match intent action');
    return { output: { algorithm: 'sha256', digest: digestObject(input) } };
  }
  if (tool !== 'builtin.validate-mutation') throw new ValidationError('Requested tool is unavailable');
  return mutationFor(action, input, intent.principal);
}

function mutationFor(action, input, principal) {
  const principalId = assertString(principal.id, 'principal.id', { max: 160, pattern: PRINCIPAL_ID });
  switch (action) {
    case 'capsule.register':
      return registerCapsule(input, principalId);
    case 'capsule.revoke':
      return {
        output: { revoked: true, digest: digest(input.digest) },
        mutation: {
          kind: 'capsule.revoked',
          subject: digest(input.digest),
          payload: { digest: digest(input.digest), reason: assertString(input.reason, 'reason', { max: 1000 }) }
        }
      };
    case 'consent.grant':
      return grantConsent(input, principalId);
    case 'consent.revoke':
      return revokeConsent(input, principalId);
    case 'approval.grant':
      return grantApproval(input, principalId);
    case 'governance.propose':
      return createProposal(input, principalId);
    case 'governance.vote':
      return createVote(input, principal);
    case 'governance.finalize':
      return finalizeProposal(input, principalId);
    case 'governance.activate':
      return activateProposal(input, principalId);
    case 'governance.verify':
      return verifyProposal(input, principalId);
    case 'governance.rollback':
      return rollbackProposal(input, principalId);
    case 'governance.emergency':
      return createEmergencyPolicy(input, principalId);
    case 'governance.emergency.review':
      return reviewEmergencyPolicy(input, principalId);
    case 'governance.appeal':
      return createGovernanceAppeal(input, principalId);
    case 'node.register':
      return registerNode(input, principalId);
    case 'node.renew':
      return renewNode(input, principalId);
    case 'node.quarantine':
      return quarantineNode(input, principalId);
    case 'storage.offer':
      return createStorageOffer(input, principalId);
    case 'sync.apply':
      return applyCausalSync(input, principalId);
    case 'backup.create':
      return createBackupRequest(principalId);
    case 'memory.put':
      return putMemory(input, principalId);
    case 'memory.link':
      return linkMemory(input, principalId);
    case 'memory.tombstone':
      return tombstoneMemory(input, principalId);
    case 'accounting.account.create':
      return createAccountingAccount(input, principalId);
    case 'accounting.journal.post':
      return postAccountingJournal(input, principalId);
    case 'export.create':
      return createExport(input, principalId);
    case 'import.stage':
      return stageImport(input, principalId);
    case 'import.apply':
      return applyImport(input, principalId);
    default:
      throw new ValidationError(`No safe mutation validator is registered for ${action}`);
  }
}

function stageImport(input, principal) {
  const manifest = structuredClone(assertPlainObject(input.manifest, 'manifest'));
  const bundle = assertString(input.bundle, 'bundle', { min: 0, max: 900_000 });
  const gridPublicKey = assertString(input.grid_public_key, 'grid_public_key', { max: 8192 });
  const validated = validateImportBundle({ manifest, bundle, gridPublicKey });
  const importId = newId('import');
  return {
    output: {
      import_id: importId,
      status: 'staged',
      source_principal: validated.verification.principal,
      source_signer: validated.verification.signer,
      bundle_digest: validated.bundle_digest,
      record_count: validated.records.length
    },
    mutation: {
      kind: 'import.staged',
      subject: importId,
      payload: {
        import_id: importId,
        principal,
        manifest,
        bundle,
        grid_public_key: gridPublicKey
      }
    }
  };
}

function applyImport(input, principal) {
  const importId = assertString(input.import_id, 'import_id', { max: 160, pattern: PRINCIPAL_ID });
  return {
    output: { import_id: importId, status: 'applied' },
    mutation: {
      kind: 'import.applied',
      subject: importId,
      payload: { import_id: importId, principal }
    }
  };
}

function putMemory(input, owner) {
  const kind = assertString(input.kind, 'kind', {
    max: 128,
    pattern: /^[a-z][a-z0-9.-]+$/
  });
  const content = structuredClone(assertPlainObject(input.content, 'content'));
  const metadata = structuredClone(assertPlainObject(input.metadata ?? {}, 'metadata'));
  const contentDigest = digestObject({ owner, kind, content, metadata });
  const objectId = `memory_${contentDigest}`;
  return {
    output: { object_id: objectId, content_digest: contentDigest, status: 'active' },
    mutation: {
      kind: 'memory.put',
      subject: objectId,
      payload: { object_id: objectId, owner, kind, content, metadata, content_digest: contentDigest }
    }
  };
}

function linkMemory(input, owner) {
  const fromId = assertString(input.from_id, 'from_id', { max: 160, pattern: PRINCIPAL_ID });
  const toId = assertString(input.to_id, 'to_id', { max: 160, pattern: PRINCIPAL_ID });
  const relation = assertString(input.relation, 'relation', {
    max: 128,
    pattern: /^[a-z][a-z0-9.-]+$/
  });
  const metadata = structuredClone(assertPlainObject(input.metadata ?? {}, 'metadata'));
  const edgeId = `edge_${digestObject({
    owner,
    from_id: fromId,
    to_id: toId,
    relation,
    metadata
  })}`;
  return {
    output: { edge_id: edgeId, status: 'active' },
    mutation: {
      kind: 'memory.linked',
      subject: edgeId,
      payload: {
        edge_id: edgeId,
        owner,
        from_id: fromId,
        to_id: toId,
        relation,
        metadata
      }
    }
  };
}

function tombstoneMemory(input, owner) {
  const objectId = assertString(input.object_id, 'object_id', { max: 160, pattern: PRINCIPAL_ID });
  return {
    output: { object_id: objectId, status: 'tombstoned' },
    mutation: {
      kind: 'memory.tombstoned',
      subject: objectId,
      payload: {
        object_id: objectId,
        owner,
        reason: assertString(input.reason, 'reason', { max: 1000 })
      }
    }
  };
}

function createAccountingAccount(input, owner) {
  const accountId = newId('account');
  const unit = assertString(input.unit, 'unit', {
    max: 16,
    pattern: /^[A-Z][A-Z0-9._-]{0,15}$/
  });
  const name = assertString(input.name, 'name', { max: 200 });
  return {
    output: { account_id: accountId, owner, unit, name, status: 'active' },
    mutation: {
      kind: 'accounting.account.created',
      subject: accountId,
      payload: { account_id: accountId, owner, unit, name }
    }
  };
}

function postAccountingJournal(input, owner) {
  const unit = assertString(input.unit, 'unit', {
    max: 16,
    pattern: /^[A-Z][A-Z0-9._-]{0,15}$/
  });
  const reference = assertString(input.reference, 'reference', { max: 200 });
  const memo = assertString(input.memo ?? '', 'memo', { min: 0, max: 2000 });
  if (!Array.isArray(input.entries) || input.entries.length < 2 || input.entries.length > 256) {
    throw new ValidationError('entries must contain 2-256 journal lines');
  }
  let total = 0;
  const entries = input.entries.map((raw, index) => {
    const entry = assertPlainObject(raw, `entries[${index}]`);
    const amount = entry.amount;
    if (!Number.isSafeInteger(amount) || amount === 0) {
      throw new ValidationError(`entries[${index}].amount must be a non-zero safe integer`);
    }
    total += amount;
    if (!Number.isSafeInteger(total)) throw new ValidationError('Journal total exceeds safe integer range');
    return {
      account_id: assertString(entry.account_id, `entries[${index}].account_id`, {
        max: 160,
        pattern: PRINCIPAL_ID
      }),
      amount,
      metadata: structuredClone(assertPlainObject(entry.metadata ?? {}, `entries[${index}].metadata`))
    };
  });
  if (total !== 0) throw new ValidationError('Journal entries must sum to zero');
  const journalId = newId('journal');
  return {
    output: { journal_id: journalId, owner, unit, balanced: true, status: 'posted' },
    mutation: {
      kind: 'accounting.journal.posted',
      subject: journalId,
      payload: { journal_id: journalId, owner, unit, reference, memo, entries }
    }
  };
}

function grantApproval(input, approver) {
  const requester = assertString(input.requester, 'requester', { max: 160, pattern: PRINCIPAL_ID });
  if (requester === approver) throw new ValidationError('An approver must be independent from the requester');
  const action = assertString(input.action, 'action', {
    max: 128,
    pattern: /^[a-z][a-z0-9.-]+$/
  });
  const requestDigest = digest(input.request_digest);
  const expiresAt = futureDate(input.expires_at, 'expires_at');
  const approvalId = newId('approval');
  return {
    output: {
      approval_id: approvalId,
      requester,
      action,
      request_digest: requestDigest,
      expires_at: expiresAt,
      status: 'active'
    },
    mutation: {
      kind: 'approval.granted',
      subject: approvalId,
      payload: {
        approval_id: approvalId,
        approver,
        requester,
        action,
        request_digest: requestDigest,
        expires_at: expiresAt
      }
    }
  };
}

function registerCapsule(input, principalId) {
  const manifest = assertPlainObject(input.manifest, 'manifest');
  const capsuleId = assertString(manifest.capsule_id, 'manifest.capsule_id', {
    max: 128,
    pattern: /^[a-z][a-z0-9.-]{2,127}$/
  });
  const version = assertString(manifest.version, 'manifest.version', {
    max: 64,
    pattern: /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/
  });
  assertString(manifest.name, 'manifest.name', { max: 200 });
  assertString(manifest.description, 'manifest.description', { max: 2000 });
  assertStringArray(manifest.capabilities, 'manifest.capabilities', { maxItems: 64, itemMax: 160 });
  assertPlainObject(manifest.constraints, 'manifest.constraints');
  assertPlainObject(manifest.schemas, 'manifest.schemas');
  const source = assertPlainObject(manifest.source, 'manifest.source');
  assertString(source.type, 'manifest.source.type', {
    max: 32,
    pattern: /^(git|registry|mcp|api|native)$/
  });
  digest(source.digest);
  digest(manifest.sbom_digest);
  const issuer = assertPlainObject(manifest.issuer, 'manifest.issuer');
  assertString(issuer.id, 'manifest.issuer.id', { max: 160, pattern: PRINCIPAL_ID });
  assertString(issuer.public_key, 'manifest.issuer.public_key', { max: 8192 });
  const signature = assertString(manifest.signature, 'manifest.signature', { max: 1024 });
  const unsigned = structuredClone(manifest);
  delete unsigned.signature;
  let publicKey;
  try {
    publicKey = createPublicKey(issuer.public_key);
  } catch {
    throw new ValidationError('Capsule issuer public key is invalid');
  }
  let valid = false;
  try {
    valid = verify(null, Buffer.from(canonicalJson(unsigned)), publicKey, Buffer.from(signature, 'base64url'));
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('Capsule manifest signature is invalid');
  const manifestDigest = digestObject(manifest);
  return {
    output: {
      capsule_id: capsuleId,
      version,
      digest: manifestDigest,
      status: 'active'
    },
    mutation: {
      kind: 'capsule.registered',
      subject: `${capsuleId}:${version}`,
      payload: {
        capsule_id: capsuleId,
        version,
        digest: manifestDigest,
        manifest,
        signer: `${issuer.id}:${sha256(issuer.public_key).slice(0, 16)}`,
        registered_by: principalId
      }
    }
  };
}

function grantConsent(input, principalId) {
  const subject = assertString(input.subject ?? principalId, 'subject', { max: 160, pattern: PRINCIPAL_ID });
  if (subject !== principalId) throw new ValidationError('A principal may only grant consent for itself');
  const controller = assertString(input.controller, 'controller', { max: 160, pattern: PRINCIPAL_ID });
  const purpose = assertString(input.purpose, 'purpose', { max: 512 });
  const scopes = [...new Set(assertStringArray(input.scopes, 'scopes', { maxItems: 64, itemMax: 160 }))].sort();
  if (!scopes.length) throw new ValidationError('At least one consent scope is required');
  const expiresAt = futureDate(input.expires_at, 'expires_at');
  const consentId = newId('consent');
  const revocationHandle = randomBytes(32).toString('base64url');
  return {
    output: {
      consent_id: consentId,
      revocation_handle: revocationHandle,
      expires_at: expiresAt
    },
    mutation: {
      kind: 'consent.granted',
      subject: consentId,
      payload: {
        consent_id: consentId,
        subject,
        controller,
        purpose,
        scopes,
        expires_at: expiresAt,
        revocation_handle_hash: sha256(revocationHandle)
      }
    }
  };
}

function revokeConsent(input, principalId) {
  const consentId = assertString(input.consent_id, 'consent_id', { max: 160, pattern: PRINCIPAL_ID });
  const handle = assertString(input.revocation_handle, 'revocation_handle', { min: 32, max: 256 });
  return {
    output: { consent_id: consentId, revoked: true },
    mutation: {
      kind: 'consent.revoked',
      subject: consentId,
      payload: {
        consent_id: consentId,
        revoked_by: principalId,
        revocation_handle_hash: sha256(handle)
      }
    }
  };
}

function createProposal(input, principalId) {
  const proposalId = newId('proposal');
  const title = assertString(input.title, 'title', { max: 200 });
  const body = assertString(input.body, 'body', { max: 20_000 });
  const action = normalizeGovernanceAction(input.action);
  const votingEndsAt = futureDate(input.voting_ends_at, 'voting_ends_at');
  const activateAfter = futureDate(input.activate_after, 'activate_after');
  if (new Date(activateAfter) <= new Date(votingEndsAt)) {
    throw new ValidationError('activate_after must be later than voting_ends_at');
  }
  return {
    output: { proposal_id: proposalId, status: 'voting' },
    mutation: {
      kind: 'governance.proposed',
      subject: proposalId,
      payload: {
        proposal_id: proposalId,
        proposer: principalId,
        title,
        body,
        action,
        voting_ends_at: votingEndsAt,
        activate_after: activateAfter
      }
    }
  };
}

function finalizeProposal(input, principal) {
  const proposalId = assertString(input.proposal_id, 'proposal_id', { max: 160, pattern: PRINCIPAL_ID });
  return {
    output: { proposal_id: proposalId, finalization_requested: true },
    mutation: {
      kind: 'governance.finalized',
      subject: proposalId,
      payload: { proposal_id: proposalId, finalized_by: principal }
    }
  };
}

function activateProposal(input, principal) {
  const proposalId = assertString(input.proposal_id, 'proposal_id', { max: 160, pattern: PRINCIPAL_ID });
  return {
    output: { proposal_id: proposalId, activation_requested: true },
    mutation: {
      kind: 'governance.activated',
      subject: proposalId,
      payload: { proposal_id: proposalId, activated_by: principal }
    }
  };
}

function verifyProposal(input, principal) {
  const proposalId = assertString(input.proposal_id, 'proposal_id', { max: 160, pattern: PRINCIPAL_ID });
  const verificationDigest = digest(input.verification_digest);
  return {
    output: { proposal_id: proposalId, verification_digest: verificationDigest, status: 'verified' },
    mutation: {
      kind: 'governance.verified',
      subject: proposalId,
      payload: { proposal_id: proposalId, verified_by: principal, verification_digest: verificationDigest }
    }
  };
}

function rollbackProposal(input, principal) {
  const proposalId = assertString(input.proposal_id, 'proposal_id', { max: 160, pattern: PRINCIPAL_ID });
  const reason = assertString(input.reason, 'reason', { max: 2000 });
  return {
    output: { proposal_id: proposalId, status: 'rolled_back' },
    mutation: {
      kind: 'governance.rolled-back',
      subject: proposalId,
      payload: { proposal_id: proposalId, rolled_back_by: principal, reason }
    }
  };
}

function createEmergencyPolicy(input, principal) {
  const policy = structuredClone(assertPlainObject(input.policy, 'policy'));
  validateAuthorityReducingPolicy(policy);
  const expiresAt = futureDate(input.expires_at, 'expires_at');
  if (new Date(expiresAt).valueOf() - Date.now() > 86_400_000) {
    throw new ValidationError('Emergency policy may remain active for at most 24 hours');
  }
  const reviewBy = futureDate(input.review_by, 'review_by');
  if (new Date(reviewBy) < new Date(expiresAt)) {
    throw new ValidationError('Emergency review cannot be due before expiry');
  }
  const overlayId = newId('emergency');
  return {
    output: { overlay_id: overlayId, status: 'active', expires_at: expiresAt, review_by: reviewBy },
    mutation: {
      kind: 'governance.emergency.activated',
      subject: overlayId,
      payload: {
        overlay_id: overlayId,
        activated_by: principal,
        reason: assertString(input.reason, 'reason', { max: 2000 }),
        policy,
        policy_digest: digestObject(policy),
        expires_at: expiresAt,
        review_by: reviewBy
      }
    }
  };
}

function reviewEmergencyPolicy(input, principal) {
  const overlayId = assertString(input.overlay_id, 'overlay_id', { max: 160, pattern: PRINCIPAL_ID });
  return {
    output: { overlay_id: overlayId, reviewed: true },
    mutation: {
      kind: 'governance.emergency.reviewed',
      subject: overlayId,
      payload: {
        overlay_id: overlayId,
        reviewed_by: principal,
        findings: assertString(input.findings, 'findings', { max: 5000 })
      }
    }
  };
}

function createGovernanceAppeal(input, appellant) {
  const appealId = newId('appeal');
  const targetType = assertString(input.target_type, 'target_type', {
    max: 64,
    pattern: /^(proposal|policy|emergency|decision)$/
  });
  const targetId = assertString(input.target_id, 'target_id', { max: 160, pattern: PRINCIPAL_ID });
  const grounds = structuredClone(assertPlainObject(input.grounds, 'grounds'));
  const desiredResolution = assertString(input.desired_resolution, 'desired_resolution', { max: 2000 });
  return {
    output: { appeal_id: appealId, status: 'open' },
    mutation: {
      kind: 'governance.appeal.filed',
      subject: appealId,
      payload: {
        appeal_id: appealId,
        appellant,
        target_type: targetType,
        target_id: targetId,
        grounds,
        desired_resolution: desiredResolution
      }
    }
  };
}

function normalizeGovernanceAction(raw) {
  const action = structuredClone(assertPlainObject(raw, 'action'));
  const type = assertString(action.type, 'action.type', {
    max: 64,
    pattern: /^(policy\.overlay|record\.decision)$/
  });
  const rollback = assertPlainObject(action.rollback, 'action.rollback');
  assertString(rollback.description, 'action.rollback.description', { max: 2000 });
  if (type === 'policy.overlay') {
    validateAuthorityReducingPolicy(assertPlainObject(action.policy, 'action.policy'));
  } else {
    assertPlainObject(action.payload, 'action.payload');
  }
  return action;
}

function createVote(input, principal) {
  const proposalId = assertString(input.proposal_id, 'proposal_id', { max: 160, pattern: PRINCIPAL_ID });
  const choice = assertString(input.choice, 'choice', { max: 16, pattern: /^(for|against|abstain)$/ });
  const chamber = principal.type === 'agent' ? 'agent' : 'human';
  return {
    output: { proposal_id: proposalId, voter: principal.id, chamber, choice, weight: 1 },
    mutation: {
      kind: 'governance.voted',
      subject: proposalId,
      payload: {
        proposal_id: proposalId,
        voter: assertString(principal.id, 'principal.id', { max: 160, pattern: PRINCIPAL_ID }),
        chamber,
        choice,
        weight: 1
      }
    }
  };
}

function registerNode(input, owner) {
  const admission = verifyNodeAdmission(input);
  return {
    output: {
      node_id: admission.statement.node_id,
      admission_digest: admission.admission_digest,
      status: 'active'
    },
    mutation: {
      kind: 'node.registered',
      subject: admission.statement.node_id,
      payload: { owner, admission }
    }
  };
}

function renewNode(input, owner) {
  const renewal = verifyNodeRenewal(input);
  return {
    output: {
      node_id: renewal.statement.node_id,
      renewal_digest: renewal.renewal_digest,
      status: 'active'
    },
    mutation: {
      kind: 'node.renewed',
      subject: renewal.statement.node_id,
      payload: { owner, renewal }
    }
  };
}

function quarantineNode(input, quarantinedBy) {
  const nodeId = assertString(input.node_id, 'node_id', { max: 160, pattern: PRINCIPAL_ID });
  const reason = assertString(input.reason, 'reason', { max: 2000 });
  return {
    output: { node_id: nodeId, status: 'quarantined' },
    mutation: {
      kind: 'node.quarantined',
      subject: nodeId,
      payload: { node_id: nodeId, quarantined_by: quarantinedBy, reason }
    }
  };
}

function createStorageOffer(input, owner) {
  const offer = verifyStorageOffer(input);
  return {
    output: {
      offer_id: offer.offer_id,
      offer_digest: offer.offer_digest,
      status: 'active'
    },
    mutation: {
      kind: 'storage.offered',
      subject: offer.offer_id,
      payload: { owner, offer }
    }
  };
}

function applyCausalSync(input, owner) {
  const bundle = structuredClone(assertPlainObject(input.bundle, 'bundle'));
  const verified = verifyCausalBundle(bundle, { expectedOwner: owner });
  return {
    output: {
      bundle_digest: verified.bundle_digest,
      source_node_id: verified.statement.source_node_id,
      update_count: verified.updates.length,
      status: 'applied',
      conflicts_are_visible: true
    },
    mutation: {
      kind: 'sync.bundle.applied',
      subject: verified.bundle_digest,
      payload: {
        owner,
        bundle_digest: verified.bundle_digest,
        bundle
      }
    }
  };
}

function createBackupRequest(principal) {
  const backupId = newId('backup');
  return {
    output: {
      backup_id: backupId,
      status: 'pending',
      restore_requires_stopped_grid: true
    },
    mutation: {
      kind: 'backup.requested',
      subject: backupId,
      payload: { backup_id: backupId, principal }
    }
  };
}

function createExport(input, principalId) {
  const allowed = new Set([
    'identity',
    'events',
    'intents',
    'consents',
    'approvals',
    'capsules',
    'governance',
    'votes',
    'memory',
    'accounting',
    'sync'
  ]);
  const types = [...new Set(assertStringArray(
    input.types ?? [...allowed],
    'types',
    { maxItems: allowed.size, itemMax: 32 }
  ))].sort();
  if (types.some(type => !allowed.has(type))) throw new ValidationError('Export includes an unsupported object type');
  const scope = { types };
  if (input.since !== undefined) scope.since = isoDate(input.since, 'since');
  if (input.until !== undefined) scope.until = isoDate(input.until, 'until');
  if (scope.since && scope.until && new Date(scope.since) > new Date(scope.until)) {
    throw new ValidationError('Export since cannot be after until');
  }
  if (input.object_ids !== undefined) {
    if (!types.includes('memory')) throw new ValidationError('object_ids require the memory export type');
    scope.object_ids = [...new Set(assertStringArray(
      input.object_ids,
      'object_ids',
      { maxItems: 256, itemMax: 160 }
    ).map((value, index) => assertString(value, `object_ids[${index}]`, {
      max: 160,
      pattern: PRINCIPAL_ID
    })))].sort();
    if (!scope.object_ids.length) throw new ValidationError('object_ids cannot be empty');
  }
  if (input.capsule_ids !== undefined) {
    if (!types.includes('capsules')) throw new ValidationError('capsule_ids require the capsules export type');
    scope.capsule_ids = [...new Set(assertStringArray(
      input.capsule_ids,
      'capsule_ids',
      { maxItems: 128, itemMax: 128 }
    ).map((value, index) => assertString(value, `capsule_ids[${index}]`, {
      max: 128,
      pattern: /^[a-z][a-z0-9.-]{2,127}$/
    })))].sort();
    if (!scope.capsule_ids.length) throw new ValidationError('capsule_ids cannot be empty');
  }
  if (scope.object_ids || scope.capsule_ids) {
    const scopedTypes = new Set(['identity', 'events']);
    if (scope.object_ids) scopedTypes.add('memory');
    if (scope.capsule_ids) scopedTypes.add('capsules');
    const unrelated = types.filter(type => !scopedTypes.has(type));
    if (unrelated.length) {
      throw new ValidationError(`Selective export includes unrelated types: ${unrelated.join(', ')}`);
    }
  }
  if (input.recipient_public_key !== undefined) {
    const publicKey = assertString(input.recipient_public_key, 'recipient_public_key', { max: 8192 });
    const recipient = recipientKeyMetadata(publicKey);
    scope.recipient = {
      public_key: publicKey,
      key_id: recipient.key_id
    };
  }
  const exportId = newId('export');
  return {
    output: {
      export_id: exportId,
      status: 'pending',
      encrypted: Boolean(scope.recipient),
      ...(scope.recipient ? { recipient_key_id: scope.recipient.key_id } : {})
    },
    mutation: {
      kind: 'export.requested',
      subject: exportId,
      payload: { export_id: exportId, principal: principalId, scope }
    }
  };
}

function digest(value) {
  return assertString(value, 'digest', { min: 64, max: 64, pattern: DIGEST });
}

function isoDate(value, name) {
  const date = new Date(assertString(value, name, { max: 64 }));
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return date.toISOString();
}

function futureDate(value, name) {
  const result = isoDate(value, name);
  if (new Date(result) <= new Date()) throw new ValidationError(`${name} must be in the future`);
  return result;
}
