import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import https from 'https';
import dotenv from 'dotenv';
import executeRoutes from './routes/execute';
import capsuleRoutes from './routes/capsule';

dotenv.config();

function log(level: 'info' | 'error', message: string, details?: Record<string, unknown>): void {
    const payload = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...(details || {})
    };
    const line = JSON.stringify(payload);
    if (level === 'error') {
        process.stderr.write(`${line}\n`);
        return;
    }
    process.stdout.write(`${line}\n`);
}

const PORT = process.env.SANDBOX_PORT || 4000;
const corsOrigins = (process.env.SANDBOX_CORS_ORIGINS || 'http://localhost:3000,http://localhost:8000,http://localhost:5000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

export const app = express();
app.use(cors({ origin: corsOrigins }));
app.use(bodyParser.json());
app.use('/', executeRoutes);
app.use('/', capsuleRoutes);

if (process.env.NODE_ENV !== 'test') {
    let server;
    try {
        if (!(process.env.MTLS_CA_CERT && process.env.MTLS_CLIENT_CERT && process.env.MTLS_CLIENT_KEY)) {
            throw new Error('MTLS_CA_CERT, MTLS_CLIENT_CERT, and MTLS_CLIENT_KEY must be injected by secret manager');
        }
        const mTLSConfig = {
            key: process.env.MTLS_CLIENT_KEY,
            cert: process.env.MTLS_CLIENT_CERT,
            ca: [process.env.MTLS_CA_CERT],
            requestCert: true,
            rejectUnauthorized: true,
        };
        server = https.createServer(mTLSConfig, app);
    } catch (e) {
        log('error', 'mTLS certs not found. mTLS is mandatory for security.');
        process.exit(1);
    }

    server.listen(PORT, () => {
        log('info', `Execution Sandbox running on port ${PORT} with mTLS`, { corsOrigins });
    });
}
