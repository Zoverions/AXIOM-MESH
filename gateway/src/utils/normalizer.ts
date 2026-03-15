import { IntentObject } from '../types';
import { v4 as uuidv4 } from 'uuid'; // need to install uuid

export function normalizeInput(channel: string, content: string, metadata: Record<string, any> = {}): IntentObject {
    return {
        id: uuidv4(),
        channel,
        content,
        metadata,
        timestamp: Date.now(),
        trace_id: uuidv4()
    };
}
