import express, { Request, Response } from 'express';
import request from 'supertest';
import { ethers } from 'ethers';

import axios from 'axios';

// Jest configuration issues with uuid/ESM - mock uuid before import
jest.mock('uuid', () => ({ v4: () => '123e4567-e89b-12d3-a456-426614174000' }));

// Mock axios for zkml infer call
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Must mock auth before importing router
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req: any, res: any, next: any) => next()
}));

jest.mock('../middleware/auth_utils', () => ({
    authMiddleware: (req: any, res: any, next: any) => next()
}));

// Mock child_process for IPFS
jest.mock('child_process', () => {
    const EventEmitter = require('events');
    return {
        exec: jest.fn((cmd, cb) => {
            if (cb) cb(null, { stdout: '', stderr: '' });
        }),
        spawn: jest.fn().mockImplementation((cmd, args) => {
            const child: any = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stdin = {
                write: jest.fn(),
                end: jest.fn(() => {
                    if (cmd === 'ipfs') {
                        // simulate IPFS fail
                        child.emit('error', new Error('IPFS upload failed'));
                    }
                })
            };
            return child;
        })
    };
});

// Mock ethers for contract interaction
jest.mock('ethers', () => {
    const originalEthers = jest.requireActual('ethers');
    return {
        ...originalEthers,
        JsonRpcProvider: jest.fn().mockImplementation(() => ({})),
        Wallet: jest.fn().mockImplementation(() => ({})),
        Contract: jest.fn().mockImplementation(() => ({
            verifyID: jest.fn().mockResolvedValue({
                wait: jest.fn().mockResolvedValue({ hash: '0xtesttxhash' })
            })
        }))
    };
});

import restRouter from './rest';

const app = express();
app.use(express.json());
app.use('/', restRouter);

// M7.1 Lock down Gateway signing/mint route defaults: remove embedded dev private key and localhost contract address fallbacks in gateway/src/routes/rest.ts, require environment-backed secrets + explicit startup validation, and add regression tests for fail-closed behavior.
describe('REST NFT routes (M7.1 Fail-Closed Security Tests)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.LOCAL_RPC_URL = 'http://127.0.0.1:8545';
        process.env.PRIVATE_KEY = '0xabc123';
        process.env.CITIZENSHIP_NFT_ADDRESS = '0x1111111111111111111111111111111111111111';
        process.env.DUAL_LEDGER_ADDRESS = '0x2222222222222222222222222222222222222222';
        mockedAxios.post.mockResolvedValue({
            data: {
                proof: { pi_a: ["1"], pi_b: [["2"]], pi_c: ["3"], protocol: "groth16" }
            }
        });
    });

    // M7.1 regression test for fail-closed behavior on missing targets
    test('POST /api/v1/nft/mint fails gracefully when targetDataSet missing', async () => {
        const payload = {
            type: 'citizenship',
            zkProofHash: '0x123',
            a: [1, 2], b: [[1, 2], [3, 4]], c: [1, 2]
        };
        const response = await request(app)
            .post('/api/v1/nft/mint')
            .send(payload);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('targetDataSet is required for actual upload');
    });

    // M7.1 regression test for fail-closed behavior on unreachable IPFS
    test('POST /api/v1/nft/mint handles IPFS fallback securely (503)', async () => {
        const payload = {
            type: 'citizenship',
            targetDataSet: 'some secure data',
            zkProofHash: '0x123',
            a: [1, 2], b: [[1, 2], [3, 4]], c: [1, 2]
        };
        const response = await request(app)
            .post('/api/v1/nft/mint')
            .send(payload);

        expect(response.status).toBe(503);
        expect(response.body.error).toBe('IPFS daemon unreachable, cannot pin data');
    });

    // M7.1 Lock down Gateway signing/mint route defaults: regression test for fail-closed behavior
    // Require environment-backed secrets + explicit startup validation
    test('POST /api/v1/nft/mint fails closed when required env (PRIVATE_KEY) is missing', async () => {
        // Remove the embedded dev private key to simulate missing env secret
        delete process.env.PRIVATE_KEY;
        const response = await request(app)
            .post('/api/v1/nft/mint')
            .send({
                type: 'citizenship',
                targetDataSet: 'some secure data',
            });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to mint NFT');
        // Explicit startup validation should fail
        expect(response.body.details).toContain('Missing required environment variables');
    });

    // M7.1 Lock down Gateway signing/mint route defaults: additional explicit test for other keys
    test('POST /api/v1/nft/mint fails closed when required env (LOCAL_RPC_URL) is missing', async () => {
        // Remove the localhost contract address fallback to simulate missing env secret
        delete process.env.LOCAL_RPC_URL;
        const response = await request(app)
            .post('/api/v1/nft/mint')
            .send({
                type: 'citizenship',
                targetDataSet: 'some secure data',
            });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to mint NFT');
        // Explicit startup validation should fail
        expect(response.body.details).toContain('Missing required environment variables');
    });
});
