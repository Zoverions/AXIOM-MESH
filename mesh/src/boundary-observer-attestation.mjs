import { createPublicKey } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ValidationError,
  canonicalJson,
  digestObject,
  sha256
} from './lib/canonical.mjs';
import {
  ensureMeshIdentity,
  verifyObjectSignature
} from './lib/identity.mjs';

const OBSERVER_SCHEMA = 'axiom-boundary-observer-attestation.v1';
const CONTEXT_SCHEMA = 'axiom-boundary-evidence-context.v1';
const REVISION = /^[a-f0-9]{40}$/;
const CONTEXT_ID = /^[a-f0-9]{64}$/;
const RUN_VALUE = /^[A-Za-z0-9_.:-]{1,128}$/;
const HOST = /^[A-Za-z0-9.-]{1,253}$/;
const MAX_OBSERVATION_AGE_MS = 15 * 60_000;
const MAX_RESPONSE_BYTES = 1_048_576;
const OBSERVER_TRUST = 'embedded-ephemeral-ci-observer';
const KINDS = Object.freeze({
  host: 'host_unix_ingress',
  runner: 'runner_public_control'
});

export {
  CONTEXT_SCHEMA,
  KINDS,
  MAX_OBSERVATION_AGE_MS,
  OBSERVER_SCHEMA,
  OBSERVER_TRUST
};

export function boundaryEvidenceContext({
  sourceRevision,
  evidenceContext,
  run,
  hostSocketPath,
  runnerHost = '1.1.1.1',
  runnerPort = 443
}) {
  const normalizedRun = normalizeRun(run);
  if (!REVISION.test(sourceRevision ?? '')) {
    throw new ValidationError('Boundary evidence context requires a 40-character source revision');
  }
  if (!CONTEXT_ID.test(evidenceContext ?? '')) {
    throw new ValidationError('Boundary evidence context requires a 256-bit hexadecimal package id');
  }
  if (typeof hostSocketPath !== 'string' || hostSocketPath.length < 1 || hostSocketPath.length > 1024) {
    throw new ValidationError('Boundary evidence context host socket path is invalid');
  }
  if (!HOST.test(runnerHost) || !Number.isSafeInteger(runnerPort) || runnerPort < 1 || runnerPort > 65_535) {
    throw new ValidationError('Boundary evidence context runner target is invalid');
  }
  return {
    schema: CONTEXT_SCHEMA,
    package_id: evidenceContext,
    source_revision: sourceRevision,
    run: normalizedRun,
    targets: {
      host_unix_socket_path_digest: sha256(hostSocketPath),
      runner_public_control: {
        host: runnerHost,
        port: runnerPort
      }
    }
  };
}

export function issueHostIngressAttestation({
  identity,
  context,
  observedAt = new Date().toISOString(),
  socketPath,
  socketIdentity,
  httpStatus,
  operationsReport
}) {
  assertIdentity(identity, 'boundary-host-observer');
  validateContextObject(context);
  if (
    typeof socketPath !== 'string'
    || sha256(socketPath) !== context.targets.host_unix_socket_path_digest
  ) throw new ValidationError('Host ingress observer socket does not match the evidence context');
  if (
    !socketIdentity
    || socketIdentity.is_socket !== true
    || typeof socketIdentity.device !== 'string'
    || typeof socketIdentity.inode !== 'string'
    || !Number.isSafeInteger(socketIdentity.mode)
    || !Number.isSafeInteger(socketIdentity.uid)
    || !Number.isSafeInteger(socketIdentity.gid)
  ) throw new ValidationError('Host ingress observer socket identity is invalid');
  if (
    httpStatus !== 200
    || operationsReport?.status !== 'ready'
    || !Array.isArray(operationsReport.services)
    || operationsReport.services.length !== 4
  ) throw new ValidationError('Host ingress observer did not receive a ready authenticated operations report');
  const statement = {
    kind: KINDS.host,
    source_revision: context.source_revision,
    evidence_context: context.package_id,
    context_digest: digestObject(context),
    run: context.run,
    observed_at: normalizeTimestamp(observedAt),
    observer: 'boundary-host-observer',
    subject: {
      transport: 'unix-domain-socket',
      socket_path: socketPath,
      socket_path_digest: sha256(socketPath)
    },
    measurement: {
      authenticated_request: true,
      http_status: httpStatus,
      operations_status: operationsReport.status,
      service_count: operationsReport.services.length,
      operations_report_digest: digestObject(operationsReport),
      socket_identity: structuredClone(socketIdentity)
    }
  };
  return signObserverStatement(identity, statement);
}

