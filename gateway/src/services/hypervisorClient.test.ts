import axios from 'axios';
import { sendToHypervisor } from './hypervisorClient';
import { IntentObject, IntentResponse } from '../types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('hypervisorClient', () => {
    const FIXED_TIMESTAMP = 1234567890;

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
            expect(mockedAxios.post).toHaveBeenCalledWith('http://localhost:8000/process', mockIntent, {
                headers: {
                    'Authorization': `Bearer ${process.env.HYPERVISOR_API_KEY || ''}`
                },
                timeout: 15000,
                proxy: false
            });
            expect(result).toEqual(mockResponseData);
        });

        it('should handle errors and return a fallback error response', async () => {
            const errorMessage = 'Network Error';
            mockedAxios.post.mockRejectedValueOnce(new Error(errorMessage));

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await sendToHypervisor(mockIntent);

            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
            expect(mockedAxios.post).toHaveBeenCalledWith('http://localhost:8000/process', mockIntent, {
                headers: {
                    'Authorization': `Bearer ${process.env.HYPERVISOR_API_KEY || ''}`
                },
                timeout: 15000,
                proxy: false
            });
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

            expect(axiosMock.post).toHaveBeenCalledWith('http://custom-hypervisor:9000/process', mockIntent, {
                headers: {
                    'Authorization': `Bearer ${process.env.HYPERVISOR_API_KEY || ''}`
                },
                timeout: 15000,
                proxy: false
            });

            // Restore original env
            if (originalEnv === undefined) {
                delete process.env.HYPERVISOR_URL;
            } else {
                process.env.HYPERVISOR_URL = originalEnv;
            }
        });
    });
});
