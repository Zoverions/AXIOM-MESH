import express, { Request, Response } from 'express';
import request from 'supertest';
import { ethers } from 'ethers';

// Jest configuration issues with uuid/ESM - mock uuid before import
jest.mock('uuid', () => ({ v4: () => '123e4567-e89b-12d3-a456-426614174000' }));

// Must mock auth before importing router
jest.mock('../middleware/auth_utils', () => ({
    authMiddleware: (req: Request, res: Response, next: Function) => next()
}));

// Mock child_process for IPFS
jest.mock('child_process', () => {
    const EventEmitter = require('events');
    return {
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
app.use('/api/v1', restRouter);

describe('REST NFT routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('POST /api/v1/nft/mint fails gracefully when targetDataSet missing', async () => {
        const response = await request(app)
            .post('/api/v1/nft/mint')
            .send({
                type: 'citizenship',
                zkProofHash: '0x123',
                a: [1, 2], b: [[1, 2], [3, 4]], c: [1, 2]
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('targetDataSet is required for actual upload');
    });

    test('POST /api/v1/nft/mint handles IPFS fallback securely (503)', async () => {
        const response = await request(app)
            .post('/api/v1/nft/mint')
            .send({
                type: 'citizenship',
                targetDataSet: 'some secure data',
                zkProofHash: '0x123',
                a: [1, 2], b: [[1, 2], [3, 4]], c: [1, 2]
            });

        expect(response.status).toBe(503);
        expect(response.body.error).toBe('IPFS daemon unreachable, cannot pin data');
    });
});
