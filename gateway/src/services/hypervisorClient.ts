import axios from 'axios';
import { IntentObject, IntentResponse } from '../types';

const HYPERVISOR_URL = process.env.HYPERVISOR_URL || 'http://localhost:8000';

export async function sendToHypervisor(intent: IntentObject): Promise<IntentResponse> {
    try {
        const apiKey = process.env.HYPERVISOR_API_KEY || '';
        const response = await axios.post(`${HYPERVISOR_URL}/process`, intent, {
            headers: {
                Authorization: `Bearer ${apiKey}`
            }
        });
        return response.data;
    } catch (error: any) {
        console.error('Error sending to Hypervisor:', error.message);
        return {
            id: 'err-' + Date.now(),
            intent_id: intent.id,
            response: `Hypervisor error: ${error.message}`,
            status: 'error'
        };
    }
}
