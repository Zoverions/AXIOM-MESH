import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import restRoutes from './routes/rest';
import { normalizeInput } from './utils/normalizer';
import { sendToHypervisor } from './services/hypervisorClient';
import { getChannelFactory, getRegisteredChannelNames, Channel } from './channels/registry';
import { initLogger } from './utils/logger';
import './channels'; // Initialize channel registrations

dotenv.config();

// Initialize the log buffer to capture terminal output safely
initLogger();

const REST_PORT = process.env.GATEWAY_REST_PORT || 3000;
const WS_PORT = process.env.GATEWAY_WS_PORT || 3001;

// REST Server
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve static frontend dashboard
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', restRoutes);

app.listen(REST_PORT, () => {
    console.log(`Omni-Gateway REST API running on port ${REST_PORT}`);
});

// WebSocket Server
const wss = new WebSocketServer({ port: Number(WS_PORT) });

wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket connection');

    ws.on('message', async (message: Buffer) => {
        try {
            const data = JSON.parse(message.toString());
            const intent = normalizeInput('websocket', data.content || '', data.metadata || {});

            // Send pending acknowledgment
            ws.send(JSON.stringify({ status: 'pending', intent_id: intent.id }));

            // Process with Hypervisor
            const response = await sendToHypervisor(intent);

            // Send final response
            ws.send(JSON.stringify(response));
        } catch (error) {
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    });
});

console.log(`Omni-Gateway WebSocket server running on port ${WS_PORT}`);

// Initialize Channels
const activeChannels: Record<string, Channel> = {};

async function startChannels() {
    console.log('Initializing available channels...');
    const channelNames = getRegisteredChannelNames();

    for (const name of channelNames) {
        const factory = getChannelFactory(name);
        if (factory) {
            const channel = factory({
                onMessage: async (channelName, chatId, content, sender) => {
                    const intent = normalizeInput(channelName, content, { chatId, sender });
                    console.log(`[${channelName}] Received message from ${sender} (chat: ${chatId}): ${content}`);

                    const response = await sendToHypervisor(intent);
                    if (response.response) {
                        const targetChannel = activeChannels[channelName];
                        if (targetChannel) {
                            await targetChannel.sendMessage(chatId, response.response);
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
