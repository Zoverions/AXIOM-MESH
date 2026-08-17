import { ValidationError, digestObject } from './canonical.mjs';
import { validateAgentExecutorDryRunPlan } from './agent-executor-dry-run.mjs';
import {
  AgentExecutorConformanceSandbox,
  verifyAgentExecutorConformanceReceipt
} from './agent-executor-conformance-sandbox.mjs';
import {
  restoreAgentTestSessionLifecycleLedger,
  verifyAgentTestSessionLifecycleReceipt,
  verifyAgentTestSessionLifecycleTranscript
} from './agent-test-session-lifecycle.mjs';
import {
  AGENT_EXECUTOR_DURABLE_STATE_POLICY_DIGEST,
  acquireDurableWriterLease,
  assertDurableWriterLease,
  durableId,
  durableLifecycleKey,
  durableLifecycleStatusIsTerminal,
  durableSigner,
  durableStatePaths,
  durableTimestamp,
  loadDurableRecords,
  makeDurableHeadReceipt,
  makeDurableRecord,
  releaseDurableWriterLease,
  verifyAgentExecutorDurableStateReceipt,
  writeDurableRecord
} from './agent-executor-durable-format.mjs';

function assertFunction(value, label) {
  if (typeof value !== 'function') throw new ValidationError(`${label} must be a function`);
  return value;
}

function assertExactHead(receipt, records, { storePublicKey, plan, storeId }) {
  if (receipt === undefined || receipt === null) return;
  const verified = verifyAgentExecutorDurableStateReceipt(receipt, {
    trustedStorePublicKey: storePublicKey,
    plan,
    expectedStoreId: storeId
  });
  const head = records.at(-1);
  if (!head) throw new ValidationError('durable expected head receipt exists but local store has no committed head');
  if (
    verified.statement.generation !== head.statement.generation
    || verified.statement.record_digest !== head.record_digest
  ) throw new ValidationError('durable local state does not match the separately retained expected head');
}

function verifiedLifecycle(transcript, receipt, trustedLifecyclePublicKey) {
  const checked = verifyAgentTestSessionLifecycleTranscript(transcript, {
    trustedLedgerPublicKey: trustedLifecyclePublicKey
  });
  const checkedReceipt = verifyAgentTestSessionLifecycleReceipt(receipt, {
    trustedLedgerPublicKey: trustedLifecyclePublicKey,
    transcript
  });
  return Object.freeze({ transcript: checked, receipt: checkedReceipt });
}

