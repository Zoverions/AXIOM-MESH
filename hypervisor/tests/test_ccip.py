import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.settlement.ccip import CCIPIntegration

def test_ccip_integration():
    ccip = CCIPIntegration()
    result = ccip.initiate_settlement("Ethereum", "Base", 10.5, "0xabc")

    assert result["status"] == "settlement_initiated"
    assert result["source"] == "Ethereum"
    assert result["destination"] == "Base"
    assert result["amount"] == 10.5
    assert result["recipient"] == "0xabc"
    assert "tx_hash" in result

def test_ccip_invalid_chain():
    ccip = CCIPIntegration()
    with pytest.raises(ValueError):
        ccip.initiate_settlement("Solana", "Ethereum", 5.0, "0xdef")
