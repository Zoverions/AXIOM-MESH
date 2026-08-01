import https from 'node:https';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';
import { meshConfig } from './lib/config.mjs';
import {
  loadTransportRuntime,
  serviceDnsName,
  verifyTransportServerIdentity
} from './lib/transport-credentials.mjs';
import { authorizeServiceRequest } from './lib/service-network-policy.mjs';

const SERVICES = new Set(['grid', 'hypervisor', 'sandbox']);

export async function checkServiceUnit(service, config = meshConfig()) {
  if (!SERVICES.has(service)) {
    throw new ValidationError('Unit healthcheck service is invalid');
  }
  const transport = await loadTransportRuntime({
    transportDir: config.transport.directory,
    service
  });
  const origin = config.urls[service];
  const target = new URL(`${origin}/health`);
  authorizeServiceRequest({
    source: service,
    destination: service,
    method: 'GET',
    url: target
  });
  return new Promise((resolve, reject) => {
    const request = https.get({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      key: transport.key,
      cert: transport.cert,
      ca: transport.ca,
      servername: serviceDnsName(service),
      checkServerIdentity: (_hostname, peer) => (
        verifyTransportServerIdentity(transport, service, peer)
      ),
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
      agent: false
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.once('end', () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(
            response.statusCode === 200
            && payload?.service === service
            && payload?.status === 'live'
          );
        } catch {
          resolve(false);
        }
      });
    });
    request.setTimeout(3_000, () => request.destroy(new Error('timeout')));
    request.once('error', reject);
  });
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const healthy = await checkServiceUnit(process.argv[2]).catch(() => false);
  process.exitCode = healthy ? 0 : 1;
}