export class AgentExecutorDurableStateStore {
  static open({
    stateRoot,
    storeId,
    storePrivateKey,
    lifecyclePrivateKey,
    plan,
    initialLifecycleTranscript,
    initialLifecycleReceipt,
    expectedHeadReceipt,
    staleLockRecoveryReceipt,
    ownerId = 'executor-durable-owner',
    now,
    leaseSeconds = 300,
    clock = () => new Date().toISOString()
  } = {}) {
    validateAgentExecutorDryRunPlan(plan);
    const normalizedStoreId = durableId(storeId, 'durable storeId');
    const storeSigner = durableSigner(storePrivateKey);
    const lifecycleSigner = durableLifecycleKey(lifecyclePrivateKey);
    if (lifecycleSigner.keyId !== plan.bindings.lifecycle_key_id) {
      throw new ValidationError('durable lifecycle private key does not match plan lifecycle key');
    }
    const trustedLifecyclePublicKey = lifecycleSigner.publicKey;
    const paths = durableStatePaths(stateRoot, normalizedStoreId);
    const context = {
      storeId: normalizedStoreId,
      storePublicKey: storeSigner.publicKey,
      lifecyclePublicKey: trustedLifecyclePublicKey,
      plan
    };
    let records = loadDurableRecords(paths, context);
    assertExactHead(expectedHeadReceipt, records, {
      storePublicKey: storeSigner.publicKey,
      plan,
      storeId: normalizedStoreId
    });
    const lease = acquireDurableWriterLease({
      paths,
      storeId: normalizedStoreId,
      storeSigner,
      plan,
      records,
      now: durableTimestamp(now ?? clock(), 'durable open time'),
      leaseSeconds,
      staleLockRecoveryReceipt,
      ownerId
    });

    let ledger;
    try {
      if (records.length === 0) {
        if (!initialLifecycleTranscript || !initialLifecycleReceipt) {
          throw new ValidationError('durable empty store requires initial issued lifecycle evidence');
        }
        const initial = verifiedLifecycle(
          initialLifecycleTranscript,
          initialLifecycleReceipt,
          trustedLifecyclePublicKey
        );
        if (
          initial.transcript.status !== 'issued'
          || initial.transcript.event_count !== 1
          || initial.transcript.authorization_id !== plan.bindings.authorization_id
          || initial.transcript.authorization_digest !== plan.bindings.authorization_digest
          || initial.transcript.ledger_id !== plan.bindings.lifecycle_ledger_id
          || initial.transcript.ledger_key_id !== plan.bindings.lifecycle_key_id
          || initial.transcript.head_event_digest !== plan.bindings.lifecycle_head_event_digest
          || initial.receipt.receipt_digest !== plan.bindings.lifecycle_receipt_digest
        ) throw new ValidationError('durable initial lifecycle evidence does not bind exact issued plan head');
        ledger = restoreAgentTestSessionLifecycleLedger(initialLifecycleTranscript, {
          ledgerPrivateKey: lifecycleSigner.privateKey
        });
        const genesis = makeDurableRecord({
          storeId: normalizedStoreId,
          storeSigner,
          plan,
          previous: null,
          recordType: 'initialize',
          committedAt: now ?? clock(),
          lifecycleTranscript: ledger.exportTranscript(),
          lifecycleReceipt: initialLifecycleReceipt,
          lifecyclePublicKey: trustedLifecyclePublicKey
        });
        writeDurableRecord(paths, genesis);
        records = [genesis];
      } else {
        const head = records.at(-1);
        ledger = restoreAgentTestSessionLifecycleLedger(head.payload.lifecycle_transcript, {
          ledgerPrivateKey: lifecycleSigner.privateKey
        });
      }
    } catch (error) {
      try {
        releaseDurableWriterLease({
          paths,
          lease,
          storeId: normalizedStoreId,
          storePublicKey: storeSigner.publicKey,
          plan
        });
      } catch {}
      throw error;
    }

    return new AgentExecutorDurableStateStore({
      paths,
      storeId: normalizedStoreId,
      storeSigner,
      lifecycleSigner,
      plan,
      records,
      ledger,
      lease,
      clock
    });
  }

  constructor({ paths, storeId, storeSigner, lifecycleSigner, plan, records, ledger, lease, clock }) {
    this.paths = paths;
    this.storeId = storeId;
    this.storeSigner = storeSigner;
    this.lifecycleSigner = lifecycleSigner;
    this.plan = plan;
    this.records = [...records];
    this.ledger = ledger;
    this.lease = lease;
    this.clock = assertFunction(clock, 'durable store clock');
    this.closed = false;
    this.failed = false;
  }

