import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import http from 'http';
import https from 'https';
import dotenv from 'dotenv';
import path from 'path';
import cluster from 'cluster';
import os from 'os';
import { authMiddleware } from './middleware/auth';
import { extractApiKeyFromHeaders, validateGatewayApiKey } from './middleware/auth_utils';
import restRoutes, { validateNftRouteEnv } from './routes/rest';
import mobileRoutes from './routes/mobile';
import { normalizeInput } from './utils/normalizer';
import { sendToHypervisor } from './services/hypervisorClient';
import { parseAndSanitizeIntent } from './middleware/intent_parser';
import { filterACS } from './middleware/referent_filter';
import { getChannelFactory, getRegisteredChannelNames, Channel } from './channels/registry';
import { initLogger } from './utils/logger';
import { BackpressureWebSocket } from './performance/EventLoopOptimizer';
import { wafMiddleware } from './middleware/waf';
import { initRedisRateLimiter } from './middleware/public_rate_limit';
import { isOriginAllowed, parseAllowedOrigins, parseByteLimit } from './config/security';
import './channels'; // Initialize channel registrations

dotenv.config();

if (process.env.NODE_ENV !== 'test' && process.env.ENABLE_NFT_ROUTES !== 'false') {
    try {
        validateNftRouteEnv();
    } catch (error) {
        console.error(`Gateway startup validation failed: ${(error as Error).message}`);
        process.exit(1);
    }
}

// Initialize the log buffer to capture terminal output safely
initLogger();

// Initialize Redis rate limiter for public routes
initRedisRateLimiter().catch(err => console.error('Failed to initialize Redis rate limiter:', err));

const REST_PORT = process.env.GATEWAY_REST_PORT || 3000;
const WS_PORT = process.env.GATEWAY_WS_PORT || 3001;

