import { Request, Response, NextFunction } from 'express';
import { extractApiKeyToken, validateGatewayApiKey } from './auth_utils';
import { setupTOTP, setupPasskey, recoverMesh } from '../auth/2fa';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const token = extractApiKeyToken({
        queryApiKey: typeof req.query.apiKey === 'string' ? req.query.apiKey : undefined,
        authorizationHeader: req.headers.authorization,
        xApiKeyHeader: typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : undefined
    });

    const validation = validateGatewayApiKey(token, process.env.GATEWAY_API_KEY);

    if (!validation.ok) {
        return res.status(validation.code).json({ error: validation.error });
    }

    // After bond check: if recoveryEnabled, route to 2FA
    // This is a simplified hook demonstrating where 2FA routing would take place
    if (process.env.RECOVERY_2FA_ENABLED === 'true' && req.path === '/recovery/setup') {
        // In a real application, you would handle this via a dedicated route,
        // but here we demonstrate the interception hook based on the instructions.
    }

    next();
};
