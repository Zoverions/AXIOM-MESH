import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const payrollAbi = [
    'function employees(address) view returns (uint256 salaryPerInterval, uint256 lastClaimTime, bool isActive)',
    'function PAYROLL_INTERVAL() view returns (uint256)',
    'function addEmployee(address _employee, uint256 _salaryPerInterval) external',
    'function claimSalary() external',
    'event SalaryClaimed(address indexed employee, uint256 amount)'
];

function getPayrollConfig() {
    const rpcUrl = process.env.PAYROLL_RPC_URL || process.env.LOCAL_RPC_URL;
    const contractAddress = process.env.STABLECOIN_PAYROLL_ADDRESS;
    if (!rpcUrl || !contractAddress) {
        throw new Error('PAYROLL_RPC_URL/LOCAL_RPC_URL and STABLECOIN_PAYROLL_ADDRESS must be configured');
    }

    return { rpcUrl, contractAddress };
}

function getProviderContract() {
    const { rpcUrl, contractAddress } = getPayrollConfig();
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(contractAddress, payrollAbi, provider);
    return { provider, contract };
}

router.get('/pending/:employeeAddress', authMiddleware, async (req: Request, res: Response) => {
    try {
        const employeeAddress = req.params.employeeAddress;
        if (!ethers.isAddress(employeeAddress)) {
            res.status(400).json({ error: 'Invalid employee address' });
            return;
        }

        const { provider, contract } = getProviderContract();
        const [employee, payrollInterval, latestBlock] = await Promise.all([
            contract.employees(employeeAddress),
            contract.PAYROLL_INTERVAL(),
            provider.getBlock('latest')
        ]);

        const salaryPerInterval = BigInt(employee.salaryPerInterval.toString());
        const lastClaimTime = BigInt(employee.lastClaimTime.toString());
        const isActive = Boolean(employee.isActive);
        const intervalSeconds = BigInt(payrollInterval.toString());
        const now = BigInt(latestBlock?.timestamp || Math.floor(Date.now() / 1000));

        const elapsed = now > lastClaimTime ? now - lastClaimTime : 0n;
        const pending = intervalSeconds > 0n ? (salaryPerInterval * elapsed) / intervalSeconds : 0n;

        res.json({
            employee: employeeAddress,
            is_active: isActive,
            salary_per_interval: salaryPerInterval.toString(),
            payroll_interval_seconds: intervalSeconds.toString(),
            pending_amount: pending.toString(),
            last_claim_time: lastClaimTime.toString(),
            as_of_block_timestamp: now.toString()
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to query pending payroll amount', details: error?.message });
    }
});

router.get('/claims/:employeeAddress', authMiddleware, async (req: Request, res: Response) => {
    try {
        const employeeAddress = req.params.employeeAddress;
        if (!ethers.isAddress(employeeAddress)) {
            res.status(400).json({ error: 'Invalid employee address' });
            return;
        }

        const { contract } = getProviderContract();
        const filter = contract.filters.SalaryClaimed(employeeAddress);
        const events = await contract.queryFilter(filter, -20000);

        const claims = events.map((event: any) => ({
            tx_hash: event.transactionHash,
            block_number: event.blockNumber,
            amount: event.args?.amount?.toString?.() || '0',
            employee: event.args?.employee || employeeAddress
        }));

        res.json({ employee: employeeAddress, claims });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to query payroll claim history', details: error?.message });
    }
});

router.post('/employees', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { employeeAddress, salaryPerInterval } = req.body || {};
        if (!ethers.isAddress(employeeAddress)) {
            res.status(400).json({ error: 'Invalid employee address' });
            return;
        }
        if (salaryPerInterval === undefined || salaryPerInterval === null || Number(salaryPerInterval) <= 0) {
            res.status(400).json({ error: 'salaryPerInterval must be a positive number/string' });
            return;
        }

        const { rpcUrl, contractAddress } = getPayrollConfig();
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
            res.status(500).json({ error: 'PRIVATE_KEY is required for payroll admin mutations' });
            return;
        }

        const wallet = new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(rpcUrl));
        const contract = new ethers.Contract(contractAddress, payrollAbi, wallet);
        const tx = await contract.addEmployee(employeeAddress, salaryPerInterval.toString());
        const receipt = await tx.wait();

        res.json({
            status: 'success',
            tx_hash: receipt?.hash || tx.hash,
            employee: employeeAddress,
            salary_per_interval: salaryPerInterval.toString()
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to add employee to payroll registry', details: error?.message });
    }
});

router.post('/claims', authMiddleware, async (req: Request, res: Response) => {
    try {
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
            res.status(500).json({ error: 'PRIVATE_KEY is required to submit payroll claim transactions' });
            return;
        }

        const { rpcUrl, contractAddress } = getPayrollConfig();
        const wallet = new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(rpcUrl));
        const contract = new ethers.Contract(contractAddress, payrollAbi, wallet);
        const tx = await contract.claimSalary();
        const receipt = await tx.wait();

        res.json({
            status: 'success',
            tx_hash: receipt?.hash || tx.hash,
            claimer: wallet.address
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to submit payroll claim', details: error?.message });
    }
});

export default router;