export function issueRunnerPublicControlAttestation({
  identity,
  context,
  observedAt = new Date().toISOString(),
  host,
  port,
  timeoutMs,
  connected,
  outcome
}) {
  assertIdentity(identity, 'boundary-runner-observer');
  validateContextObject(context);
  if (
    host !== context.targets.runner_public_control.host
    || port !== context.targets.runner_public_control.port
  ) throw new ValidationError('Runner public-control target does not match the evidence context');
  if (
    connected !== true
    || outcome !== 'connected'
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 100
    || timeoutMs > 30_000
  ) throw new ValidationError('Runner public-control observer did not establish the required connection');
  const statement = {
    kind: KINDS.runner,
    source_revision: context.source_revision,
    evidence_context: context.package_id,
    context_digest: digestObject(context),
    run: context.run,
    observed_at: normalizeTimestamp(observedAt),
    observer: 'boundary-runner-observer',
    subject: { host, port },
    measurement: {
      connected: true,
      outcome: 'connected',
      timeout_ms: timeoutMs
    }
  };
  return signObserverStatement(identity, statement);
}

export function verifyBoundaryObserverAttestation(attestation, {
  kind,
  context,
  finalGeneratedAt
}) {
  validateContextObject(context);
  if (!attestation || attestation.schema !== OBSERVER_SCHEMA) {
    throw new ValidationError('Boundary observer attestation schema is invalid');
  }
  assertExactKeys(attestation, ['schema', 'statement', 'signer', 'attestation'], 'Boundary observer attestation');
  const statement = attestation.statement;
  const expectedObserver = kind === KINDS.host
    ? 'boundary-host-observer'
    : kind === KINDS.runner
      ? 'boundary-runner-observer'
      : null;
  if (
    !expectedObserver
    || statement?.kind !== kind
    || statement.source_revision !== context.source_revision
    || statement.evidence_context !== context.package_id
    || statement.context_digest !== digestObject(context)
    || digestObject(statement.run) !== digestObject(context.run)
    || statement.observer !== expectedObserver
  ) throw new ValidationError('Boundary observer attestation context does not match the evidence package');
  verifyObservationWindow(statement.observed_at, finalGeneratedAt);
  verifyKindMeasurement(statement, context);
  if (
    !attestation.signer
    || attestation.signer.trust !== OBSERVER_TRUST
    || typeof attestation.signer.key_id !== 'string'
    || typeof attestation.signer.public_key_pem !== 'string'
    || attestation.attestation?.key_id !== attestation.signer.key_id
    || !attestation.signer.key_id.startsWith(`${expectedObserver}:`)
  ) throw new ValidationError('Boundary observer signer metadata is invalid');
  let publicKey;
  try {
    publicKey = createPublicKey(attestation.signer.public_key_pem);
  } catch {
    throw new ValidationError('Boundary observer public key is invalid');
  }
  const unsigned = structuredClone(attestation);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, attestation.attestation, publicKey)) {
    throw new ValidationError('Boundary observer attestation signature is invalid');
  }
  return {
    valid: true,
    kind,
    observer: expectedObserver,
    observed_at: statement.observed_at,
    digest: digestObject(attestation),
    trust: OBSERVER_TRUST
  };
}

