import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestWaWebVersion } from '@whiskeysockets/baileys';
import { Channel, ChannelOpts, registerChannel } from './registry';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { Boom } from '@hapi/boom';

export class WhatsAppChannel implements Channel {
    name = 'whatsapp';
    private sock: any = null;
    private opts: ChannelOpts;

    constructor(opts: ChannelOpts) {
        this.opts = opts;
    }

    async connect(): Promise<void> {
        console.log(`Connecting to WhatsApp...`);

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
                console.log('WhatsApp connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
                if (shouldReconnect) {
                    this.connect();
                } else {
                    console.log('WhatsApp connection closed permanently.');
                }
            } else if (connection === 'open') {
                console.log('WhatsApp connection opened');
            }
        });

        this.sock.ev.on('messages.upsert', async (m: any) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (text) {
                const jid = msg.key.remoteJid;
                const sender = msg.pushName || jid;
                this.opts.onMessage(this.name, jid, text, sender);
            }
        });
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        if (!this.sock) return;
        try {
            await this.sock.sendMessage(chatId, { text });
        } catch (error) {
            console.error('Failed to send WhatsApp message:', error);
        }
    }

    async disconnect(): Promise<void> {
        if (this.sock) {
            this.sock.end(undefined);
            this.sock = null;
        }
    }
}

registerChannel('whatsapp', (opts: ChannelOpts) => {
    if (process.env.WHATSAPP_ENABLED !== 'true') return null;
    return new WhatsAppChannel(opts);
});
