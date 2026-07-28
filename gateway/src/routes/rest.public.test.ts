import { sanitizeContent, sanitizeMetadata } from '../utils/sanitize';
import { resetPublicRateLimitStateForTests } from '../middleware/public_rate_limit';

jest.mock('../services/hypervisorClient', () => ({
  sendToHypervisor: jest.fn(),
}));

jest.mock('../utils/normalizer', () => ({
  normalizeInput: jest.fn((session_id: string, channel: string, content: string, metadata: Record<string, unknown>) => ({
    id: 'intent-mock',
    session_id,
    channel,
    content,
    metadata,
    timestamp: 1,
    trace_id: 'trace-mock',
  })),
}));

const { sendToHypervisor } = jest.requireMock('../services/hypervisorClient') as {
  sendToHypervisor: jest.Mock;
};

type MockRes = {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
  status: (code: number) => MockRes;
  json: (body: any) => MockRes;
  setHeader: (key: string, value: string) => void;
};

function createMockRes(): MockRes {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
  };
}

function getRouteLayers(router: any, method: 'post' | 'get', path: string) {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack.map((s: any) => s.handle);
}

async function invokeHandlers(handlers: Function[], req: any, res: any): Promise<void> {
  let idx = 0;
  const next = async () => {
    const current = handlers[idx++];
    if (!current) return;
    const result = current(req, res, () => next());
    if (result && typeof result.then === 'function') {
      await result;
    }
  };
  await next();
}

describe('REST public intent route', () => {
  beforeEach(() => {
    resetPublicRateLimitStateForTests();
    jest.clearAllMocks();
  });

  test('public route does not use auth middleware and includes rate limiter in development', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    // Must clear module cache because the middlewares are bound at module load time
    jest.resetModules();

    const { default: router } = await import('./rest');
    const handlers = getRouteLayers(router, 'post', '/api/v1/intent/process/dev-public');

    expect(handlers.length).toBeGreaterThanOrEqual(2);
    // first middleware is public rate limiter, second is route handler
    expect(handlers[0].name).toBe('publicIntentRateLimit');
    expect(handlers.some((h: any) => h.name === 'authMiddleware')).toBe(false);

    process.env.NODE_ENV = originalEnv;
  });

  test('public route uses auth middleware in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.resetModules();

    const { default: router } = await import('./rest');
    const handlers = getRouteLayers(router, 'post', '/api/v1/intent/process/dev-public');

    expect(handlers.length).toBeGreaterThanOrEqual(3);
    expect(handlers[0].name).toBe('authMiddleware');
    expect(handlers[1].name).toBe('publicIntentRateLimit');

    process.env.NODE_ENV = originalEnv;
  });

  test('returns 400 when content missing', async () => {
    // ensure test runs without authMiddleware failure due to environment leak
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    jest.resetModules();

    const { default: router } = await import('./rest');
    const handlers = getRouteLayers(router, 'post', '/api/v1/intent/process/dev-public');
    const req: any = { headers: {}, ip: '127.0.0.1', body: { channel: 'web' }, query: {} };
    const res = createMockRes();

    await invokeHandlers(handlers, req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Content is required' });
    expect(sendToHypervisor).not.toHaveBeenCalled();
  });

  test('sanitizes content/metadata and forwards intent', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    jest.resetModules();

    // Re-import the mocked module to get the fresh mock instance
    const { sendToHypervisor: freshSendToHypervisor } = jest.requireMock('../services/hypervisorClient');
    freshSendToHypervisor.mockResolvedValue({ status: 'success', response: 'ok' });

    const { default: router } = await import('./rest');
    const handlers = getRouteLayers(router, 'post', '/api/v1/intent/process/dev-public');
    const req: any = {
      headers: { 'x-forwarded-for': '203.0.113.8' },
      ip: '127.0.0.1',
      query: {},
      body: {
        session_id: 'sess-public',
        channel: 'web',
        content: '<script>x</script><b>Hello</b>;--',
        metadata: { sender: '<b>tester</b>' },
      },
    };
    const res = createMockRes();

    await invokeHandlers(handlers, req, res);

    expect(res.statusCode).toBe(200);
    expect(freshSendToHypervisor).toHaveBeenCalledTimes(1);

    const sentIntent = freshSendToHypervisor.mock.calls[0][0];
    expect(sentIntent.session_id).toBe('sess-public');
    expect(sentIntent.channel).toBe('web');
    expect(sentIntent.content).toBe(sanitizeContent(req.body.content));
    expect(sentIntent.metadata).toMatchObject(sanitizeMetadata(req.body.metadata));
  });
});