export async function observeHostIngress({ socketPath, tokenPath }) {
  const [token, socketStat] = await Promise.all([
    readFile(tokenPath, 'utf8'),
    lstat(socketPath)
  ]);
  if (!socketStat.isSocket()) {
    throw new ValidationError('Host ingress observer target is not a Unix-domain socket');
  }
  const response = await requestUnixJson({
    socketPath,
    path: '/v1/operations',
    token: token.trim()
  });
  return {
    socket_identity: {
      is_socket: true,
      device: String(socketStat.dev),
      inode: String(socketStat.ino),
      mode: socketStat.mode,
      uid: socketStat.uid,
      gid: socketStat.gid
    },
    http_status: response.status,
    operations_report: response.payload
  };
}

export async function observeRunnerPublicControl({
  host = '1.1.1.1',
  port = 443,
  timeoutMs = 5_000,
  connectImpl = options => net.createConnection(options)
} = {}) {
  if (!HOST.test(host) || !Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new ValidationError('Runner public-control target is invalid');
  }
  return new Promise(resolve => {
    let settled = false;
    let socket;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      resolve({ ...result, timeout_ms: timeoutMs });
    };
    const timer = setTimeout(() => finish({ connected: false, outcome: 'timeout' }), timeoutMs);
    timer.unref?.();
    try {
      socket = connectImpl({ host, port });
      socket.once('connect', () => finish({ connected: true, outcome: 'connected' }));
      socket.once('error', error => finish({
        connected: false,
        outcome: boundedErrorCode(error?.code)
      }));
    } catch (error) {
      finish({ connected: false, outcome: boundedErrorCode(error?.code) });
    }
  });
}

function signObserverStatement(identity, statement) {
  const publicKeyPem = String(identity.publicKey.export({ type: 'spki', format: 'pem' }));
  const unsigned = {
    schema: OBSERVER_SCHEMA,
    statement,
    signer: {
      key_id: identity.keyId,
      public_key_pem: publicKeyPem,
      trust: OBSERVER_TRUST
    }
  };
  return {
    ...unsigned,
    attestation: identity.signObject(unsigned)
  };
}

function verifyKindMeasurement(statement, context) {
  if (statement.kind === KINDS.host) {
    if (
      statement.subject?.transport !== 'unix-domain-socket'
      || statement.subject.socket_path_digest !== context.targets.host_unix_socket_path_digest
      || sha256(statement.subject.socket_path ?? '') !== statement.subject.socket_path_digest
      || statement.measurement?.authenticated_request !== true
      || statement.measurement.http_status !== 200
      || statement.measurement.operations_status !== 'ready'
      || statement.measurement.service_count !== 4
      || !/^[a-f0-9]{64}$/.test(statement.measurement.operations_report_digest ?? '')
      || statement.measurement.socket_identity?.is_socket !== true
    ) throw new ValidationError('Host ingress observer measurement is invalid');
    return;
  }
  if (
    statement.subject?.host !== context.targets.runner_public_control.host
    || statement.subject?.port !== context.targets.runner_public_control.port
    || statement.measurement?.connected !== true
    || statement.measurement.outcome !== 'connected'
    || !Number.isSafeInteger(statement.measurement.timeout_ms)
  ) throw new ValidationError('Runner public-control observer measurement is invalid');
}

function validateContextObject(context) {
  const normalized = boundaryEvidenceContext({
    sourceRevision: context?.source_revision,
    evidenceContext: context?.package_id,
    run: context?.run,
    hostSocketPath: context?.host_socket_path,
    runnerHost: context?.targets?.runner_public_control?.host,
    runnerPort: context?.targets?.runner_public_control?.port
  });
  if (
    context.schema !== CONTEXT_SCHEMA
    || context.targets?.host_unix_socket_path_digest !== normalized.targets.host_unix_socket_path_digest
    || digestObject(context.run) !== digestObject(normalized.run)
  ) throw new ValidationError('Boundary evidence context object is invalid');
}

function normalizeRun(run) {
  if (
    !run
    || !RUN_VALUE.test(String(run.id ?? ''))
    || !Number.isSafeInteger(Number(run.attempt))
    || Number(run.attempt) < 1
    || Number(run.attempt) > 10_000
    || !RUN_VALUE.test(String(run.job ?? ''))
  ) throw new ValidationError('Boundary evidence run identity is invalid');
  return {
    id: String(run.id),
    attempt: Number(run.attempt),
    job: String(run.job)
  };
}

