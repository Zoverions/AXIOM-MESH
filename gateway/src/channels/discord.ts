import { Client, GatewayIntentBits, TextChannel, DMChannel, NewsChannel } from 'discord.js';
import { ChannelOpts, ReliabilityPolicy, registerChannel } from './registry';
import { BaseChannel } from './base';

export class DiscordChannel extends BaseChannel {
    name = 'discord';
    reliabilityPolicy: ReliabilityPolicy = {
        maxRetries: 3,
        retryDelayMs: 1000,
        rateLimitMs: 500 // Discord typical rate limit
    };
    private client: Client;
    private opts: ChannelOpts;

    constructor(private botToken: string, opts: ChannelOpts) {
        super();
        this.opts = opts;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ]
        });

        this.client.on('messageCreate', (message) => {
            if (message.author.bot) return;

            // Route standard discord messages
            this.opts.onMessage(this.name, message.channelId, message.content, message.author.tag);
        });

        this.client.on('error', (error) => {
            console.error('[Discord] Client error:', error);
        });
    }

    async connect(): Promise<void> {
        console.log(`[Discord] Connecting...`);
        try {
            await this.client.login(this.botToken);
            console.log(`[Discord] Logged in as ${this.client.user?.tag}`);
        } catch (error) {
            console.error('[Discord] Failed to connect:', error);
            throw error;
        }
    }

    protected async doSendMessage(chatId: string, text: string): Promise<string | undefined> {
        const channel = await this.client.channels.fetch(chatId);
        if (channel && (channel instanceof TextChannel || channel instanceof DMChannel || channel instanceof NewsChannel)) {
            const msg = await channel.send(text);
            return msg.id;
        } else if (channel?.isTextBased()) {
            const msg = await (channel as any).send(text);
            return msg?.id;
        } else {
            throw new Error(`[Discord] Channel ${chatId} is not text-based or not found`);
        }
    }

    async disconnect(): Promise<void> {
        this.client.destroy();
        console.log('[Discord] Disconnected');
    }
}

registerChannel('discord', (opts: ChannelOpts) => {
    const token = process.env.DISCORD_TOKEN;
    if (!token) return null;
    return new DiscordChannel(token, opts);
});
