import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';

const router = Router();

class DistributionManager {
    private provider: ethers.JsonRpcProvider;
    private wallet: ethers.Wallet;
    private pool: ethers.Contract;
    private bridge: ethers.Contract;
    private readonly gasOracleMultiplierBps: bigint;
    private readonly gasOracleFloorGwei: bigint;
    private readonly gasOracleCeilingGwei: bigint;
    private readonly gasEscalationBps: bigint;
    private readonly txStuckTimeoutMs: number;
    private readonly txConfirmations: number;

    constructor() {
        this.provider = new ethers.JsonRpcProvider(process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545');
        if (!process.env.PRIVATE_KEY) {
            throw new Error('PRIVATE_KEY is required; distribution routes never use a default signing key');
        }
        this.wallet = new ethers.Wallet(
            process.env.PRIVATE_KEY,
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

        this.gasOracleMultiplierBps = BigInt(process.env.GAS_ORACLE_MULTIPLIER_BPS || '11500');
        this.gasOracleFloorGwei = BigInt(process.env.GAS_ORACLE_FLOOR_GWEI || '1');
        this.gasOracleCeilingGwei = BigInt(process.env.GAS_ORACLE_CEILING_GWEI || '250');
        this.gasEscalationBps = BigInt(process.env.GAS_ESCALATION_BPS || '12500');
        this.txStuckTimeoutMs = Number(process.env.TX_STUCK_TIMEOUT_MS || '45000');
        this.txConfirmations = Number(process.env.TX_CONFIRMATIONS || '1');
    }

    private gweiToWei(value: bigint): bigint {
        return value * BigInt(1_000_000_000);
    }

    private async buildGasPolicy(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; baseEstimateWei: bigint }> {
        const feeData = await this.provider.getFeeData();
        const networkEstimate = feeData.gasPrice || feeData.maxFeePerGas || this.gweiToWei(this.gasOracleFloorGwei);

        const boundedEstimate = networkEstimate < this.gweiToWei(this.gasOracleFloorGwei)
            ? this.gweiToWei(this.gasOracleFloorGwei)
            : networkEstimate > this.gweiToWei(this.gasOracleCeilingGwei)
                ? this.gweiToWei(this.gasOracleCeilingGwei)
                : networkEstimate;

        const maxFeePerGas = (boundedEstimate * this.gasOracleMultiplierBps) / BigInt(10_000);
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || (maxFeePerGas / BigInt(10));

        return { maxFeePerGas, maxPriorityFeePerGas, baseEstimateWei: boundedEstimate };
    }

    private async waitForReceiptWithRecovery(txResponse: ethers.TransactionResponse): Promise<ethers.TransactionReceipt> {
        const start = Date.now();
        const initialNonce = txResponse.nonce;
        const gasPolicy = await this.buildGasPolicy();

        while (Date.now() - start < this.txStuckTimeoutMs) {
            const receipt = await this.provider.getTransactionReceipt(txResponse.hash);
            if (receipt && (await receipt.confirmations()) >= this.txConfirmations) {
                return receipt;
            }
            await new Promise((resolve) => setTimeout(resolve, 2500));
        }

        const pendingTx = await this.provider.getTransaction(txResponse.hash);
        if (!pendingTx) {
            throw new Error(`Transaction ${txResponse.hash} not found for recovery`);
        }

        const replacementMaxFee = ((pendingTx.maxFeePerGas || gasPolicy.maxFeePerGas) * this.gasEscalationBps) / BigInt(10_000);
        const replacementPriority = ((pendingTx.maxPriorityFeePerGas || gasPolicy.maxPriorityFeePerGas) * this.gasEscalationBps) / BigInt(10_000);

        const replacementTx = await this.wallet.sendTransaction({
            to: pendingTx.to,
            data: pendingTx.data,
            value: pendingTx.value,
            nonce: initialNonce,
            gasLimit: pendingTx.gasLimit,
            maxFeePerGas: replacementMaxFee,
            maxPriorityFeePerGas: replacementPriority
        });

        const replacementReceipt = await replacementTx.wait(this.txConfirmations);
        if (!replacementReceipt) {
            throw new Error(`Replacement transaction ${replacementTx.hash} did not confirm`);
        }
        return replacementReceipt;
    }

    async deposit(from: string, amount: bigint, source: string): Promise<void> {
        const gasPolicy = await this.buildGasPolicy();
        const tx = await this.pool.deposit(from, amount, source, {
            maxFeePerGas: gasPolicy.maxFeePerGas,
            maxPriorityFeePerGas: gasPolicy.maxPriorityFeePerGas
        });
        await this.waitForReceiptWithRecovery(tx);
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
        const gasPolicy = await this.buildGasPolicy();
        const tx = await this.bridge.batchBridgePayroll(
            payload.amounts,
            payload.dstEids,
            payload.optionsList,
            payload.zkProofs,
            payload.salts,
            {
                value: 0,
                maxFeePerGas: gasPolicy.maxFeePerGas,
                maxPriorityFeePerGas: gasPolicy.maxPriorityFeePerGas
            }
        );
        await this.waitForReceiptWithRecovery(tx);
    }

    async gasPolicyQuote(): Promise<{ baseEstimateWei: string; maxFeePerGasWei: string; maxPriorityFeePerGasWei: string }> {
        const gasPolicy = await this.buildGasPolicy();
        return {
            baseEstimateWei: gasPolicy.baseEstimateWei.toString(),
            maxFeePerGasWei: gasPolicy.maxFeePerGas.toString(),
            maxPriorityFeePerGasWei: gasPolicy.maxPriorityFeePerGas.toString()
        };
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

router.get('/gas-policy', async (_req: Request, res: Response) => {
    try {
        const quote = await manager.gasPolicyQuote();
        return res.json(quote);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

export default router;
