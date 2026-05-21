import { Request, Response, NextFunction } from 'express';
import { ProxyCapability } from '../types';
import { AnyIPConnector } from '../services/anyip_connector';

const connector = new AnyIPConnector();

export const routeProxyRequest = (req: Request, res: Response, next: NextFunction) => {
    // Expected capability in header for this mocked router
    const capabilityHeader = req.headers['x-proxy-capability'];

    if (!capabilityHeader) {
        return res.status(401).json({ error: 'Missing Proxy Capability' });
    }

    try {
        const capability: ProxyCapability = JSON.parse(capabilityHeader as string);

        // Use connector to validate and route
        const credentials = connector.resolveCapabilityToCredentials(capability);

        if (!credentials) {
            return res.status(403).json({ error: 'Invalid or Exhausted Proxy Capability' });
        }

        // In a real implementation, we would set up proxy agent here
        res.locals.proxyCredentials = credentials;

        next();
    } catch (e) {
        return res.status(400).json({ error: 'Malformed Proxy Capability' });
    }
};
