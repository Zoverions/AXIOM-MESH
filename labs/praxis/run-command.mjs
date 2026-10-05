// labs/praxis/run-command.mjs
//
// Implementation of `node labs/praxis/cli.mjs run <file.prax> ...`.
// Executes Praxis programs against the synthetic host through the embedding
// run() API. All wiring lives here; cli.mjs only dispatches into it.
//
// P0 / synthetic-only / production-unreachable by design:
//   - authority tokens minted here are synthetic (`synthetic:*` ids) and are
//     bound to the exact operation digest of the plan they authorize;
//   - the prepare / commit / finalize / cancel handlers below complete
//     effects synthetically and perform no network, disk, subprocess, or
//     credential I/O. File reading stays in cli.mjs, the designated
//     file-reading entry point, so this module keeps the interpreter
//     transport-surface invariant (see mesh/test/praxis-conformance-v0.test.mjs).
//
// `--arg k=v` binds named host arguments. They are delivered to the synthetic
// effect handlers (echoed into synthetic receipts/evidence as `host_args`)
// and are never visible to the program as bindings.

import {
  compile,
  createHostLease,
  createHostPermit,
  createHostQuorum,
  createHostSecretRef,
  digestPraxis,
  operationDigestPraxis,
  PraxisRuntimeError,
  run
} from './index.mjs';

export const RUN_EXIT_OK = 0;
export const RUN_EXIT_CHECK_FAILURE = 2;
export const RUN_EXIT_RUNTIME_DENIAL = 3;

const SYNTHETIC_LEASE_TTL_MS = 60 * 60 * 1000;

export function runUsage() {
  return [
    'usage: node labs/praxis/cli.mjs run <file.prax> [more files...] [--arg k=v ...]',
    '       (use - for stdin; program output goes to stdout, diagnostics go to stderr)',
    '       exit codes: 0 = all completed; 2 = check failure; 3 = runtime denial/effect refusal'
  ].join('\n');
}

export function parseRunArgs(argv) {
  const files = [];
  const hostArgs = {};
  let endOfFlags = false;
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (!endOfFlags && token === '--') {
      endOfFlags = true;
      index += 1;
      continue;
    }
    if (!endOfFlags && (token === '--arg' || token.startsWith('--arg='))) {
      let pair;
      if (token === '--arg') {
        index += 1;
        pair = argv[index] ?? null;
      } else {
        pair = token.slice('--arg='.length);
      }
      const separator = pair === null ? -1 : pair.indexOf('=');
      if (separator <= 0) {
        return {
          error: `run: --arg expects k=v, received ${pair === null ? 'nothing' : JSON.stringify(pair)}`
        };
      }
      hostArgs[pair.slice(0, separator)] = pair.slice(separator + 1);
      index += 1;
      continue;
    }
    if (!endOfFlags && token.startsWith('--') && token.length > 2) {
      return { error: `run: unknown flag ${token}` };
    }
    files.push(token);
    index += 1;
  }
  if (files.length === 0) {
    return { error: 'run: expected at least one <file.prax>' };
  }
  return { files, hostArgs };
}

function syntheticSecretId(name) {
  return `synthetic:${name}`;
}

