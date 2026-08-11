import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ACTIVE_SERVICE_NETWORK_POLICY,
  validateComposeNetworkSegmentation,
  validateServiceRouteImplementation
} from './lib/service-network-policy.mjs';
import { digestObject } from './lib/canonical.mjs';
import { MESH_ROOT } from './lib/config.mjs';

const result = validateComposeNetworkSegmentation(
  await readFile(join(MESH_ROOT, 'compose.units.yml'), 'utf8'),
  ACTIVE_SERVICE_NETWORK_POLICY
);
const routeResult = validateServiceRouteImplementation({
  policy: ACTIVE_SERVICE_NETWORK_POLICY,
  sources: {
    grid: await readFile(join(MESH_ROOT, 'src', 'grid', 'server.mjs'), 'utf8'),
    hypervisor: await readFile(
      join(MESH_ROOT, 'src', 'hypervisor', 'server.mjs'),
      'utf8'
    ),
    sandbox: await readFile(
      join(MESH_ROOT, 'src', 'sandbox', 'server.mjs'),
      'utf8'
    )
  }
});
const registry = JSON.parse(await readFile(
  join(MESH_ROOT, 'config', 'capabilities.json'),
  'utf8'
));
const bindings = JSON.parse(await readFile(
  join(MESH_ROOT, 'config', 'capability-evidence-bindings.json'),
  'utf8'
));
const { policy: _policy, ...receipt } = result;
process.stdout.write(`${JSON.stringify({
  ...receipt,
  implemented_routes: routeResult.implemented_routes,
  capability_registry_digest: digestObject(registry),
  binding_registry_digest: bindings.registry_digest,
  digests_match: digestObject(registry) === bindings.registry_digest
}, null, 2)}\n`);
