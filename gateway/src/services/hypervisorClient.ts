import axios from 'axios';
import https from 'https';
import fs from 'fs';
import { IntentObject, IntentResponse } from '../types';
import { asyncRandomBytes, CryptoWorkerPool } from '../performance/EventLoopOptimizer';
import { SecretManager } from '../utils/secrets';

const HYPERVISOR_URL = process.env.HYPERVISOR_URL || 'http://localhost:8000';
const cryptoWorkerPool = new CryptoWorkerPool(2);
function getMaxRetries(): number {
    return Number(process.env.HYPERVISOR_RETRIES || 3);
}

function getBackpressureLimit(): number {
    return Number(process.env.HYPERVISOR_BACKPRESSURE_LIMIT || 50);
}

let inflightRequests = 0;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendToHypervisor(intent: IntentObject): Promise<IntentResponse> {
    if (inflightRequests >= getBackpressureLimit()) {
        return {
            id: 'err-' + Date.now(),
            intent_id: intent.id,
            response: 'Gateway backpressure active: Hypervisor queue saturated. Please retry shortly.',
            status: 'error',
            trace_id: intent.trace_id,
            provenance: ['gateway_backpressure']
        };
    }

    inflightRequests += 1;
    try {
        const apiKey = await SecretManager.getSecret('HYPERVISOR_API_KEY');
        const maxRetries = getMaxRetries();
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const timestamp = Date.now().toString();
                const nonceBuf = await asyncRandomBytes(16);
                const nonce = nonceBuf.toString('hex');
                const payloadStr = JSON.stringify(intent);
                const signaturePayload = `${timestamp}:${nonce}:${payloadStr}`;
                const signature = await cryptoWorkerPool.hmacSignature(apiKey, signaturePayload);

                const certsDir = process.env.CERTS_DIR || '../certs';
                let httpsAgent;
                try {
                    httpsAgent = new https.Agent({
                        cert: fs.readFileSync(`${certsDir}/gateway.crt`),
                        key: fs.readFileSync(`${certsDir}/gateway.key`),
                        ca: fs.readFileSync(`${certsDir}/ca.crt`),
                        rejectUnauthorized: true
                    });
                } catch (e) {
                    console.warn("mTLS certs not found, client skipping mTLS.");
                }

                const response = await axios.post(`${HYPERVISOR_URL}/process`, intent, {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'X-Axiom-Timestamp': timestamp,
                        'X-Axiom-Nonce': nonce,
                        'X-Axiom-Signature': signature
                    },
                    timeout: 15000,
                    proxy: false,
                    httpsAgent
                });
                return response.data;
            } catch (error: any) {
                const status = error?.response?.status;
                const retryable = !status || status >= 500 || status === 429;
                if (!retryable || attempt === maxRetries - 1) {
                    throw error;
                }
                await sleep(250 * Math.pow(2, attempt));
            }
        }

        throw new Error('Unexpected hypervisor client retry exit');
    } catch (error: any) {
        console.error('Error sending to Hypervisor:', error.message);
        return {
            id: 'err-' + Date.now(),
            intent_id: intent.id,
            response: `Hypervisor error: ${error.message}`,
            status: 'error',
            trace_id: intent.trace_id,
            provenance: ['hypervisor_unavailable']
        };
    } finally {
        inflightRequests = Math.max(0, inflightRequests - 1);
    }
}
