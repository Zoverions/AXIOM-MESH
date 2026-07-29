import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import {
  rollbackTransportCredentials,
  rotateTransportCredentials,
  validateTransportCredentials
} from './lib/transport-credentials.mjs';

export async function runTransportCredentialCommand({
  command,
  secretDir
}) {
  if (command === 'verify') {
    const result = await validateTransportCredentials({
      secretDir,
      minimumRemainingMs: 24 * 60 * 60 * 1_000
    });
    return {
      schema: 'axiom-transport-verification-result.v1',
      status: 'valid',
      generation: result.generation,
      ca_fingerprint_sha256: result.ca_fingerprint_sha256,
      services: Object.fromEntries(
        Object.entries(result.services).map(([service, value]) => [
          service,
          {
            spiffe_id: value.spiffe_id,
            fingerprint_sha256: value.fingerprint_sha256,
            valid_to: value.valid_to
          }
        ])
      )
    };
  }
  if (command === 'rotate') {
    return rotateTransportCredentials({ secretDir });
  }
  if (command === 'rollback') {
    return rollbackTransportCredentials({ secretDir });
  }
  throw new ValidationError(
    'Transport credential command must be verify, rotate, or rollback'
  );
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 4) {
    throw new ValidationError(
      'Usage: node src/rotate-transport.mjs <verify|rotate|rollback> <secret-directory>'
    );
  }
  const result = await runTransportCredentialCommand({
    command: process.argv[2],
    secretDir: process.argv[3]
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
