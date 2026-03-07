"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const rest_1 = __importDefault(require("./routes/rest"));
const normalizer_1 = require("./utils/normalizer");
const hypervisorClient_1 = require("./services/hypervisorClient");
dotenv_1.default.config();
const REST_PORT = process.env.GATEWAY_REST_PORT || 3000;
const WS_PORT = process.env.GATEWAY_WS_PORT || 3001;
// REST Server
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
app.use('/', rest_1.default);
app.listen(REST_PORT, () => {
    console.log(`Omni-Gateway REST API running on port ${REST_PORT}`);
});
// WebSocket Server
const wss = new ws_1.WebSocketServer({ port: Number(WS_PORT) });
wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            const intent = (0, normalizer_1.normalizeInput)('websocket', data.content || '', data.metadata || {});
            // Send pending acknowledgment
            ws.send(JSON.stringify({ status: 'pending', intent_id: intent.id }));
            // Process with Hypervisor
            const response = await (0, hypervisorClient_1.sendToHypervisor)(intent);
            // Send final response
            ws.send(JSON.stringify(response));
        }
        catch (error) {
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    });
});
console.log(`Omni-Gateway WebSocket server running on port ${WS_PORT}`);
//# sourceMappingURL=index.js.map