export interface IntentObject {
    id: string;
    session_id: string;
    conversation_id?: string;
    actor_id?: string;
    channel: string;
    content: string;
    metadata: Record<string, any>;
    timestamp: number;
    trace_id?: string;
}

export interface IntentResponse {
    id: string;
    intent_id: string;
    response: string;
    status: 'success' | 'error' | 'pending';
    confidence?: number;
    provenance?: string[];
    trace_id?: string;
    audit_trail?: Record<string, any>;
}

export interface ProxyCapability {
    id: string;
    targetNetworkType: 'residential' | 'mobile';
    geoConstraints?: string[];
    sessionSticky: boolean;
    bandwidthQuotaBytes?: number;
}
