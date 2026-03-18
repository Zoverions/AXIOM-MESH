import { NextFunction, Request, Response } from 'express';

type CounterState = {
    count: number;
    resetAt: number;
};

const DEFAULT_WINDOW_MS = Number(process.env.GATEWAY_PUBLIC_RATE_LIMIT_WINDOW_MS || 60_000);
const DEFAULT_MAX_REQUESTS = Number(process.env.GATEWAY_PUBLIC_RATE_LIMIT_MAX || 30);

const counters = new Map<string, CounterState>();

function getClientId(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || 'unknown';
}

export function resetPublicRateLimitStateForTests(): void {
    counters.clear();
}

export function publicIntentRateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
    options?: { windowMs?: number; maxRequests?: number }
): void {
    const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
    const maxRequests = options?.maxRequests ?? DEFAULT_MAX_REQUESTS;

    const now = Date.now();
    const clientId = getClientId(req);
    const current = counters.get(clientId);

    if (!current || now >= current.resetAt) {
        counters.set(clientId, { count: 1, resetAt: now + windowMs });
        next();
        return;
    }

    if (current.count >= maxRequests) {
        const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
        res.setHeader('Retry-After', retryAfterSeconds.toString());
        res.status(429).json({
            error: 'Rate limit exceeded for public intent route',
            retry_after_seconds: retryAfterSeconds
        });
        return;
    }

    current.count += 1;
    counters.set(clientId, current);
    next();
}
