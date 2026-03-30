import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';

const router = Router();

class DistributionManager {
    private provider: ethers.JsonRpcProvider;
    private wallet: ethers.Wallet;
    private pool: ethers.Contract;
    private bridge: ethers.Contract;

    constructor() {
        this.provider = new ethers.JsonRpcProvider(process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545');
        this.wallet = new ethers.Wallet(
            process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
            this.provider
        );

        const poolAddress = process.env.UNIVERSAL_DISTRIBUTION_POOL_ADDRESS || '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';
        const bridgeAddress = process.env.CROSS_CHAIN_BRIDGE_ADDRESS || ethers.ZeroAddress;

        this.pool = new ethers.Contract(
            poolAddress,
            [
                'function deposit(address from, uint256 amount, string calldata source) external payable',
                'function getAuditTrailSummary(address entity) external view returns (uint256 totalIn, uint256 totalOut, uint256 networkContributed)'
            ],
            this.wallet
        );

        this.bridge = new ethers.Contract(
            bridgeAddress,
            [
                'function batchBridgePayroll(uint256[] calldata amounts, uint32[] calldata dstEids, bytes[] calldata optionsList, bytes32[] calldata zkProofs, bytes32[] calldata salts) external payable'
            ],
            this.wallet
        );
    }

    async deposit(from: string, amount: bigint, source: string): Promise<void> {
        const tx = await this.pool.deposit(from, amount, source);
        await tx.wait();
    }

    async batchDeposit(from: string, amounts: bigint[], source: string): Promise<void> {
        for (const amount of amounts) {
            await this.deposit(from, amount, source);
        }
    }

    async batchBridgePayroll(payload: {
        amounts: bigint[];
        dstEids: number[];
        optionsList: string[];
        zkProofs: string[];
        salts: string[];
    }): Promise<void> {
        const tx = await this.bridge.batchBridgePayroll(
            payload.amounts,
            payload.dstEids,
            payload.optionsList,
            payload.zkProofs,
            payload.salts,
            { value: 0 }
        );
        await tx.wait();
    }

    async getAuditTrail(entity: string): Promise<{ totalIn: bigint; totalOut: bigint; networkContributed: bigint }> {
        return await this.pool.getAuditTrailSummary(entity);
    }
}

const manager = new DistributionManager();

router.post('/deposit', async (req: Request, res: Response) => {
    try {
        const { from, amount, source = 'org-payroll' } = req.body || {};
        if (!from || !amount) {
            return res.status(400).json({ error: 'from and amount are required' });
        }
        await manager.deposit(from, BigInt(amount), source);
        return res.json({ status: 'deposited', amount: amount.toString(), source });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

router.post('/deposit/batch', async (req: Request, res: Response) => {
    try {
        const { from, amounts, source = 'org-payroll-batch' } = req.body || {};
        if (!from || !Array.isArray(amounts) || amounts.length === 0) {
            return res.status(400).json({ error: 'from and non-empty amounts are required' });
        }
        await manager.batchDeposit(from, amounts.map((v: string | number) => BigInt(v)), source);
        return res.json({ status: 'batch-deposited', count: amounts.length, source });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

router.post('/bridge/batch', async (req: Request, res: Response) => {
    try {
        const { amounts, dstEids, optionsList, zkProofs, salts } = req.body || {};
        const batchLengths = [amounts, dstEids, optionsList, zkProofs, salts].map((entry) => Array.isArray(entry) ? entry.length : 0);
        if (batchLengths.some((len) => len === 0) || new Set(batchLengths).size !== 1) {
            return res.status(400).json({ error: 'amounts, dstEids, optionsList, zkProofs, and salts must be non-empty arrays of equal length' });
        }

        await manager.batchBridgePayroll({
            amounts: amounts.map((v: string | number) => BigInt(v)),
            dstEids: dstEids.map((v: string | number) => Number(v)),
            optionsList,
            zkProofs,
            salts
        });

        return res.json({ status: 'batch-bridged', count: amounts.length });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

router.get('/audit/:entity', async (req: Request, res: Response) => {
    try {
        const entityParam = req.params.entity;
        const entity = Array.isArray(entityParam) ? entityParam[0] : entityParam;
        if (!entity) {
            return res.status(400).json({ error: 'entity is required' });
        }
        const trail = await manager.getAuditTrail(entity);
        return res.json({
            totalIn: trail.totalIn.toString(),
            totalOut: trail.totalOut.toString(),
            networkContributed: trail.networkContributed.toString()
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

export default router;
