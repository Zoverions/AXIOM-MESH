import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
import { ChannelOpts, ReliabilityPolicy, registerChannel } from './registry';
import { BaseChannel } from './base';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { Boom } from '@hapi/boom';

export class WhatsAppChannel extends BaseChannel {
    name = 'whatsapp';
    reliabilityPolicy: ReliabilityPolicy = {
        maxRetries: 5,
        retryDelayMs: 2000,
        rateLimitMs: 2000, // WhatsApp usually strict on automated messages
        enforceDeliveryReceipt: true,
        classifyRateLimitError: (err: unknown) => /429|rate limit|too many requests/i.test(String((err as any)?.message || err))
    };
    private sock: any = null;
    private opts: ChannelOpts;

    constructor(opts: ChannelOpts) {
        super();
        this.opts = opts;
    }

    async connect(): Promise<void> {
        console.log(`[WhatsApp] Connecting...`);

        const authDir = path.join(process.cwd(), 'whatsapp_auth');
        if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        const { version } = await fetchLatestWaWebVersion({});

        this.sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }) as any,
            printQRInTerminal: true,
            auth: state,
            browser: Browsers.macOS('Desktop'),
            generateHighQualityLinkPreview: true,
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('connection.update', (update: any) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('[WhatsApp] Connection closed. Reconnecting:', shouldReconnect, lastDisconnect?.error);
                if (shouldReconnect) {
                    this.connect();
                } else {
                    console.log('[WhatsApp] Connection closed permanently.');
                }
            } else if (connection === 'open') {
                console.log('[WhatsApp] Connection opened successfully');
            }
        });

        this.sock.ev.on('messages.upsert', async (m: any) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const text = msg.message.conversation ||
                         msg.message.extendedTextMessage?.text ||
                         msg.message.imageMessage?.caption ||
                         msg.message.videoMessage?.caption;

            if (text) {
                const jid = msg.key.remoteJid;
                const sender = msg.pushName || jid;
                this.opts.onMessage(this.name, jid, text, sender);
            }
        });
    }

    protected async doSendMessage(chatId: string, text: string): Promise<string | undefined> {
        if (!this.sock) {
            throw new Error('[WhatsApp] Cannot send message: socket not connected');
        }
        const res = await this.sock.sendMessage(chatId, { text });
        return res?.key?.id;
    }

    async disconnect(): Promise<void> {
        if (this.sock) {
            this.sock.end(undefined);
            this.sock = null;
            console.log('[WhatsApp] Disconnected');
        }
    }
}

registerChannel('whatsapp', (opts: ChannelOpts) => {
    if (process.env.WHATSAPP_ENABLED !== 'true') return null;
    return new WhatsAppChannel(opts);
});
