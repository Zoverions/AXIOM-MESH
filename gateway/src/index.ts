import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import https from 'https';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { authMiddleware } from './middleware/auth';
import { extractApiKeyFromHeaders, validateGatewayApiKey } from './middleware/auth_utils';
import restRoutes from './routes/rest';
import { normalizeInput } from './utils/normalizer';
import { sendToHypervisor } from './services/hypervisorClient';
import { parseAndSanitizeIntent } from './middleware/intent_parser';
import { filterACS } from './middleware/referent_filter';
import { getChannelFactory, getRegisteredChannelNames, Channel } from './channels/registry';
import { initLogger } from './utils/logger';
import { BackpressureWebSocket } from './performance/EventLoopOptimizer';
import { wafMiddleware } from './middleware/waf';
import './channels'; // Initialize channel registrations

dotenv.config();

// Initialize the log buffer to capture terminal output safely
initLogger();

const REST_PORT = process.env.GATEWAY_REST_PORT || 3000;
const WS_PORT = process.env.GATEWAY_WS_PORT || 3001;

// REST Server
const app = express();

const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : [`http://localhost:${REST_PORT}`, `http://127.0.0.1:${REST_PORT}`];

app.use(cors({
    origin: function (origin, callback) {
        // Explicitly block requests with no origin to prevent CSRF bypass
        // Exception: allowed if explicitly requested via CORS_ORIGINS '*' or explicitly configured
        if (!origin) {
            if (allowedOrigins.includes('*') || process.env.NODE_ENV === 'test' || process.env.ALLOW_MISSING_ORIGIN === 'true') {
                return callback(null, true);
            }
            return callback(new Error('Not allowed by CORS'));
        }

        if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*') || process.env.NODE_ENV === 'test') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(helmet());
app.use(bodyParser.json());
app.use(wafMiddleware);

// Serve static frontend dashboard with the same auth model as REST/WS
app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
        next();
        return;
    }
    authMiddleware(req, res, next);
});
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', restRoutes);

const certsDir = process.env.CERTS_DIR || '../certs';
let server;
try {
    const mTLSConfig = {
        key: fs.readFileSync(`${certsDir}/gateway.key`),
        cert: fs.readFileSync(`${certsDir}/gateway.crt`),
        ca: [fs.readFileSync(`${certsDir}/ca.crt`)],
        requestCert: true,
        rejectUnauthorized: true,
    };
    server = https.createServer(mTLSConfig, app);
} catch (e) {
    console.error("mTLS certs not found. mTLS is mandatory for security.");
    process.exit(1);
}

server.listen(REST_PORT, () => {
    console.log(`Omni-Gateway REST API running on port ${REST_PORT}`);
});

// WebSocket Server
const wss = new WebSocketServer({ port: Number(WS_PORT) });

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
