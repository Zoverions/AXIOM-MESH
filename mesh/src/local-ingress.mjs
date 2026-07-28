import net from 'node:net';
import { chmod, lstat, unlink } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { ValidationError } from './lib/canonical.mjs';

export async function startLocalIngressBridge({
  socketPath,
  targetHost = '127.0.0.1',
  targetPort
}) {
  if (
    typeof socketPath !== 'string'
    || !isAbsolute(socketPath)
    || Buffer.byteLength(socketPath) > 100
  ) {
    throw new ValidationError(
      'Local ingress socket must be an absolute path of at most 100 bytes'
    );
  }
  if (
    targetHost !== '127.0.0.1'
    || !Number.isSafeInteger(targetPort)
    || targetPort < 1
    || targetPort > 65_535
  ) {
    throw new ValidationError(
      'Local ingress bridge target must be a valid IPv4 loopback port'
    );
  }
  await removeStaleSocket(socketPath);
  const connections = new Set();
  const server = net.createServer(client => {
    const upstream = net.createConnection({
      host: targetHost,
      port: targetPort
    });
    connections.add(client);
    connections.add(upstream);
    const forget = socket => {
      connections.delete(socket);
    };
    client.once('close', () => forget(client));
    upstream.once('close', () => forget(upstream));
    client.once('error', () => upstream.destroy());
    upstream.once('error', () => client.destroy());
    client.pipe(upstream);
    upstream.pipe(client);
  });
  await listenOnSocket(server, socketPath);
  try {
    await chmod(socketPath, 0o660);
  } catch (error) {
    await closeServer(server, connections);
    await unlinkIfPresent(socketPath);
    throw error;
  }
  let closed = false;
  return {
    socket_path: socketPath,
    async close() {
      if (closed) return;
      closed = true;
      await closeServer(server, connections);
      await unlinkIfPresent(socketPath);
    }
  };
}

async function removeStaleSocket(socketPath) {
  let metadata;
  try {
    metadata = await lstat(socketPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (!metadata.isSocket()) {
    throw new ValidationError(
      'Local ingress path exists and is not a Unix-domain socket'
    );
  }
  await unlink(socketPath);
}

async function listenOnSocket(server, socketPath) {
  await new Promise((resolve, reject) => {
    const onError = error => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(socketPath);
  });
}

async function closeServer(server, connections) {
  for (const connection of connections) connection.destroy();
  if (!server.listening) return;
  await new Promise(resolve => server.close(resolve));
}

async function unlinkIfPresent(socketPath) {
  try {
    await unlink(socketPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
