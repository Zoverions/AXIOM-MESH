import { WebSocketServer, WebSocket } from 'ws';
import * as crypto from 'crypto';
import { z } from 'zod';

// We import the native IPC bridge to pipe audio directly to the Python Hypervisor
import { ipcClient } from '../middleware/ipc_bridge';

const logger = console;

/**
 * Pillar 4: The PersonaPlex Audio Gateway
 * Bypasses legacy STT/TTS. Pipes raw PCM audio directly to the
 * 1.58-bit PersonaPlex 7B model running in the Hypervisor.
 */
export class FullDuplexVoiceGateway {
    private wss: WebSocketServer;
    private activeStreams: Map<string, WebSocket> = new Map();

    constructor(port: number = 8081) {
        this.wss = new WebSocketServer({ port });
        this.initialize();
    }

    private initialize() {
        logger.info(`[🎙️] PersonaPlex Full-Duplex Gateway listening on port ${this.wss.options.port}`);

        this.wss.on('connection', (ws: WebSocket) => {
            const streamId = crypto.randomUUID();
            this.activeStreams.set(streamId, ws);
            logger.info(`[📞] WebRTC Audio Stream connected: ${streamId}`);

            // Initialize the persistent binary stream to the Hypervisor
            const hypervisorStream = ipcClient.createAudioStream(streamId);

            ws.on('message', (data: Buffer) => {
                // Pipe raw user audio directly into the Hypervisor's PersonaPlex tensor buffer
                hypervisorStream.write(data);
            });

            // Listen for continuous audio output FROM the PersonaPlex model
            hypervisorStream.on('data', (audioChunk: Buffer) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(audioChunk);
                }
            });

            // Listen for Thermodynamic Vetoes (Interruptions)
            hypervisorStream.on('interruption_detected', () => {
                logger.warn(`[🛑] Human Interruption Detected on stream ${streamId}. Halting output buffers.`);
                // Instantly clear the client-side audio buffer to stop playback
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "HALT_PLAYBACK" }));
                }
            });

            ws.on('close', () => {
                logger.info(`[🔌] Stream closed: ${streamId}`);
                this.activeStreams.delete(streamId);
                hypervisorStream.end();
            });
        });
    }
}