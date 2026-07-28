import os
from unittest.mock import patch
from hypervisor.liquidity.AutonomousLiquidityManager import AutonomousLiquidityManager

def test_init_no_manager_address():
    with patch.dict(os.environ, {}, clear=True):
        manager = AutonomousLiquidityManager()
        assert manager.manager is None
        assert manager.w3 is not None

def test_init_with_valid_manager_address():
    valid_address = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
    with patch.dict(os.environ, {"NETWORK_LIQUIDITY_MANAGER": valid_address}, clear=True):
        manager = AutonomousLiquidityManager()
        assert manager.manager is not None
        assert manager.manager.address == valid_address
        assert manager.w3 is not None

def test_init_with_lowercase_valid_manager_address():
    lowercase_address = "0x742d35cc6634c0532925a3b844bc454e4438f44e"
    checksum_address = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
    with patch.dict(os.environ, {"NETWORK_LIQUIDITY_MANAGER": lowercase_address}, clear=True):
        manager = AutonomousLiquidityManager()
        assert manager.manager is not None
        assert manager.manager.address == checksum_address
        assert manager.w3 is not None
