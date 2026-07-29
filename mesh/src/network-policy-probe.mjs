import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { ValidationError } from './lib/canonical.mjs';

export async function verifyConnectionDenied({
  host,
  port,
  timeoutMs = 3_000
}) {
  if (
    typeof host !== 'string'
    || !/^[a-z][a-z0-9-]{0,63}$/.test(host)
    || !Number.isSafeInteger(port)
    || port < 1
    || port > 65_535
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 100
    || timeoutMs > 10_000
  ) throw new ValidationError('Denied-connection probe input is invalid');

  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = net.createConnection({ host, port });
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (result.denied) resolve(result);
      else reject(new ValidationError(
        `Forbidden service network edge connected: ${host}:${port}`
      ));
    };
    const timer = setTimeout(() => finish({
      denied: true,
      outcome: 'timeout'
    }), timeoutMs);
    socket.once('connect', () => finish({
      denied: false,
      outcome: 'connected'
    }));
    socket.once('error', error => finish({
      denied: true,
      outcome: ['ENOTFOUND', 'EAI_AGAIN'].includes(error.code)
        ? 'unresolved'
        : 'rejected'
    }));
  });
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 4 || !/^\d+$/.test(process.argv[3])) {
    throw new ValidationError(
      'Usage: node src/network-policy-probe.mjs <forbidden-host> <port>'
    );
  }
  const result = await verifyConnectionDenied({
    host: process.argv[2],
    port: Number(process.argv[3])
  });
  process.stdout.write(`${JSON.stringify({
    valid: true,
    denied: result.denied,
    outcome: result.outcome,
    target: {
      host: process.argv[2],
      port: Number(process.argv[3])
    }
  })}\n`);
}
