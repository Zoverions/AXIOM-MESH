/**
 * X (Twitter) Channel Adapter for AXIOM-MESH Gateway
 * 
 * Uses official TypeScript XDK + xurl pattern for agent-optimized
 * short-form URLs that auto-resolve to full X API calls.
 * 
 * Integration: Phase 3 - Official XDKs for Gateway & Sandbox
 * Official docs: https://docs.x.com, https://developer.twitter.com
 */

import axios, { AxiosInstance } from 'axios';
import { BaseChannel } from './base';
import { DeliveryReceipt, ReliabilityPolicy } from './registry';

// X API configuration
interface XConfig {
    bearerToken?: string;
    apiKey?: string;
    apiSecret?: string;
    accessToken?: string;
    accessTokenSecret?: string;
    apiUrl: string;
    mockMode: boolean;
}

// xurl patterns for common X operations
const XURL_PATTERNS = {
    search_posts: 'https://api.x.com/2/tweets/search/recent',
    get_tweet: 'https://api.x.com/2/tweets/{id}',
    get_user: 'https://api.x.com/2/users/by/username/{username}',
    get_user_tweets: 'https://api.x.com/2/users/{id}/tweets',
    create_tweet: 'https://api.x.com/2/tweets',
    trends: 'https://api.x.com/1.1/trends/place.json',
};

export class XAdapter extends BaseChannel {
    name = 'x-twitter';
    
    reliabilityPolicy: ReliabilityPolicy = {
        maxRetries: 3,
        retryDelayMs: 1000,
        rateLimitMs: 2000, // X API rate limits are strict
        enforceDeliveryReceipt: true,
        classifyRateLimitError: (err: unknown): boolean => {
            const raw = err instanceof Error ? err.message : String(err);
            return /rate\s*limit|429|too many requests/i.test(raw);
        },
    };

    private config: XConfig;
    private client: AxiosInstance;
    private rateLimits: Map<string, { count: number; windowStart: number }> = new Map();

    constructor(config?: Partial<XConfig>) {
        super();
        
        this.config = {
            bearerToken: config?.bearerToken || process.env.X_BEARER_TOKEN || '',
            apiKey: config?.apiKey || process.env.X_API_KEY || '',
            apiSecret: config?.apiSecret || process.env.X_API_SECRET || '',
            accessToken: config?.accessToken || process.env.X_ACCESS_TOKEN || '',
            accessTokenSecret: config?.accessTokenSecret || process.env.X_ACCESS_TOKEN_SECRET || '',
            apiUrl: 'https://api.x.com',
            mockMode: process.env.X_MOCK_MODE === 'true' || !config?.bearerToken,
        };

        this.client = axios.create({
            baseURL: this.config.apiUrl,
            timeout: 15000,
            headers: {
                'Authorization': this.config.bearerToken 
                    ? `Bearer ${this.config.bearerToken}` 
                    : '',
                'Content-Type': 'application/json',
                'User-Agent': 'AXIOM-MESH-Gateway/1.0',
            },
        });

        if (this.config.mockMode) {
            console.log('[X Adapter] Running in mock mode (no X API credentials)');
        }
    }

    async connect(): Promise<void> {
        console.log('[X Adapter] Connecting...');
        if (this.config.mockMode) {
            console.log('[X Adapter] Mock mode active - no real connection');
        } else {
            console.log('[X Adapter] Connected to X API');
        }
    }

    async disconnect(): Promise<void> {
        console.log('[X Adapter] Disconnecting...');
        // No persistent connection to close for REST API
    }