function assertIdentity(identity, service) {
  if (!identity || identity.service !== service || typeof identity.signObject !== 'function') {
    throw new ValidationError(`Boundary observer requires the ${service} identity`);
  }
}

function verifyObservationWindow(observedAt, finalGeneratedAt) {
  const observed = Date.parse(normalizeTimestamp(observedAt));
  const generated = Date.parse(normalizeTimestamp(finalGeneratedAt));
  if (observed > generated + 5_000 || generated - observed > MAX_OBSERVATION_AGE_MS) {
    throw new ValidationError('Boundary observer attestation is outside the package observation window');
  }
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError('Boundary observer timestamp is invalid');
  }
  return new Date(value).toISOString();
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const normalizedExpected = [...expected].sort();
  if (actual.length !== normalizedExpected.length || actual.some((key, index) => key !== normalizedExpected[index])) {
    throw new ValidationError(`${label} contains an unexpected field inventory`);
  }
}

function requestUnixJson({ socketPath, path, token }) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      path,
      method: 'GET',
      headers: { authorization: `Bearer ${token}` }
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new ValidationError('Host ingress observer response exceeds the byte limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => {
        let payload;
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          reject(new ValidationError('Host ingress observer response is not valid JSON'));
          return;
        }
        resolve({ status: response.statusCode, payload });
      });
    });
    request.setTimeout(5_000, () => request.destroy(new ValidationError('Host ingress observer request timed out')));
    request.once('error', reject);
    request.end();
  });
}

function boundedErrorCode(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)
    ? value.toLowerCase()
    : 'blocked';
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new ValidationError('Boundary observer arguments must be --name value pairs');
    }
    args[flag.slice(2)] = value;
  }
  return { command, args };
}

function required(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || !value.length) {
    throw new ValidationError(`Boundary observer requires --${name}`);
  }
  return value;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${canonicalJson(value)}\n`, { mode: 0o600, flag: 'wx' });
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  const sourceRevision = required(args, 'revision');
  const evidenceContext = required(args, 'context');
  const hostSocketPath = required(args, 'host-socket');
  const runnerHost = args['runner-host'] ?? '1.1.1.1';
  const runnerPort = Number(args['runner-port'] ?? 443);
  const run = {
    id: required(args, 'run-id'),
    attempt: Number(required(args, 'run-attempt')),
    job: required(args, 'job')
  };
  const context = {
    ...boundaryEvidenceContext({
      sourceRevision,
      evidenceContext,
      run,
      hostSocketPath,
      runnerHost,
      runnerPort
    }),
    host_socket_path: hostSocketPath
  };
  const output = required(args, 'output');
  if (command === 'host-ingress') {
    const identity = await ensureMeshIdentity(
      required(args, 'identity-dir'),
      'boundary-host-observer',
      { create: true }
    );
    const observation = await observeHostIngress({
      socketPath: hostSocketPath,
      tokenPath: required(args, 'token-file')
    });
    await writeJson(output, issueHostIngressAttestation({
      identity,
      context,
      socketPath: hostSocketPath,
      socketIdentity: observation.socket_identity,
      httpStatus: observation.http_status,
      operationsReport: observation.operations_report
    }));
    return;
  }
  if (command === 'runner-public-control') {
    const identity = await ensureMeshIdentity(
      required(args, 'identity-dir'),
      'boundary-runner-observer',
      { create: true }
    );
    const observation = await observeRunnerPublicControl({
      host: runnerHost,
      port: runnerPort,
      timeoutMs: Number(args['timeout-ms'] ?? 5_000)
    });
    await writeJson(output, issueRunnerPublicControlAttestation({
      identity,
      context,
      host: runnerHost,
      port: runnerPort,
      timeoutMs: observation.timeout_ms,
      connected: observation.connected,
      outcome: observation.outcome
    }));
    return;
  }
  throw new ValidationError('Usage: boundary-observer-attestation.mjs host-ingress|runner-public-control [options]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
