import { NodeSDK } from '@opentelemetry/sdk-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';

// Trace propagation across all services
export function initializeOpenTelemetry() {
  const sdk = new NodeSDK({
    resource: new Resource({
      'service.name': process.env.SERVICE_NAME || 'axiom-service',
      'service.version': process.env.GIT_SHA || 'unknown',
    }),
    traceExporter: new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT || 'http://jaeger:14268/api/traces',
    }),
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });

  return sdk;
}
