export async function runServiceProcess(createService) {
  const service = await createService();
  let address;
  try {
    address = await service.start();
  } catch (error) {
    try {
      await service.stop();
    } catch {
      // Preserve the startup failure as the authoritative process error.
    }
    throw error;
  }
  process.stdout.write(`${JSON.stringify({
    service: service.name,
    status: 'listening',
    address
  })}\n`);
  let stopping = false;

  async function shutdown() {
    if (stopping) return;
    stopping = true;
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
    process.removeListener('message', messageHandler);
    try {
      await service.stop();
      process.exit(0);
    } catch (error) {
      process.stderr.write(`${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: service.name,
        event: 'shutdown.failed',
        error: {
          name: error?.name ?? 'Error',
          code: error?.code
        }
      })}\n`);
      process.exit(1);
    }
  }

  const signalHandlers = new Map([
    ['SIGINT', shutdown],
    ['SIGTERM', shutdown]
  ]);
  const messageHandler = message => {
    if (message?.type === 'axiom.service.stop') void shutdown();
  };
  for (const [signal, handler] of signalHandlers) process.once(signal, handler);
  if (process.connected) process.on('message', messageHandler);
}
