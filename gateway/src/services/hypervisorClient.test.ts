import axios from 'axios';
import { sendToHypervisor, getBackpressureLimit } from './hypervisorClient';
import { IntentObject, IntentResponse } from '../types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('hypervisorClient', () => {
    const FIXED_TIMESTAMP = 1234567890;

    describe('getBackpressureLimit', () => {
        const originalEnv = process.env.HYPERVISOR_BACKPRESSURE_LIMIT;

        afterEach(() => {
            if (originalEnv === undefined) {
                delete process.env.HYPERVISOR_BACKPRESSURE_LIMIT;
            } else {
                process.env.HYPERVISOR_BACKPRESSURE_LIMIT = originalEnv;
            }
        });

        it('should return default limit of 50 when env var is not set', () => {
            delete process.env.HYPERVISOR_BACKPRESSURE_LIMIT;
            expect(getBackpressureLimit()).toBe(50);
        });

        it('should return parsed integer from env var', () => {
            process.env.HYPERVISOR_BACKPRESSURE_LIMIT = '100';
            expect(getBackpressureLimit()).toBe(100);
        });

        it('should return NaN if env var is not a number', () => {
            process.env.HYPERVISOR_BACKPRESSURE_LIMIT = 'invalid';
            expect(getBackpressureLimit()).toBeNaN();
        });
    });

    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_TIMESTAMP);
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.HYPERVISOR_RETRIES = '1';
        process.env.MTLS_CA_CERT = 'mock-ca-cert';
        process.env.MTLS_CLIENT_CERT = 'mock-client-cert';
        process.env.MTLS_CLIENT_KEY = 'mock-client-key';
    });

    describe('sendToHypervisor', () => {
        const mockIntent: IntentObject = {
            id: 'intent-123',
            session_id: 'session-123',
            channel: 'test-channel',
            content: 'test content',
            metadata: {},
            timestamp: Date.now()
        };

        it('should successfully send intent and return response data', async () => {
            const mockResponseData: IntentResponse = {
                id: 'resp-123',
                intent_id: 'intent-123',
                response: 'Success response',
                status: 'success'
            };

            mockedAxios.post.mockResolvedValueOnce({ data: mockResponseData });

            const result = await sendToHypervisor(mockIntent);

            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://localhost:8000/process',
                mockIntent,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': `Bearer ${process.env.HYPERVISOR_API_KEY || ''}`,
                        'X-Axiom-Timestamp': expect.any(String),
                        'X-Axiom-Nonce': expect.any(String),
                        'X-Axiom-Signature': expect.any(String)
                    }),
                    timeout: 15000,
                    proxy: false
                })
            );
            expect(result).toEqual(mockResponseData);
        });

        it('should handle errors and return a fallback error response', async () => {
            const errorMessage = 'Network Error';
            mockedAxios.post.mockRejectedValueOnce(new Error(errorMessage));

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await sendToHypervisor(mockIntent);

            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://localhost:8000/process',
                mockIntent,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': `Bearer ${process.env.HYPERVISOR_API_KEY || ''}`,
                        'X-Axiom-Timestamp': expect.any(String),
                        'X-Axiom-Nonce': expect.any(String),
                        'X-Axiom-Signature': expect.any(String)
                    }),
                    timeout: 15000,
                    proxy: false
                })
            );
            expect(consoleSpy).toHaveBeenCalledWith('Error sending to Hypervisor:', errorMessage);

            expect(result).toEqual({
                id: `err-${FIXED_TIMESTAMP}`,
                intent_id: mockIntent.id,
                response: `Hypervisor error: ${errorMessage}`,
                status: 'error',
                trace_id: undefined,
                provenance: ['hypervisor_unavailable']
            });

            consoleSpy.mockRestore();
        });

        it('should use HYPERVISOR_URL from environment variable if defined', async () => {
            const originalEnv = process.env.HYPERVISOR_URL;
            process.env.HYPERVISOR_URL = 'http://custom-hypervisor:9000';

            // Re-import to pickup env changes is tricky due to module caching,
            // but the module evaluates process.env.HYPERVISOR_URL at load time.
            // Let's reset modules to force re-evaluation of the env var.
            jest.resetModules();

            // Re-mock axios for the new module evaluation
            const axiosMock = require('axios');
            axiosMock.post.mockResolvedValueOnce({ data: { status: 'success' } });

            const { sendToHypervisor: customSendToHypervisor } = require('./hypervisorClient');

            await customSendToHypervisor(mockIntent);

            expect(axiosMock.post).toHaveBeenCalledWith(
                'http://custom-hypervisor:9000/process',
                mockIntent,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': `Bearer ${process.env.HYPERVISOR_API_KEY || ''}`,
                        'X-Axiom-Timestamp': expect.any(String),
                        'X-Axiom-Nonce': expect.any(String),
                        'X-Axiom-Signature': expect.any(String)
                    }),
                    timeout: 15000,
                    proxy: false
                })
            );

            // Restore original env
            if (originalEnv === undefined) {
                delete process.env.HYPERVISOR_URL;
            } else {
                process.env.HYPERVISOR_URL = originalEnv;
            }
        });
    });
});
