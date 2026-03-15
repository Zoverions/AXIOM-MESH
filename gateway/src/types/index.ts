export interface IntentObject {
    id: string;
    session_id: string;
    channel: string;
    content: string;
    metadata: Record<string, any>;
    timestamp: number;
}

export interface IntentResponse {
    id: string;
    intent_id: string;
    response: string;
    status: 'success' | 'error' | 'pending';
    confidence?: number;
    provenance?: string[];
}
