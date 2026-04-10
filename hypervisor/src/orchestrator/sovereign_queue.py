import logging
import asyncio
from typing import Dict, Optional
from web3 import Web3
from web3.middleware import geth_poa_middleware
from eth_account import Account
import os
import json

logger = logging.getLogger("Zoverions-SovereignQueue")

class SovereignExecutionQueue:
    """
    Replaces the centralized MASTER-TODO.md file.
    The Hypervisor fetches its operational directives directly from the
    decentralized Epistemic Senate via the Genesis Decay framework.
    """
    def __init__(self, rpc_endpoint: str, contract_address: str):
        self.w3 = Web3(Web3.HTTPProvider(rpc_endpoint))
        self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        self.contract_address = self.w3.to_checksum_address(contract_address)

        # Load the node key or founder key for execution reporting (mocked private key for now, real app loads from env)
        private_key = os.getenv("EXECUTOR_PRIVATE_KEY", "0x0000000000000000000000000000000000000000000000000000000000000001")
        if private_key != "0x0000000000000000000000000000000000000000000000000000000000000001":
            self.account = Account.from_key(private_key)
        else:
            self.account = None

        # Minimal ABI required for getHighestRankedProposal and markExecuted
        self.abi = [
            {
                "inputs": [],
                "name": "getHighestRankedProposal",
                "outputs": [
                    {
                        "components": [
                            {"internalType": "string", "name": "id", "type": "string"},
                            {"internalType": "string", "name": "title", "type": "string"},
                            {"internalType": "string", "name": "content", "type": "string"},
                            {"internalType": "uint256", "name": "rankWeight", "type": "uint256"},
                            {"internalType": "bool", "name": "executed", "type": "bool"}
                        ],
                        "internalType": "struct GenesisDecayGovernance.ProposalResponse",
                        "name": "",
                        "type": "tuple"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [{"internalType": "string", "name": "id", "type": "string"}],
                "name": "markExecuted",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            }
        ]
        self.contract = self.w3.eth.contract(address=self.contract_address, abi=self.abi)

    async def fetch_next_directive(self) -> Optional[Dict]:
        """
        Polls the Layer 1 Stigmergic Queue for the highest-weighted task.
        Weight is determined by network consensus (including Founder Decay).
        """
        logger.info("[🌐] Syncing with Epistemic Senate for Sovereign Execution Queue...")

        try:
            # We call the real contract
            top_proposal = await asyncio.to_thread(self.contract.functions.getHighestRankedProposal().call)

            if top_proposal and len(top_proposal) >= 5 and top_proposal[0]:
                proposal_data = {
                    "id": top_proposal[0],
                    "title": top_proposal[1],
                    "proposal_content": top_proposal[2],
                    "rankWeight": top_proposal[3],
                    "executed": top_proposal[4]
                }

                if not proposal_data["executed"]:
                    logger.info(f"[⚡] New Sovereign Directive Acquired: {proposal_data['title']}")
                    return proposal_data

            logger.debug("[💤] Queue is empty or pending simulation veto.")
            return None

        except Exception as e:
            logger.error(f"[🛑] Failed to sync with Sovereign Queue: {e}")
            return None

    async def report_execution_state(self, proposal_id: str, success: bool, artifact_hash: str):
        """
        Logs the agent's completion of the task back to the ledger, initiating PoER settlement.
        """
        logger.info(f"[📝] Committing execution artifact {artifact_hash} for proposal {proposal_id}...")
        try:
            if not self.account:
                logger.info(f"[⚠️] No EXECUTOR_PRIVATE_KEY set. Simulating markExecuted for {proposal_id}")
                return

            def _send_tx():
                nonce = self.w3.eth.get_transaction_count(self.account.address)
                tx = self.contract.functions.markExecuted(proposal_id).build_transaction({
                    'chainId': self.w3.eth.chain_id,
                    'gas': 200000,
                    'gasPrice': self.w3.eth.gas_price,
                    'nonce': nonce,
                })
                signed_tx = self.w3.eth.account.sign_transaction(tx, private_key=self.account.key)
                tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)
                return self.w3.eth.wait_for_transaction_receipt(tx_hash)

            receipt = await asyncio.to_thread(_send_tx)
            logger.info(f"[✅] Task {proposal_id} marked executed on-chain. TX: {receipt.transactionHash.hex()}")

        except Exception as e:
             logger.error(f"[🛑] Failed to report execution state: {e}")