function isPlainValue(value, seen = new Set()) {
  if (value === null) return true;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return true;
  if (type !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every(item => isPlainValue(item, seen));
  return Object.values(value).every(item => isPlainValue(item, seen));
}

// Resolve a PLAN argument (or OBSERVE value) statically. Literals resolve
// directly; references resolve when they point at an already-resolved plain
// literal value (e.g. an observed string reused as an operation argument).
function resolveStaticArgument(argument, env) {
  if (!argument || typeof argument !== 'object') return { ok: false };
  if (argument.kind === 'literal') {
    return isPlainValue(argument.value) ? { ok: true, value: argument.value } : { ok: false };
  }
  if (argument.kind === 'reference' && typeof argument.name === 'string' && env.has(argument.name)) {
    return { ok: true, value: env.get(argument.name) };
  }
  return { ok: false };
}

function mintAuthorityToken(requirement, operationDigest) {
  const id = `synthetic:${requirement.name}`;
  const common = {
    action: requirement.action,
    scope: requirement.scope,
    id,
    operationDigest
  };
  const kind = requirement.authority_kind ?? 'Permit';
  if (kind === 'Lease') {
    return createHostLease({ ...common, expiresAt: Date.now() + SYNTHETIC_LEASE_TTL_MS });
  }
  if (kind === 'Quorum') {
    const members = [...(requirement.members ?? [])].map(String);
    return createHostQuorum({
      ...common,
      members,
      approvedBy: members,
      threshold: requirement.threshold ?? members.length
    });
  }
  return createHostPermit(common);
}

function preparationDigestFor(operationDigest) {
  return `sha256:${digestPraxis({
    schema: 'praxis-synthetic-preparation.v0',
    origin: 'praxis-cli-run',
    operation_digest: operationDigest
  })}`;
}

// Build the synthetic host options for run(): mint synthetic authority tokens
// bound to the exact digest of the plan each AUTHORIZE instruction names,
// mint opaque synthetic secret references, and inject synthetic-only effect
// handlers. Programs that need prepared-effect imports, signed observations,
// verifiers, assessors, or a charter are refused by the runtime (exit 3).
function buildSyntheticRunOptions(ir, hostArgs) {
  const requirements = new Map(ir.required_permits.map(item => [item.name, item]));
  const secretKinds = new Map((ir.required_secrets ?? []).map(item => [item.name, item.secret_kind]));
  const planDigests = new Map();
  const staticEnv = new Map();
  const authorities = {};

  for (const instruction of ir.instructions ?? []) {
    if (instruction.op === 'OBSERVE') {
      // Replicate the runtime OBSERVE binding shape so static digests match:
      // {kind:'Observed', value, provenance, host_observation:null} (the
      // synthetic host never supplies signed observations).
      const resolved = resolveStaticArgument(instruction.value, staticEnv);
      if (resolved.ok) {
        staticEnv.set(instruction.name, {
          kind: 'Observed',
          value: resolved.value,
          provenance: instruction.provenance,
          host_observation: null
        });
      }
    } else if (instruction.op === 'PLAN') {
      const resolvedArgs = [];
      let resolvable = true;
      for (const argument of instruction.args ?? []) {
        const resolved = resolveStaticArgument(argument, staticEnv);
        if (!resolved.ok) {
          resolvable = false;
          break;
        }
        resolvedArgs.push(resolved.value);
      }
      if (resolvable) {
        const secretReferences = (instruction.secrets ?? []).map(name => ({
          binding: name,
          secret_ref_id: syntheticSecretId(name),
          secret_kind: secretKinds.get(name) ?? 'Unknown'
        }));
        planDigests.set(
          instruction.name,
          operationDigestPraxis({
            action: instruction.action,
            scope: instruction.scope,
            args: resolvedArgs,
            secretReferences
          })
        );
      }
    } else if (instruction.op === 'AUTHORIZE') {
      const requirement = requirements.get(instruction.permit);
      const operationDigest = planDigests.get(instruction.operation);
      if (!requirement || !operationDigest) {
        throw new PraxisRuntimeError(
          'PRAXIS_RUN_HOST_UNBINDABLE',
          `synthetic run host cannot bind authority ${instruction.permit} to operation ${instruction.operation}`
        );
      }
      // One token per permit name: a permit binds to exactly one plan, so a
      // second AUTHORIZE with a different plan digest is refused at runtime.
      if (!authorities[instruction.permit]) {
        authorities[instruction.permit] = mintAuthorityToken(requirement, operationDigest);
      }
    }
  }

  const secrets = {};
  for (const requirement of ir.required_secrets ?? []) {
    secrets[requirement.name] = createHostSecretRef({
      id: syntheticSecretId(requirement.name),
      kind: requirement.secret_kind
    });
  }

  const syntheticArgs = Object.freeze({ ...hostArgs });

  return {
    authorities,
    secrets,
    preparer: async request => ({
      ok: true,
      evidence: {
        durable: true,
        operation_digest: request.operation.operation_digest,
        preparation_digest: preparationDigestFor(request.operation.operation_digest),
        synthetic: true,
        host_args: syntheticArgs
      }
    }),
    executor: async request => ({
      status: 'completed',
      receipt: {
        operation_digest: request.operation.operation_digest,
        preparation_digest: request.preparation.preparation_digest,
        finality: request.finality,
        executor: 'synthetic-praxis-cli-run',
        synthetic: true,
        host_args: syntheticArgs
      }
    }),
    completer: async request => ({
      ok: true,
      evidence: {
        durable: true,
        operation_digest: request.operation_digest,
        preparation_digest: request.preparation_digest,
        completion_ref: 'synthetic:praxis-cli-run'
      }
    }),
    canceler: async request => ({
      ok: true,
      evidence: {
        durable: true,
        operation_digest: request.operation_digest,
        preparation_digest: request.preparation_digest,
        cancellation_ref: 'synthetic:praxis-cli-run'
      }
    })
  };
}

function emitDiagnostic(stderr, { file, stage, code, message }) {
  stderr.write(`${JSON.stringify({ ok: false, file, stage, code, message }, null, 2)}\n`);
}

export async function runPraxisSources(sources, { hostArgs = {}, stdout, stderr }) {
  let exitCode = RUN_EXIT_OK;
  for (const { file, source } of sources) {
    let ir;
    try {
      ir = compile(source);
    } catch (error) {
      emitDiagnostic(stderr, {
        file,
        stage: 'check',
        code: error?.code ?? 'PRAXIS_CHECK_FAILED',
        message: error?.message ?? String(error)
      });
      exitCode = Math.max(exitCode, RUN_EXIT_CHECK_FAILURE);
      continue;
    }
    try {
      const result = await run(ir, buildSyntheticRunOptions(ir, hostArgs));
      const names = Object.keys(result.values ?? {});
      stdout.write(
        `ok ${file}: completed (${names.length} binding${names.length === 1 ? '' : 's'}${names.length > 0 ? `: ${names.join(', ')}` : ''})\n`
      );
    } catch (error) {
      emitDiagnostic(stderr, {
        file,
        stage: 'run',
        code: error?.code ?? 'PRAXIS_RUNTIME_FAILED',
        message: error?.message ?? String(error)
      });
      exitCode = Math.max(exitCode, RUN_EXIT_RUNTIME_DENIAL);
    }
  }
  return exitCode;
}

// Entry point used by cli.mjs. `readInput` is injected from cli.mjs so this
// module never touches the filesystem.
export async function runPraxisCli(argv, { readInput, stdout, stderr }) {
  const parsed = parseRunArgs(argv);
  if (parsed.error) {
    stderr.write(`${parsed.error}\n\n${runUsage()}\n`);
    return RUN_EXIT_CHECK_FAILURE;
  }
  const sources = [];
  for (const file of parsed.files) {
    try {
      sources.push({ file, source: await readInput(file) });
    } catch (error) {
      emitDiagnostic(stderr, {
        file,
        stage: 'read',
        code: error?.code ?? 'PRAXIS_READ_FAILED',
        message: error?.message ?? String(error)
      });
      return RUN_EXIT_CHECK_FAILURE;
    }
  }
  return runPraxisSources(sources, { hostArgs: parsed.hostArgs, stdout, stderr });
}
