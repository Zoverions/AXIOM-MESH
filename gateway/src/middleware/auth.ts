import { Request, Response, NextFunction } from 'express';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = process.env.GATEWAY_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: GATEWAY_API_KEY is not set' });
    }

    let token = req.query.apiKey as string;

    if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
    }

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header or apiKey parameter' });
    }

    if (token !== apiKey) {
        return res.status(403).json({ error: 'Forbidden: Invalid API Key' });
    }

    next();
};
