import { NextFunction, Request, Response } from 'express';
import { createClient, RedisClientType } from 'redis';

type CounterState = {
    count: number;
    resetAt: number;
};

const DEFAULT_WINDOW_MS = Number(process.env.GATEWAY_PUBLIC_RATE_LIMIT_WINDOW_MS || 60_000);
const DEFAULT_MAX_REQUESTS = Number(process.env.GATEWAY_PUBLIC_RATE_LIMIT_MAX || 30);

const counters = new Map<string, CounterState>();
let redisClient: RedisClientType | null = null;
let redisConnected = false;

export async function initRedisRateLimiter(url?: string): Promise<void> {
    const redisUrl = url || process.env.REDIS_URL;
    if (!redisUrl) {
        console.warn('No REDIS_URL provided, falling back to in-memory rate limiting');
        return;
    }

    try {
        redisClient = createClient({ url: redisUrl });

        redisClient.on('error', (err) => {
            console.error('Redis Client Error in Rate Limiter', err);
            redisConnected = false;
        });

        redisClient.on('connect', () => {
            redisConnected = true;
            console.log('Redis connected for rate limiting');
        });

        await redisClient.connect();
    } catch (err) {
        console.error('Failed to connect to Redis, falling back to in-memory rate limiting', err);
        redisConnected = false;
        redisClient = null;
    }
}

function getClientId(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || 'unknown';
}

export async function resetPublicRateLimitStateForTests(): Promise<void> {
    counters.clear();
    if (redisClient && redisConnected) {
        try {
            const keys = await redisClient.keys('rl:*');
            if (keys.length > 0) {
                await redisClient.del(keys);
            }
        } catch (e) {
            console.error('Error clearing redis for tests', e);
        }
    }
}

export async function publicIntentRateLimitAsync(
    req: Request,
    res: Response,
    next: NextFunction,
    options?: { windowMs?: number; maxRequests?: number }
): Promise<void> {
    const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
    const maxRequests = options?.maxRequests ?? DEFAULT_MAX_REQUESTS;

    const now = Date.now();
    const clientId = getClientId(req);

    if (redisClient && redisConnected) {
        try {
            const redisKey = `rl:${clientId}`;

            // Increment the counter. If key doesn't exist, it is created with value 1.
            const count = await redisClient.incr(redisKey);

            if (count === 1) {
                // Set the expiration if this is the first request
                await redisClient.pExpire(redisKey, windowMs);
                next();
                return;
            }

            if (count > maxRequests) {
                // Get the remaining TTL to calculate retry-after
                const ttl = await redisClient.pTTL(redisKey);
                const retryAfterSeconds = Math.max(1, Math.ceil(ttl / 1000));

                res.setHeader('Retry-After', retryAfterSeconds.toString());
                res.status(429).json({
                    error: 'Rate limit exceeded for public intent route',
                    retry_after_seconds: retryAfterSeconds
                });
                return;
            }

            next();
            return;
        } catch (e) {
            console.error('Redis rate limiter error, falling back to memory', e);
            // Fall through to memory rate limiting
        }
    }

    // In-Memory Fallback
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

export function publicIntentRateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
    options?: { windowMs?: number; maxRequests?: number }
): void {
    publicIntentRateLimitAsync(req, res, next, options).catch(next);
}