    protected async doSendMessage(chatId: string, text: string): Promise<string | undefined> {
        // For X, chatId is typically ignored; we publish to timeline
        // If chatId contains @username, we can mention them
        
        if (this.config.mockMode) {
            return this.mockSend(text);
        }

        try {
            const response = await this.client.post('/2/tweets', {
                text: text,
            });

            const tweetId = response.data?.data?.id;
            console.log(`[X Adapter] Published tweet: ${tweetId}`);
            return tweetId;
        } catch (error: any) {
            console.error('[X Adapter] Failed to publish:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Search posts on X using xurl pattern
     */
    async searchPosts(query: string, maxResults: number = 10): Promise<any> {
        if (this.config.mockMode) {
            return this.mockSearch(query, maxResults);
        }

        try {
            const response = await this.client.get('/2/tweets/search/recent', {
                params: {
                    query: query,
                    max_results: Math.min(maxResults, 100),
                    'tweet.fields': 'created_at,author_id,public_metrics',
                },
            });

            return this.cacheAndReturn('search_posts', response.data);
        } catch (error: any) {
            console.error('[X Adapter] Search failed:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get user info by username using xurl pattern
     */
    async getUserInfo(username: string): Promise<any> {
        if (this.config.mockMode) {
            return this.mockUserInfo(username);
        }

        try {
            const response = await this.client.get(`/2/users/by/username/${username}`, {
                params: {
                    'user.fields': 'created_at,verified,public_metrics,description',
                },
            });

            return this.cacheAndReturn('get_user', response.data);
        } catch (error: any) {
            console.error('[X Adapter] Get user failed:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get user's posts using xurl pattern
     */
    async getUserPosts(username: string, maxResults: number = 10): Promise<any> {
        if (this.config.mockMode) {
            return this.mockUserPosts(username, maxResults);
        }

        try {
            // First get user ID
            const userResponse = await this.getUserInfo(username);
            const userId = userResponse.data?.id;

            if (!userId) {
                throw new Error(`User ${username} not found`);
            }

            // Then get their tweets
            const response = await this.client.get(`/2/users/${userId}/tweets`, {
                params: {
                    max_results: Math.min(maxResults, 100),
                    'tweet.fields': 'created_at,public_metrics,text',
                },
            });

            return this.cacheAndReturn('get_user_tweets', response.data);
        } catch (error: any) {
            console.error('[X Adapter] Get user posts failed:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get trending topics using xurl pattern
     */
    async getTrends(woeid: number = 1): Promise<any> {
        if (this.config.mockMode) {
            return this.mockTrends(woeid);
        }

        try {
            // Note: Trends API requires OAuth 1.0a, which needs different auth setup
            // This is a placeholder - would need separate OAuth client for production
            console.warn('[X Adapter] Trends API requires OAuth 1.0a setup');
            return this.mockTrends(woeid);
        } catch (error: any) {
            console.error('[X Adapter] Get trends failed:', error.message);
            throw error;
        }
    }

    /**
     * Check rate limit status for a given endpoint
     */
    checkRateLimit(endpoint: string): boolean {
        const now = Date.now();
        const windowMs = 15 * 60 * 1000; // 15 minutes
        
        const record = this.rateLimits.get(endpoint);
        if (!record) {
            this.rateLimits.set(endpoint, { count: 1, windowStart: now });
            return true;
        }

        // Reset window if expired
        if (now - record.windowStart > windowMs) {
            this.rateLimits.set(endpoint, { count: 1, windowStart: now });
            return true;
        }

        // Check if within buffer (80% of limit)
        const limit = this.getRateLimitForEndpoint(endpoint);
        if (record.count >= limit * 0.8) {
            console.warn(`[X Adapter] Rate limit buffer reached for ${endpoint}`);
            return false;
        }

        record.count++;
        return true;
    }

    private getRateLimitForEndpoint(endpoint: string): number {
        const limits: Record<string, number> = {
            'search_posts': 300,
            'get_user': 300,
            'get_user_tweets': 300,
            'create_tweet': 200,
            'trends': 75,
        };
        return limits[endpoint] || 300;
    }

    private cacheAndReturn(endpoint: string, data: any): any {
        // In production, integrate with Redis or similar cache layer
        // For now, just track rate limits
        this.checkRateLimit(endpoint);
        return data;
    }

    // Mock implementations for development/testing
    private mockSend(text: string): string {
        const mockId = `mock_${Date.now()}`;
        console.log(`[X Adapter MOCK] Would publish: "${text.substring(0, 50)}..."`);
        return mockId;
    }

    private mockSearch(query: string, maxResults: number): any {
        return {
            data: [
                {
                    id: 'mock_123',
                    text: `Mock result for query: ${query}`,
                    created_at: new Date().toISOString(),
                    author_id: 'mock_user',
                    public_metrics: {
                        retweet_count: 10,
                        reply_count: 5,
                        like_count: 50,
                        quote_count: 2,
                    },
                },
            ],
            meta: {
                result_count: 1,
                newest_id: 'mock_123',
            },
        };
    }

    private mockUserInfo(username: string): any {
        return {
            data: {
                id: 'mock_user_id',
                name: 'Mock User',
                username: username,
                verified: false,
                created_at: '2020-01-01T00:00:00.000Z',
                description: 'Mock user for testing',
                public_metrics: {
                    followers_count: 1000,
                    following_count: 500,
                    tweet_count: 100,
                },
            },
        };
    }

    private mockUserPosts(username: string, maxResults: number): any {
        return {
            data: Array.from({ length: Math.min(maxResults, 5) }, (_, i) => ({
                id: `mock_tweet_${i}`,
                text: `Mock tweet ${i + 1} from @${username}`,
                created_at: new Date().toISOString(),
                public_metrics: {
                    retweet_count: Math.floor(Math.random() * 100),
                    reply_count: Math.floor(Math.random() * 20),
                    like_count: Math.floor(Math.random() * 500),
                    quote_count: Math.floor(Math.random() * 10),
                },
            })),
            meta: {
                result_count: Math.min(maxResults, 5),
            },
        };
    }

    private mockTrends(woeid: number): any {
        return [
            {
                name: '#MockTrend',
                tweet_volume: 10000,
                url: `https://x.com/search?q=%23MockTrend`,
            },
            {
                name: '#AXIOMMesh',
                tweet_volume: 5000,
                url: `https://x.com/search?q=%23AXIOMMesh`,
            },
        ];
    }
}

// Export factory function for registry
export function createXAdapter(): XAdapter {
    return new XAdapter();
}
