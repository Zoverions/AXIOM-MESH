export function parseAllowedOrigins(corsOriginsEnv: string | undefined, restPort: string | number): string[] {
    if (corsOriginsEnv) {
        return corsOriginsEnv
            .split(',')
            .map(origin => origin.trim())
            .filter(Boolean);
    }

    return [`http://localhost:${restPort}`, `http://127.0.0.1:${restPort}`];
}

export function isOriginAllowed(
    origin: string | undefined,
    allowedOrigins: string[],
    nodeEnv: string | undefined,
    allowMissingOrigin: string | undefined
): boolean {
    if (!origin) {
        return allowedOrigins.includes('*') || nodeEnv === 'test' || allowMissingOrigin === 'true';
    }

    return allowedOrigins.includes('*') || nodeEnv === 'test' || allowedOrigins.includes(origin);
}

export function parseByteLimit(rawValue: string | undefined, fallback: number): number {
    if (!rawValue) {
        return fallback;
    }

    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}
