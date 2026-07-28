const port = process.env.AXIOM_GATEWAY_PORT ?? '8080';
const response = await fetch(`http://127.0.0.1:${port}/ready`, {
  redirect: 'error',
  signal: AbortSignal.timeout(3_000)
}).catch(() => null);

if (!response?.ok) {
  process.exitCode = 1;
} else {
  const payload = await response.json().catch(() => null);
  process.exitCode = payload?.status === 'ready' ? 0 : 1;
}
