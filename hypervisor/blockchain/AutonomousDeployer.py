import os
import json
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
from langgraph.checkpoint.memory import MemorySaver  # already used in your agent loops
# from hypervisor.memory import PrivateVault  # will exist after Priority 2

class AutonomousDeployer:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL")))
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

        self.factory = self.w3.eth.contract(
            address=os.getenv("DEPLOYMENT_FACTORY_ADDRESS"),
            abi=json.loads(open("grid/contracts/abis/DeploymentFactory.json").read())  # generate with forge
        )
        self.governance = self.w3.eth.contract(...)  # point to DialecticArbitration
        self.checkpointer = MemorySaver()  # reuse your existing LangGraph checkpointing

    async def propose_and_deploy(self, bytecode: bytes, salt: bytes, contract_type: str, gas_budget: int):
        """Called from existing agent loop when intent = GOV_AUTO_DEPLOY_CONTRACT"""

        # 1. Propose via UCP + bicameral (reuses your existing /process flow)
        proposal_id = await self._submit_governance_proposal(bytecode, salt)

        # 2. Wait for DialecticArbitration approval (poll or event listener)
        if await self._wait_for_approval(proposal_id):
            # 3. Auto-fund from ComputeBond
            tx = self.factory.functions.deploy(bytecode, salt, contract_type, gas_budget).build_transaction({
                "from": self.w3.eth.default_account,
                "gas": gas_budget
            })
            signed = self.w3.eth.account.sign_transaction(tx, os.getenv("AGENT_PRIVATE_KEY"))
            tx_hash = self.w3.eth.send_raw_transaction(signed.rawTransaction)

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
            print(f"✅ Autonomously deployed {contract_type} at {receipt.contractAddress}")

            # 4. Log to WORM via existing Grid event sink
            await self._log_worm_event("deployment", receipt.contractAddress)

    async def _submit_governance_proposal(self, bytecode, salt):
        # Calls your existing Hypervisor intent system — zero new code needed
        return "proposal-id-placeholder"  # integrate with your UCP flow

# Register in your main agent loop (hypervisor/agents/main_loop.py or wherever you mount LangGraph)
# autonomous_deployer = AutonomousDeployer()
# node = ("deploy_node", autonomous_deployer.propose_and_deploy)