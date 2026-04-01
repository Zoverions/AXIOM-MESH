import os
import pytest
from unittest.mock import patch

from hypervisor.liquidity.AutomatedV3LiquidityManager import AutomatedV3LiquidityManager

def test_automated_v3_liquidity_manager_init_default():
    with patch.dict(os.environ, {}, clear=True):
        manager = AutomatedV3LiquidityManager()
        assert manager.manager is None
        assert manager.w3.provider.endpoint_uri == "http://127.0.0.1:8545"

def test_automated_v3_liquidity_manager_init_with_env():
    # Use a lowercase valid address to test checksumming
    test_address = "0x314159265dd8dbb310642f98f50c066173c1259b"
    expected_checksum = "0x314159265dD8dbb310642f98f50C066173C1259b"

    env_vars = {
        "RPC_URL": "http://127.0.0.1:9999",
        "AUTOMATED_V3_MANAGER": test_address
    }
    with patch.dict(os.environ, env_vars, clear=True):
        manager = AutomatedV3LiquidityManager()
        assert manager.w3.provider.endpoint_uri == "http://127.0.0.1:9999"
        assert manager.manager is not None
        assert manager.manager.address == expected_checksum
