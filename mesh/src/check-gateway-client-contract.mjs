import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  validateGatewayClientContract,
  validateGatewayClientContractSchema,
  validateGatewayClientRouteImplementation
} from './lib/gateway-client-contract.mjs';

export async function checkGatewayClientContract() {
  const root = new URL('../', import.meta.url);
  const [contract, schema, source] = await Promise.all([
    readJson(new URL('config/gateway-client-contract.json', root)),
    readJson(new URL('config/gateway-client-contract.schema.json', root)),
    readFile(new URL('src/gateway/server.mjs', root), 'utf8')
  ]);
  const contractResult = validateGatewayClientContract(contract);
  const schemaResult = validateGatewayClientContractSchema(schema);
  const routes = validateGatewayClientRouteImplementation({ contract, source });
  return {
    valid: true,
    schema: contractResult.schema,
    kernel_version: contractResult.kernel_version,
    routes: contractResult.routes,
    stable_errors: contractResult.stable_errors,
    contract_digest: contractResult.contract_digest,
    json_schema_digest: schemaResult.schema_digest,
    schema_definitions: schemaResult.definitions,
    implemented_routes: routes.implemented_routes,
    same_origin_only: contract.boundary.request_target
      === 'same-origin-relative-path',
    direct_service_access: contract.boundary.direct_internal_service_access
  };
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await checkGatewayClientContract(), null, 2)}\n`);
}
