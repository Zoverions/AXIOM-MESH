import { Request, Response, NextFunction } from 'express';
import { extractApiKeyToken, validateGatewayApiKey } from './auth_utils';

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

    next();
};
