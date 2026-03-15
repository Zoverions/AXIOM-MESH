import { IntentObject } from '../types';
import { v4 as uuidv4 } from 'uuid'; // need to install uuid

export function normalizeInput(session_id: string, channel: string, content: string, metadata: Record<string, any> = {}): IntentObject {
    const conversationId = metadata.conversation_id || session_id || `conv_${uuidv4()}`;
    const actorId = metadata.actor_id || metadata.identity_hash || metadata.sender || 'anonymous_actor';
    return {
        id: uuidv4(),
        session_id: session_id || 'default',
        conversation_id: conversationId,
        actor_id: actorId,
        channel: channel,
        content: content,
        metadata: {
            ...metadata,
            conversation_id: conversationId,
            actor_id: actorId
        },
        timestamp: Date.now(),
        trace_id: `trace_${uuidv4()}`
    };
}
