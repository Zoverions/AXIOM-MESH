import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  ValidationError,
  assertPlainObject,
  canonicalJson
} from './lib/canonical.mjs';

const STATUS_PATH = '/run/axiom/status/guardian-health.json';
const EVIDENCE_PATH = '/var/lib/axiom/guardian/guardian-evidence.json';

export const NODE_ZERO_DEFAULT_CONTRIBUTION_POLICY = deepFreeze({
  format: 'contribution.policy.v1',
  enabled: false,
  allowed_roles: [],
  only_when: {
    external_power: false,
    unmetered_network: false,
    user_idle: false,
    minimum_battery_percent: 0,
    allowed_thermal_states: ['normal']
  },
  maximum: {
    cpu_millis: 0,
    memory_bytes: 0,
    storage_bytes: 0,
    bandwidth_bytes_per_second: 0,
    transfer_bytes_per_day: 0
  }
});

export const NODE_ZERO_GUARDIAN_SERVICE = deepFreeze({
  service_id: 'axiom-host-guardian',
  policy_root: '/etc/axiom/host',
  status_root: '/run/axiom/status',
  state_root: '/var/lib/axiom/guardian',
  mesh_credentials: false,
  listeners: [],
  external_network_calls: false,
  policy_broadening: false,
  authority_effect: 'none'
});

export async function persistNodeZeroGuardianSnapshot({
  health,
  evidence,
  writeAtomic = atomicWriteJson
}) {
  if (typeof writeAtomic !== 'function') {
    throw new ValidationError('writeAtomic must be a function');
  }
  const normalizedHealth = assertPlainObject(health, 'guardian health');
  const normalizedEvidence = assertPlainObject(evidence, 'guardian evidence');

  await writeAtomic(STATUS_PATH, normalizedHealth);
  await writeAtomic(EVIDENCE_PATH, normalizedEvidence);

  return Object.freeze({
    status_path: STATUS_PATH,
    evidence_path: EVIDENCE_PATH,
    authority_effect: 'none',
    network_effect: 'none',
    mesh_credentials_used: false
  });
}

async function atomicWriteJson(path, value) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  let committed = false;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(`${canonicalJson(value)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
    committed = true;
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (!committed) await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
