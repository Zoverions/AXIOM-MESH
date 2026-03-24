import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.pricing.gpp import GlobalPricingProtocol

def test_gpp_price_calculation():
    gpp = GlobalPricingProtocol()
    result = gpp.calculate_price(100, 50)

    assert result["price"] == (100 * 0.05) + (50 * 0.01)
    assert result["currency"] == "AXM"
    assert "proof" in result
    assert result["verified"] is True