if (cluster.isPrimary && process.env.NODE_ENV !== 'test') {
    const numCPUs = os.cpus().length;
    console.log(`Primary ${process.pid} is running. Forking ${numCPUs} workers for horizontal scaling...`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died. Restarting...`);
        cluster.fork();
    });
} else {

// REST Server
const app = express();

const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS, REST_PORT);
const maxJsonBodyBytes = parseByteLimit(process.env.GATEWAY_MAX_JSON_BODY_BYTES, 1024 * 100);
const wsMaxPayloadBytes = parseByteLimit(process.env.GATEWAY_WS_MAX_PAYLOAD_BYTES, 1024 * 1024);

app.use(cors({
    origin: function (origin, callback) {
        if (isOriginAllowed(origin, allowedOrigins, process.env.NODE_ENV, process.env.ALLOW_MISSING_ORIGIN)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.disable('x-powered-by');
app.use(helmet());
app.use(bodyParser.json({ limit: maxJsonBodyBytes }));
app.use(wafMiddleware);

// Serve static frontend dashboard with the same auth model as REST/WS
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
        next();
        return;
    }
    authMiddleware(req, res, next);
});
app.use(express.static(path.join(__dirname, '../public'), {
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '5m' : 0,
}));

app.use('/', restRoutes);
app.use('/api/mobile', mobileRoutes);

let server;
try {
    if (!(process.env.MTLS_CA_CERT && process.env.MTLS_CLIENT_CERT && process.env.MTLS_CLIENT_KEY)) {
        throw new Error('MTLS_CA_CERT, MTLS_CLIENT_CERT, and MTLS_CLIENT_KEY must be provided by secret manager injection');
    }
    const mTLSConfig = {
        key: process.env.MTLS_CLIENT_KEY,
        cert: process.env.MTLS_CLIENT_CERT,
        ca: [process.env.MTLS_CA_CERT],
        requestCert: true,
        rejectUnauthorized: true,
    };

    if (process.env.NODE_ENV === 'test') {
        server = http.createServer(app);
    } else {
        server = https.createServer(mTLSConfig, app);
    }
} catch (e) {
    console.error("mTLS certs not found. mTLS is mandatory for security.", e);
    if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
    } else {
        server = http.createServer(app);
    }
}

server.listen(REST_PORT, () => {
    console.log(`Omni-Gateway REST API running on port ${REST_PORT}`);
});

// WebSocket Server
const wss = new WebSocketServer({
    port: Number(WS_PORT),
    maxPayload: wsMaxPayloadBytes,
    perMessageDeflate: {
        threshold: 1024,
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
    },
    verifyClient: (info, done) => {
        const allowed = isOriginAllowed(info.origin, allowedOrigins, process.env.NODE_ENV, process.env.ALLOW_MISSING_ORIGIN);
        if (!allowed) {
            done(false, 403, 'Forbidden origin');
            return;
        }

        done(true);
    },
});

wss.on('connection', (ws: WebSocket, req: any) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = extractApiKeyFromHeaders(req.headers, url.searchParams.get('apiKey'));
    const validation = validateGatewayApiKey(token, process.env.GATEWAY_API_KEY);

    if (!validation.ok) {
        const reason = validation.code === 500 ? 'Server configuration error' : 'Unauthorized: Invalid API Key';
        console.log(`WebSocket connection rejected: ${validation.error}`);
        ws.close(validation.code === 500 ? 1011 : 1008, reason);
        return;
    }

    console.log('New WebSocket connection');
    const backpressureWs = new BackpressureWebSocket(ws);

    ws.on('message', async (message: Buffer) => {
        try {
            const data = await parseAndSanitizeIntent(message.toString());
            const session_id = data.session_id || 'default_ws_session';
            const metadata = {
                identity_hash: data.identity_hash,
                response_style: data.modality || 'standard',
                conversation_id: data.conversation_id || session_id,
                actor_id: data.actor_id || data.identity_hash || 'websocket_user',
                consent_scope: data.consent_scope || 'allowed'
            };
            const intent = normalizeInput(session_id, 'websocket', data.input, metadata);
            if (data.conversation_id) intent.conversation_id = data.conversation_id;
            if (data.actor_id) intent.actor_id = data.actor_id;

            // Send pending acknowledgment
            backpressureWs.send(JSON.stringify({ status: 'pending', intent_id: intent.id, trace_id: intent.trace_id }));

            // Process with Hypervisor
            const response = await sendToHypervisor(intent);
            if (response.response) {
                response.response = filterACS(response.response);
            }

            // Send final response
            backpressureWs.send(JSON.stringify(response));
        } catch (error) {
            console.error(error);
            backpressureWs.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    });
});

console.log(`Omni-Gateway WebSocket server running on port ${WS_PORT}`);

// Initialize Channels (Phase 1)
const activeChannels: Record<string, Channel> = {};

async function startChannels() {
    console.log('Initializing available channels...');
    const channelNames = getRegisteredChannelNames();

    for (const name of channelNames) {
        const factory = getChannelFactory(name);
        if (factory) {
            const channel = factory({
                onMessage: async (channelName, chatId, content, sender) => {
                    const session_id = chatId || 'default';
                    const intent = normalizeInput(session_id, channelName, content, {
                        chatId,
                        sender,
                        conversation_id: chatId,
                        actor_id: sender,
                        consent_scope: 'allowed'
                    });
                    console.log(`[${channelName}] Received message from ${sender} (chat: ${chatId}): ${content}`);

                    const response = await sendToHypervisor(intent);
                    if (response.response) {
                        response.response = filterACS(response.response);
                        const targetChannel = activeChannels[channelName];
                        if (targetChannel) {
                            const receipt = await targetChannel.sendMessage(chatId, response.response);
                            if (receipt.success) {
                                console.log(`[${channelName}] Message delivered successfully (ID: ${receipt.messageId})`);
                            } else {
                                console.error(`[${channelName}] Message delivery failed: ${receipt.error}`);
                            }
                        }
                    }
                }
            });

            if (channel) {
                activeChannels[name] = channel;
                await channel.connect();
                console.log(`Started channel: ${name}`);
            }
        }
    }
}

startChannels().catch(console.error);

} // End else
