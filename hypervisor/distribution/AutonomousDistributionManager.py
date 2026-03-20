# hypervisor/distribution/AutonomousDistributionManager.py
from web3 import Web3
import os

class AutonomousDistributionManager:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL")))
        self.pool = self.w3.eth.contract(address=os.getenv("UNIVERSAL_DISTRIBUTION_POOL_ADDRESS"), abi=[])  # load ABI after deploy

    async def process_org_payroll(self, org_address: str, total_payroll: int, employee_list: list):
        """Business/Gov routes payroll → auto-split"""
        tx = self.pool.functions.deposit(
            org_address, total_payroll, "org-payroll"
        ).build_transaction({"from": org_address})
        # sign & send via org wallet (or UCP-gated)

        for employee, amount in employee_list:
            await self._zk_distribute(employee, amount)

    async def _zk_distribute(self, recipient: str, amount: int):
        zk_hash = Web3.keccak(text=f"payroll-{recipient}-{amount}")
        tx = self.pool.functions.distribute(recipient, amount, zk_hash).build_transaction({})
        print(f"✅ Distributed {amount} to {recipient} via zk-proof")

    async def direct_donation(self, donor: str, amount: int):
        """Anyone can donate directly"""
        tx = self.pool.functions.deposit(donor, amount, "direct-donation").build_transaction({"value": amount})
        # broadcast
        print(f"✅ Direct donation {amount} received — {self.pool.functions.networkSharePercentage().call()}% auto to network infrastructure")

    async def process_robot_payroll(self, robot_id: int):
        # Called automatically from LangGraph when resources allocated
        robot_contract = self.w3.eth.contract(address=os.getenv("ROBOT_WORKFORCE_ADDRESS"), abi=[])
        await robot_contract.functions.processRobotPayroll(robot_id).transact()