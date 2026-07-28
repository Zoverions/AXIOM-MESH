const SENSITIVE_KEY = /authorization|cookie|token|secret|password|private|credential|prompt|content|body|payload|key/i;
const MAX_DEPTH = 8;
const MAX_STRING = 2_000;

export function redactForLog(value, depth = 0, seen = new WeakSet()) {
  if (depth > MAX_DEPTH) return '[MAX_DEPTH]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    return value.length <= MAX_STRING ? value : `${value.slice(0, MAX_STRING)}…[TRUNCATED]`;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      code: typeof value.code === 'string' ? value.code : undefined
    };
  }
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redactForLog(item, depth + 1, seen));
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    output[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactForLog(item, depth + 1, seen);
  }
  return output;
}

export function createStructuredLogger(service, {
  sink = line => process.stdout.write(`${line}\n`),
  now = () => new Date().toISOString()
} = {}) {
  function emit(level, event) {
    sink(JSON.stringify({
      timestamp: now(),
      level,
      service,
      ...redactForLog(event)
    }));
  }
  return {
    info(event) {
      emit('info', event);
    },
    error(event) {
      emit('error', event);
    }
  };
}
