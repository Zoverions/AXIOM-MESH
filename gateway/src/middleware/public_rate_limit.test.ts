import { publicIntentRateLimit, resetPublicRateLimitStateForTests } from './public_rate_limit';

describe('publicIntentRateLimit', () => {
  beforeEach(() => {
    resetPublicRateLimitStateForTests();
  });

  test('allows requests below limit', () => {
    const req: any = { headers: {}, ip: '127.0.0.1' };
    const res: any = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    publicIntentRateLimit(req, res, next, { windowMs: 1000, maxRequests: 2 });
    publicIntentRateLimit(req, res, next, { windowMs: 1000, maxRequests: 2 });

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 429 after exceeding limit', () => {
    const req: any = { headers: { 'x-forwarded-for': '203.0.113.10' }, ip: '127.0.0.1' };
    const res: any = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    publicIntentRateLimit(req, res, next, { windowMs: 10_000, maxRequests: 1 });
    publicIntentRateLimit(req, res, next, { windowMs: 10_000, maxRequests: 1 });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Rate limit exceeded for public intent route',
      })
    );
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });
});