  get storePublicKey() {
    return this.storeSigner.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  get lifecyclePublicKey() {
    return this.lifecycleSigner.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  get currentRecord() {
    return structuredClone(this.records.at(-1));
  }

  get generation() {
    return this.records.at(-1).statement.generation;
  }

  get status() {
    return this.records.at(-1).statement.lifecycle_status;
  }

  get canResume() {
    return this.status === 'issued';
  }

  get recoveryClassification() {
    if (this.status === 'issued') return 'issued-resumable';
    if (this.status === 'consumed') return 'consumed-uncertain-no-resume';
    if (durableLifecycleStatusIsTerminal(this.status)) return `terminal-${this.status}`;
    return 'unknown-fail-closed';
  }

  _context() {
    return {
      storeId: this.storeId,
      storePublicKey: this.storeSigner.publicKey,
      lifecyclePublicKey: this.lifecycleSigner.publicKey,
      plan: this.plan
    };
  }

  _ensureWritable() {
    if (this.closed) throw new ValidationError('durable store is closed');
    if (this.failed) throw new ValidationError('durable store entered fail-closed state after uncertain commit');
    assertDurableWriterLease({
      paths: this.paths,
      lease: this.lease,
      storeId: this.storeId,
      storePublicKey: this.storeSigner.publicKey,
      plan: this.plan,
      clock: this.clock
    });
    const disk = loadDurableRecords(this.paths, this._context());
    const localHead = this.records.at(-1);
    const diskHead = disk.at(-1);
    if (
      disk.length !== this.records.length
      || diskHead?.record_digest !== localHead?.record_digest
    ) {
      this.failed = true;
      throw new ValidationError('durable store on-disk head drifted from active writer state');
    }
  }

  _commit({ recordType, committedAt, conformanceReceipt = null }) {
    this._ensureWritable();
    const lifecycleTranscript = this.ledger.exportTranscript();
    const lifecycleReceipt = this.ledger.receipt({ generatedAt: committedAt });
    const record = makeDurableRecord({
      storeId: this.storeId,
      storeSigner: this.storeSigner,
      plan: this.plan,
      previous: this.records.at(-1),
      recordType,
      committedAt,
      lifecycleTranscript,
      lifecycleReceipt,
      lifecyclePublicKey: this.lifecycleSigner.publicKey,
      conformanceReceipt
    });
    try {
      writeDurableRecord(this.paths, record);
    } catch (error) {
      this.failed = true;
      throw error;
    }
    this.records.push(record);
    return structuredClone(record);
  }

  createLifecycleClone() {
    return restoreAgentTestSessionLifecycleLedger(this.records.at(-1).payload.lifecycle_transcript, {
      ledgerPrivateKey: this.lifecycleSigner.privateKey
    });
  }

  consume({ eventId, occurredAt, revocationState = 'active' } = {}) {
    this._ensureWritable();
    const result = this.ledger.consume({ eventId, occurredAt, revocationState });
    const record = this._commit({ recordType: 'consume', committedAt: occurredAt });
    if (record.statement.lifecycle_head_event_digest !== result.event.event_digest) {
      this.failed = true;
      throw new ValidationError('durable consume record does not bind consumed event');
    }
    return Object.freeze({ result, record });
  }

  revoke({ eventId, occurredAt, reasonCode = 'sponsor-revoked' } = {}) {
    this._ensureWritable();
    const result = this.ledger.revoke({ eventId, occurredAt, reasonCode });
    return Object.freeze({ result, record: this._commit({ recordType: 'revoke', committedAt: occurredAt }) });
  }

  expire({ eventId, occurredAt } = {}) {
    this._ensureWritable();
    const result = this.ledger.expire({ eventId, occurredAt });
    return Object.freeze({ result, record: this._commit({ recordType: 'expire', committedAt: occurredAt }) });
  }

  interrupt({ eventId, occurredAt, reasonCode = 'durable-executor-interrupted' } = {}) {
    this._ensureWritable();
    const result = this.ledger.interrupt({ eventId, occurredAt, reasonCode });
    return Object.freeze({ result, record: this._commit({ recordType: 'interrupt', committedAt: occurredAt }) });
  }

  complete({ eventId, occurredAt } = {}) {
    this._ensureWritable();
    const result = this.ledger.complete({ eventId, occurredAt });
    return Object.freeze({ result, record: this._commit({ recordType: 'complete', committedAt: occurredAt }) });
  }

  attachConformanceReceipt(receipt, { trustedExecutorPublicKey, committedAt } = {}) {
    this._ensureWritable();
    const checked = verifyAgentExecutorConformanceReceipt(receipt, {
      trustedExecutorPublicKey,
      plan: this.plan
    });
    const head = this.records.at(-1);
    if (
      checked.statement.lifecycle_status !== head.statement.lifecycle_status
      || checked.statement.lifecycle_head_event_digest !== head.statement.lifecycle_head_event_digest
      || checked.statement.lifecycle_receipt_digest !== head.statement.lifecycle_receipt_digest
    ) throw new ValidationError('durable conformance receipt does not bind current lifecycle head');
    return this._commit({
      recordType: 'attach-conformance-receipt',
      committedAt,
      conformanceReceipt: checked
    });
  }

  headReceipt({ generatedAt } = {}) {
    return makeDurableHeadReceipt({
      storeId: this.storeId,
      storeSigner: this.storeSigner,
      head: this.records.at(-1),
      generatedAt
    });
  }

  release() {
    if (this.closed) return false;
    const released = releaseDurableWriterLease({
      paths: this.paths,
      lease: this.lease,
      storeId: this.storeId,
      storePublicKey: this.storeSigner.publicKey,
      plan: this.plan
    });
    this.closed = true;
    return released;
  }
}

export class AgentExecutorDurableConformanceController {
  constructor({
    durableStore,
    executorId,
    executorPrivateKey,
    startedAt,
    resolutionSnapshot = {}
  } = {}) {
    if (!(durableStore instanceof AgentExecutorDurableStateStore)) {
      throw new ValidationError('durable controller requires AgentExecutorDurableStateStore');
    }
    if (!durableStore.canResume) {
      throw new ValidationError(`durable controller cannot resume ${durableStore.recoveryClassification}`);
    }
    this.store = durableStore;
    this.sandbox = new AgentExecutorConformanceSandbox({
      plan: durableStore.plan,
      lifecycleLedger: durableStore.createLifecycleClone(),
      compiledLifecycleReceipt: durableStore.currentRecord.payload.lifecycle_receipt,
      trustedLifecycleLedgerPublicKey: durableStore.lifecyclePublicKey,
      executorId,
      executorPrivateKey,
      startedAt,
      resolutionSnapshot
    });
  }

  admit(rawRequest) {
    try {
      this.sandbox._validateRequest(rawRequest);
    } catch {
      return this.sandbox.admit(rawRequest);
    }

    if (!this.sandbox.lifecycleConsumptionEventDigest) {
      const eventId = `executor-consume:${this.store.plan.plan_digest.slice(0, 24)}`;
      const durable = this.store.consume({
        eventId,
        occurredAt: rawRequest.observed_at,
        revocationState: 'active'
      });
      const result = this.sandbox.admit(rawRequest);
      if (result.decision !== 'admitted') {
        if (this.store.status === 'consumed') {
          this.store.interrupt({
            eventId: 'executor-durable-admission-mismatch',
            occurredAt: rawRequest.observed_at,
            reasonCode: 'virtual-admission-mismatch'
          });
        }
        return result;
      }
      if (this.sandbox.lifecycleConsumptionEventDigest !== durable.result.event.event_digest) {
        this.store.failed = true;
        throw new ValidationError('durable and virtual lifecycle consumption diverged');
      }
      return result;
    }

    const result = this.sandbox.admit(rawRequest);
    if (result.decision === 'denied' && this.store.status === 'consumed') {
      const observation = result.observation;
      const durable = this.store.interrupt({
        eventId: `executor-interrupt:${observation.sequence}`,
        occurredAt: observation.observed_at,
        reasonCode: 'executor-policy-denied'
      });
      const virtualHead = verifyAgentTestSessionLifecycleTranscript(
        this.sandbox.lifecycleLedger.exportTranscript(),
        { trustedLedgerPublicKey: this.store.lifecyclePublicKey }
      );
      if (virtualHead.head_event_digest !== durable.record.statement.lifecycle_head_event_digest) {
        this.store.failed = true;
        throw new ValidationError('durable and virtual interruption diverged');
      }
    }
    return result;
  }

  interrupt({ eventId, occurredAt, reasonCode = 'executor-conformance-interrupted' } = {}) {
    const virtual = this.sandbox.interrupt({ eventId, occurredAt, reasonCode });
    const durable = this.store.interrupt({ eventId, occurredAt, reasonCode });
    if (virtual.event.event_digest !== durable.result.event.event_digest) {
      this.store.failed = true;
      throw new ValidationError('durable and virtual manual interruption diverged');
    }
    return virtual;
  }

  complete({ eventId, occurredAt } = {}) {
    const virtual = this.sandbox.complete({ eventId, occurredAt });
    const durable = this.store.complete({ eventId, occurredAt });
    if (virtual.event.event_digest !== durable.result.event.event_digest) {
      this.store.failed = true;
      throw new ValidationError('durable and virtual completion diverged');
    }
    return virtual;
  }

  receipt({ finishedAt } = {}) {
    const receipt = this.sandbox.receipt({ finishedAt });
    this.store.attachConformanceReceipt(receipt, {
      trustedExecutorPublicKey: this.sandbox.executorPublicKey,
      committedAt: finishedAt
    });
    return receipt;
  }

  get executorPublicKey() {
    return this.sandbox.executorPublicKey;
  }
}

export function durableStateBindingDigest(store) {
  if (!(store instanceof AgentExecutorDurableStateStore)) {
    throw new ValidationError('durable state binding digest requires a durable store');
  }
  return digestObject({
    policy_digest: AGENT_EXECUTOR_DURABLE_STATE_POLICY_DIGEST,
    store_id: store.storeId,
    plan_digest: store.plan.plan_digest,
    generation: store.generation,
    record_digest: store.currentRecord.record_digest,
    lifecycle_status: store.status
  });
}
