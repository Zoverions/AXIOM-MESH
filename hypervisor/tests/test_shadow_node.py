import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from hypervisor.shadow.ShadowNode import ShadowNode
from hypervisor.shadow.AirGapConsent import AirGapConsent

@pytest.fixture
def mock_env_vars(monkeypatch):
    monkeypatch.setenv("RPC_URL", "http://localhost:8545")
    monkeypatch.setenv("DARK_COMPUTE_POOL_ADDRESS", "0x1234567890123456789012345678901234567890")

@pytest.mark.asyncio
async def test_shadow_node_init(mock_env_vars):
    with patch('hypervisor.shadow.ShadowNode.PrivateVault') as mock_vault, \
         patch('hypervisor.shadow.ShadowNode.AutoTrainingLoop') as mock_trainer, \
         patch('hypervisor.shadow.ShadowNode.Web3') as mock_web3:

        node = ShadowNode("did:example:123")

        assert node.bridge_enabled is False
        assert node.phantom_did is not None
        assert node.cipher is not None
        mock_vault.assert_called_once_with("did:example:123")
        mock_trainer.assert_called_once()
        mock_web3.assert_called_once()

@pytest.mark.asyncio
async def test_run_local_cycle(mock_env_vars):
    with patch('hypervisor.shadow.ShadowNode.PrivateVault') as mock_vault_cls, \
         patch('hypervisor.shadow.ShadowNode.AutoTrainingLoop') as mock_trainer_cls, \
         patch('hypervisor.shadow.ShadowNode.Web3'):

        mock_vault_instance = MagicMock()
        mock_vault_instance.store = AsyncMock()
        mock_vault_cls.return_value = mock_vault_instance

        mock_trainer_instance = MagicMock()
        mock_trainer_instance._run_training_pipeline = AsyncMock(return_value="/path/to/model")
        mock_trainer_cls.return_value = mock_trainer_instance

        node = ShadowNode("did:example:123")
        await node.run_local_cycle()

        mock_trainer_instance._run_training_pipeline.assert_called_once()
        mock_vault_instance.store.assert_called_once_with(
            "shadow_model",
            {"path": "/path/to/model", "phantom_did": node.phantom_did}
        )

@pytest.mark.asyncio
async def test_contribute_to_dark_pool_bridge_disabled(mock_env_vars):
    with patch('hypervisor.shadow.ShadowNode.PrivateVault'), \
         patch('hypervisor.shadow.ShadowNode.AutoTrainingLoop'), \
         patch('hypervisor.shadow.ShadowNode.Web3'), \
         patch('hypervisor.shadow.AirGapConsent.AirGapConsent.generate_qr_consent') as mock_qr:

        mock_qr.return_value = "shadow_consent_qr.png"
        node = ShadowNode("did:example:123")

        await node.contribute_to_dark_pool()

        mock_qr.assert_called_once_with(node)

@pytest.mark.asyncio
async def test_contribute_to_dark_pool_bridge_enabled(mock_env_vars):
    with patch('hypervisor.shadow.ShadowNode.PrivateVault'), \
         patch('hypervisor.shadow.ShadowNode.AutoTrainingLoop'), \
         patch('hypervisor.shadow.ShadowNode.Web3') as mock_web3_cls, \
         patch('hypervisor.shadow.AirGapConsent.AirGapConsent.generate_qr_consent') as mock_qr:

        # Setup mock Web3 instance and its methods
        mock_w3_instance = MagicMock()
        mock_web3_cls.return_value = mock_w3_instance

        # Mock keccak
        mock_web3_cls.keccak = MagicMock(side_effect=lambda text: f"hashed_{text}")

        # Mock contract and its methods
        mock_contract = MagicMock()
        mock_w3_instance.eth.contract.return_value = mock_contract

        # Mock transaction builder
        mock_tx_builder = MagicMock()
        mock_contract.functions.submitAnonymousContribution.return_value = mock_tx_builder
        mock_tx_builder.build_transaction.return_value = {"tx": "data"}

        # Mock default account
        mock_w3_instance.eth.default_account = "0xAccount"

        node = ShadowNode("did:example:123")
        node.bridge_enabled = True

        await node.contribute_to_dark_pool()

        mock_qr.assert_not_called()
        mock_w3_instance.eth.contract.assert_called_once()
        mock_contract.functions.submitAnonymousContribution.assert_called_once_with(
            f"hashed_{node.phantom_did}",
            420,
            "hashed_zk-proof-of-model-v1"
        )
        mock_tx_builder.build_transaction.assert_called_once_with({"from": "0xAccount"})
