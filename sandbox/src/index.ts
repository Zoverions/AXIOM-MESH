import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import https from 'https';
import fs from 'fs';
import dotenv from 'dotenv';
import executeRoutes from './routes/execute';
import capsuleRoutes from './routes/capsule';

dotenv.config();

// Structured logging setup
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
    originalLog(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: args.join(' ')
    }));
};

console.error = (...args) => {
    originalError(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: args.join(' ')
    }));
};

const PORT = process.env.SANDBOX_PORT || 4000;

export const app = express();
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:8000', 'http://localhost:5000'] }));
app.use(bodyParser.json());
app.use('/', executeRoutes);
app.use('/', capsuleRoutes);

if (process.env.NODE_ENV !== 'test') {
    const certsDir = process.env.CERTS_DIR || '../certs';
    let server;
    try {
        const mTLSConfig = {
            key: fs.readFileSync(`${certsDir}/sandbox.key`),
            cert: fs.readFileSync(`${certsDir}/sandbox.crt`),
            ca: [fs.readFileSync(`${certsDir}/ca.crt`)],
            requestCert: true,
            rejectUnauthorized: true,
        };
        server = https.createServer(mTLSConfig, app);
    } catch (e) {
        console.error("mTLS certs not found. mTLS is mandatory for security.");
        process.exit(1);
    }

    server.listen(PORT, () => {
        console.log(`Execution Sandbox running on port ${PORT} with mTLS`);
    });
}
