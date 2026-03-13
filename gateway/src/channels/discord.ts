import { Client, GatewayIntentBits, TextChannel, DMChannel, NewsChannel } from 'discord.js';
import { Channel, ChannelOpts, registerChannel } from './registry';

export class DiscordChannel implements Channel {
    name = 'discord';
    private client: Client;
    private opts: ChannelOpts;

    constructor(private botToken: string, opts: ChannelOpts) {
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

    async sendMessage(chatId: string, text: string): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(chatId);
            if (channel && (channel instanceof TextChannel || channel instanceof DMChannel || channel instanceof NewsChannel)) {
                await channel.send(text);
                console.log(`[Discord] Message sent to ${chatId}`);
            } else if (channel?.isTextBased()) {
                await (channel as any).send(text);
                console.log(`[Discord] Message sent to text-based channel ${chatId}`);
            } else {
                console.warn(`[Discord] Channel ${chatId} is not text-based or not found`);
            }
        } catch (error) {
            console.error('[Discord] Failed to send message:', error);
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
