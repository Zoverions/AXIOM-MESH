import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import { provisionServiceUnits } from './lib/service-units.mjs';

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 5) {
    throw new ValidationError(
      'Usage: node src/provision-service-units.mjs <source-data-dir> <source-transport-dir> <units-dir>'
    );
  }
  const result = await provisionServiceUnits({
    sourceDataDir: process.argv[2],
    sourceTransportDir: process.argv[3],
    unitsDir: process.argv[4]
  });
  process.stdout.write(`${JSON.stringify({
    status: 'provisioned',
    schema: result.schema,
    services: Object.fromEntries(Object.entries(result.services).map(
      ([service, value]) => [service, {
        application_key_id: value.application_key_id,
        transport_fingerprint_sha256: value.transport_fingerprint_sha256
      }]
    ))
  }, null, 2)}\n`);
}
