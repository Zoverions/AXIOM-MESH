import { Request, Response, NextFunction } from 'express';

// Define common malicious patterns for a basic WAF
const sqlInjectionPatterns = [
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /((\%27)|(\'))union/i,
    /exec(\s|\+)+(s|x)p\w+/i,
    /UNION\s+ALL\s+SELECT/i
];

const xssPatterns = [
    /((\%3C)|<)((\%2F)|\/)*[a-z0-9\%]+((\%3E)|>)/i,
    /((\%3C)|<)((\%69)|i|(\%49))((\%6D)|m|(\%4D))((\%67)|g|(\%47))[^\n]+((\%3E)|>)/i,
    /((\%3C)|<)[^\n]+((\%3E)|>)/i,
    /javascript:/i,
    /onload=/i,
    /onerror=/i,
    /onmouseover=/i
];

const blocklist = [...sqlInjectionPatterns, ...xssPatterns];

export function wafMiddleware(req: Request, res: Response, next: NextFunction) {
    const isMalicious = (value: string): boolean => {
        return blocklist.some(pattern => pattern.test(value));
    };

    const checkObject = (obj: any): boolean => {
        if (typeof obj === 'string') {
            return isMalicious(obj);
        } else if (typeof obj === 'object' && obj !== null) {
            for (const key in obj) {
                if (checkObject(obj[key])) {
                    return true;
                }
            }
        }
        return false;
    };

    // Check query parameters
    if (checkObject(req.query)) {
        return res.status(403).json({ error: 'WAF: Malicious query payload detected.' });
    }

    // Check request path
    if (isMalicious(decodeURIComponent(req.path))) {
        return res.status(403).json({ error: 'WAF: Malicious path detected.' });
    }

    // Wait until body is parsed to check body, this requires this middleware
    // to be placed AFTER body-parser in the express chain, OR we parse chunks here.
    // Assuming it's placed after body-parser:
    if (req.body && checkObject(req.body)) {
        return res.status(403).json({ error: 'WAF: Malicious body payload detected.' });
    }

    next();
}
