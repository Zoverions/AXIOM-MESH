from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.network_launch_preflight import assess_launch, estimate_min_funding_eth


def test_estimate_min_funding_eth_positive() -> None:
    estimate = estimate_min_funding_eth(gas_price_gwei=2.0)
    assert estimate > 0


def test_assess_launch_local_mode_no_funding_required() -> None:
    result = assess_launch("local-mesh", "", "")
    assert result.funded_enough is True
    assert result.estimated_min_funding_eth == 0.0


def test_assess_launch_network_without_wallet_requests_setup() -> None:
    result = assess_launch("launch-network", "", "")
    assert result.funded_enough is False
    assert "NETWORK_WALLET_ADDRESS" in result.next_action
