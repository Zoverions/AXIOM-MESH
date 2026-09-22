// labs/praxis/analyzer.mjs
//
// Praxis semantic analyzer: epistemic types, inert operations, linear permits/leases.
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.

import { irDigestPraxis } from './canonical.mjs';
import { PraxisTypeError } from './errors.mjs';

function assertFreshName(env, name) {
  if (env.has(name)) {
    throw new PraxisTypeError('PRAXIS_DUPLICATE_BINDING', `binding ${name} already exists`);
  }
}

function requireBinding(env, name) {
  const binding = env.get(name);
  if (!binding) {
    throw new PraxisTypeError('PRAXIS_UNKNOWN_BINDING', `binding ${name} does not exist`);
  }
  return binding;
}

function knowledgeKind(kind) {
  return kind === 'Observed' || kind === 'Verified' || kind === 'Assessment' || kind === 'Receipt';
}

export function analyze(ast) {
  if (!ast || ast.kind !== 'Program') {
    throw new TypeError('analyze expects a Praxis Program AST');
  }

  const env = new Map();
  const ir = [];
  const requiredPermits = [];
  const requiredSecrets = [];
  const requiredPrepared = [];
  const usedPermits = new Set();
  const preparedOperations = new Set();
  const terminalOperations = new Set();

  for (const node of ast.body) {
    assertFreshName(env, node.name);

    switch (node.kind) {
      case 'RequireQuorum': {
        if (
          !Number.isSafeInteger(node.threshold)
          || node.threshold < 1
          || node.threshold > node.members.length
        ) {
          throw new PraxisTypeError(
            'PRAXIS_INVALID_QUORUM',
            'quorum threshold must be an integer between 1 and the declared member count'
          );
        }
        if (new Set(node.members).size !== node.members.length) {
          throw new PraxisTypeError(
            'PRAXIS_INVALID_QUORUM',
            'quorum members must be unique'
          );
        }
        const members = [...node.members].sort();
        env.set(node.name, {
          kind: 'Quorum',
          action: node.action,
          scope: node.scope,
          threshold: node.threshold,
          members,
          linear: true
        });
        requiredPermits.push({
          name: node.name,
          authority_kind: 'Quorum',
          action: node.action,
          scope: node.scope,
          threshold: node.threshold,
          members
        });
        ir.push({
          op: 'REQUIRE_QUORUM',
          name: node.name,
          action: node.action,
          scope: node.scope,
          threshold: node.threshold,
          members
        });
        break;
      }

      case 'RequirePermit':
      case 'RequireLease': {
        const authorityKind = node.kind === 'RequireLease' ? 'Lease' : 'Permit';
        const type = {
          kind: authorityKind,
          action: node.action,
          scope: node.scope,
          linear: true
        };
        env.set(node.name, type);
        requiredPermits.push({
          name: node.name,
          authority_kind: authorityKind,
          action: node.action,
          scope: node.scope
        });
        ir.push({
          op: authorityKind === 'Lease' ? 'REQUIRE_LEASE' : 'REQUIRE_PERMIT',
          name: node.name,
          action: node.action,
          scope: node.scope
        });
        break;
      }

      case 'RequireSecret': {
        env.set(node.name, {
          kind: 'SecretRef',
          secret_kind: node.secretKind
        });
        requiredSecrets.push({
          name: node.name,
          secret_kind: node.secretKind
        });
        ir.push({
          op: 'REQUIRE_SECRET',
          name: node.name,
          secret_kind: node.secretKind
        });
        break;
      }

      case 'RequirePrepared': {
        env.set(node.name, {
          kind: 'PreparedOperation',
          action: node.action,
          scope: node.scope,
          imported: true,
          linear: true,
          irreversibility_known: false,
          irreversible: null
        });
        requiredPrepared.push({
          name: node.name,
          action: node.action,
          scope: node.scope
        });
        ir.push({
          op: 'REQUIRE_PREPARED',
          name: node.name,
          action: node.action,
          scope: node.scope
        });
        break;
      }

      case 'Observe': {
        if (node.value.kind === 'reference') {
          const source = requireBinding(env, node.value.name);
          if (!knowledgeKind(source.kind)) {
            throw new PraxisTypeError(
              'PRAXIS_INFORMATION_FLOW_VIOLATION',
              `observe cannot copy ${source.kind} binding ${node.value.name}`
            );
          }
        }
        env.set(node.name, { kind: 'Observed', provenance: node.provenance });
        ir.push({ op: 'OBSERVE', name: node.name, value: node.value, provenance: node.provenance });
        break;
      }

      case 'Verify': {
        const input = requireBinding(env, node.input);
        if (input.kind !== 'Observed' && input.kind !== 'Verified') {
          throw new PraxisTypeError(
            'PRAXIS_VERIFY_REQUIRES_EVIDENCE',
            `verify requires Observed or Verified input, received ${input.kind}`
          );
        }
        env.set(node.name, { kind: 'Verified', policy: node.policy });
        ir.push({ op: 'VERIFY', name: node.name, input: node.input, policy: node.policy });
        break;
      }

      case 'Assess': {
        const input = requireBinding(env, node.input);
        if (!knowledgeKind(input.kind) || input.kind === 'Receipt') {
          throw new PraxisTypeError(
            'PRAXIS_ASSESS_REQUIRES_KNOWLEDGE',
            `assess requires knowledge input, received ${input.kind}`
          );
        }
        env.set(node.name, { kind: 'Assessment', policy: node.policy });
        ir.push({ op: 'ASSESS', name: node.name, input: node.input, policy: node.policy });
        break;
      }

      case 'Operation': {
        for (const arg of node.args) {
          if (arg.kind !== 'reference') continue;
          const input = requireBinding(env, arg.name);
          if (
            input.kind === 'Permit'
            || input.kind === 'Lease'
            || input.kind === 'Quorum'
            || input.kind === 'SecretRef'
            || input.kind === 'AuthorizedOperation'
            || input.kind === 'PreparedOperation'
          ) {
            throw new PraxisTypeError(
              input.kind === 'SecretRef'
                ? 'PRAXIS_SECRET_EXFILTRATION'
                : 'PRAXIS_AUTHORITY_EXFILTRATION',
              `${input.kind} binding ${arg.name} cannot be embedded as an ordinary operation argument`
            );
          }
        }

        const seenSecrets = new Set();
        for (const secretName of node.secrets) {
          if (seenSecrets.has(secretName)) {
            throw new PraxisTypeError(
              'PRAXIS_DUPLICATE_SECRET_BINDING',
              `secret binding ${secretName} is listed more than once`
            );
          }
          seenSecrets.add(secretName);
          const secret = requireBinding(env, secretName);
          if (secret.kind !== 'SecretRef') {
            throw new PraxisTypeError(
              'PRAXIS_SECRET_REFERENCE_REQUIRED',
              `operation secret binding ${secretName} must be SecretRef, received ${secret.kind}`
            );
          }
        }

        env.set(node.name, {
          kind: 'Operation',
          action: node.action,
          scope: node.scope,
          secrets: [...node.secrets],
          declared_effect: node.declaredEffect,
          irreversibility_known: node.declaredEffect !== null,
          irreversible: node.declaredEffect !== null ? node.declaredIrreversible : null,
          declared_egress: node.declaredEgress
        });
        ir.push({
          op: 'PLAN',
          name: node.name,
          action: node.action,
          scope: node.scope,
          args: node.args,
          secrets: node.secrets,
          declared_effect: node.declaredEffect,
          declared_irreversible: node.declaredEffect !== null ? node.declaredIrreversible : null,
          declared_egress: node.declaredEgress
        });
        break;
      }

      case 'Authorize': {
        const operation = requireBinding(env, node.operation);
        const permit = requireBinding(env, node.permit);

        if (operation.kind !== 'Operation') {
          throw new PraxisTypeError(
            'PRAXIS_AUTHORIZE_REQUIRES_OPERATION',
            `authorize requires Operation, received ${operation.kind}`
          );
        }
        if (permit.kind !== 'Permit' && permit.kind !== 'Lease' && permit.kind !== 'Quorum') {
          throw new PraxisTypeError(
            'PRAXIS_AUTHORIZE_REQUIRES_PERMIT',
            `authorize requires Permit, Lease, or Quorum, received ${permit.kind}`
          );
        }
        if (permit.action !== operation.action || permit.scope !== operation.scope) {
          throw new PraxisTypeError(
            'PRAXIS_AUTHORITY_MISMATCH',
            `permit ${node.permit} grants ${permit.action}@${permit.scope}, operation requires ${operation.action}@${operation.scope}`
          );
        }
        if (usedPermits.has(node.permit)) {
          throw new PraxisTypeError(
            'PRAXIS_LINEAR_AUTHORITY_REUSE',
            `permit ${node.permit} is linear and was already consumed`
          );
        }
        usedPermits.add(node.permit);
        env.set(node.name, {
          kind: 'AuthorizedOperation',
          action: operation.action,
          scope: operation.scope,
          operation: node.operation,
          permit: node.permit,
          linear: true,
          irreversibility_known: operation.irreversibility_known,
          irreversible: operation.irreversible
        });
        ir.push({
          op: 'AUTHORIZE',
          name: node.name,
          operation: node.operation,
          permit: node.permit
        });
        break;
      }

      case 'Prepare': {
        const operation = requireBinding(env, node.operation);
        if (operation.kind !== 'AuthorizedOperation') {
          throw new PraxisTypeError(
            'PRAXIS_PREPARE_REQUIRES_AUTHORITY',
            `prepare requires AuthorizedOperation, received ${operation.kind}`
          );
        }
        if (preparedOperations.has(node.operation)) {
          throw new PraxisTypeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            `authorized operation ${node.operation} was already prepared`
          );
        }
        preparedOperations.add(node.operation);
        env.set(node.name, {
          kind: 'PreparedOperation',
          action: operation.action,
          scope: operation.scope,
          operation: operation.operation,
          permit: operation.permit,
          linear: true,
          irreversibility_known: operation.irreversibility_known,
          irreversible: operation.irreversible
        });
        ir.push({
          op: 'PREPARE',
          name: node.name,
          operation: node.operation
        });
        break;
      }

      case 'Cancel': {
        const operation = requireBinding(env, node.operation);
        if (operation.kind !== 'PreparedOperation') {
          throw new PraxisTypeError(
            'PRAXIS_CANCEL_REQUIRES_PREPARATION',
            `cancel requires PreparedOperation, received ${operation.kind}`
          );
        }
        if (terminalOperations.has(node.operation)) {
          throw new PraxisTypeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            `prepared operation ${node.operation} already has a terminal transition`
          );
        }
        terminalOperations.add(node.operation);
        env.set(node.name, {
          kind: 'CancellationReceipt',
          action: operation.action,
          scope: operation.scope
        });
        ir.push({ op: 'CANCEL', name: node.name, operation: node.operation });
        break;
      }

      case 'Commit': {
        const operation = requireBinding(env, node.operation);
        if (operation.kind !== 'PreparedOperation') {
          throw new PraxisTypeError(
            'PRAXIS_COMMIT_REQUIRES_PREPARATION',
            `commit requires PreparedOperation, received ${operation.kind}`
          );
        }
        if (operation.irreversibility_known && operation.irreversible === true) {
          throw new PraxisTypeError(
            'PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE',
            'statically irreversible prepared operation requires finalize'
          );
        }
        if (terminalOperations.has(node.operation)) {
          throw new PraxisTypeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            `prepared operation ${node.operation} already has a terminal transition`
          );
        }
        terminalOperations.add(node.operation);
        env.set(node.name, {
          kind: 'Receipt',
          action: operation.action,
          scope: operation.scope,
          finality: 'commit'
        });
        ir.push({ op: 'COMMIT', name: node.name, operation: node.operation });
        break;
      }

      case 'Finalize': {
        const operation = requireBinding(env, node.operation);
        if (operation.kind !== 'PreparedOperation') {
          throw new PraxisTypeError(
            'PRAXIS_FINALIZE_REQUIRES_PREPARATION',
            `finalize requires PreparedOperation, received ${operation.kind}`
          );
        }
        if (operation.irreversibility_known && operation.irreversible !== true) {
          throw new PraxisTypeError(
            'PRAXIS_FINALIZE_REQUIRES_IRREVERSIBLE',
            'finalize requires an irreversible prepared operation'
          );
        }
        if (terminalOperations.has(node.operation)) {
          throw new PraxisTypeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            `prepared operation ${node.operation} already has a terminal transition`
          );
        }
        terminalOperations.add(node.operation);
        env.set(node.name, {
          kind: 'Receipt',
          action: operation.action,
          scope: operation.scope,
          finality: 'finalize'
        });
        ir.push({ op: 'FINALIZE', name: node.name, operation: node.operation });
        break;
      }

      default:
        throw new PraxisTypeError('PRAXIS_UNKNOWN_AST_NODE', `unknown AST node ${node.kind}`);
    }
  }

  const moduleBody = {
    schema: 'praxis-ir.v0',
    required_permits: Object.freeze(requiredPermits.map(item => Object.freeze({ ...item }))),
    required_secrets: Object.freeze(requiredSecrets.map(item => Object.freeze({ ...item }))),
    required_prepared: Object.freeze(requiredPrepared.map(item => Object.freeze({ ...item }))),
    instructions: Object.freeze(ir.map(item => Object.freeze({ ...item }))),
    bindings: Object.freeze(
      Object.fromEntries([...env.entries()].map(([name, type]) => [name, Object.freeze({ ...type })]))
    )
  };

  return Object.freeze({
    ...moduleBody,
    digest: irDigestPraxis(moduleBody)
  });
}
