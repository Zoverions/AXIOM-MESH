import { IntentObject } from '../types';
import { v4 as uuidv4 } from 'uuid'; // need to install uuid

export function normalizeInput(session_id: string, channel: string, content: string, metadata: Record<string, any> = {}): IntentObject {
    return {
        id: uuidv4(),
        channel,
        content,
        metadata,
        timestamp: Date.now(),
        trace_id: uuidv4()
        session_id: session_id || 'default',
        channel: channel,
        content: content,
        metadata: metadata,
        timestamp: Date.now()
    };
}
