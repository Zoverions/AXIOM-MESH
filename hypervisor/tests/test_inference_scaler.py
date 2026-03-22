import os
import sys
import pytest
from unittest.mock import AsyncMock, patch

# Add project root to sys.path to resolve imports from hypervisor.src
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from hypervisor.src.orchestrator.inference_scaler import InferenceScaler

@pytest.fixture
def mock_grid():
    grid = AsyncMock()
    grid.submit_task = AsyncMock()
    return grid

@pytest.fixture
def budget_from_treasury():
    return 1000

@pytest.mark.asyncio
async def test_scale_high_pressure(mock_grid, budget_from_treasury):
    scaler = InferenceScaler(grid=mock_grid, budget_from_treasury=budget_from_treasury)

    with patch('os.getloadavg', return_value=[8.5, 8.0, 7.5]), patch('os.cpu_count', return_value=8):
        # Local pressure will be min(1.0, 8.5 / 8) * 100 = 100
        await scaler.scale()

        mock_grid.submit_task.assert_called_once_with("rent_inference", budget_from_treasury)

@pytest.mark.asyncio
async def test_scale_low_pressure(mock_grid, budget_from_treasury):
    scaler = InferenceScaler(grid=mock_grid, budget_from_treasury=budget_from_treasury)

    with patch('os.getloadavg', return_value=[4.0, 4.0, 4.0]), patch('os.cpu_count', return_value=8):
        # Local pressure will be min(1.0, 4.0 / 8) * 100 = 50
        await scaler.scale()

        mock_grid.submit_task.assert_not_called()

@pytest.mark.asyncio
async def test_scale_oserror_fallback(mock_grid, budget_from_treasury):
    scaler = InferenceScaler(grid=mock_grid, budget_from_treasury=budget_from_treasury)

    with patch('os.getloadavg', side_effect=OSError("Load average not available")):
        # local_pressure falls back to 85, > 80, so it should call submit_task
        await scaler.scale()

        mock_grid.submit_task.assert_called_once_with("rent_inference", budget_from_treasury)

@pytest.mark.asyncio
async def test_scale_cpu_count_none(mock_grid, budget_from_treasury):
    scaler = InferenceScaler(grid=mock_grid, budget_from_treasury=budget_from_treasury)

    with patch('os.getloadavg', return_value=[0.9, 0.9, 0.9]), patch('os.cpu_count', return_value=None):
        # cpu_count falls back to 1. local_pressure = min(1.0, 0.9 / 1) * 100 = 90
        await scaler.scale()

        mock_grid.submit_task.assert_called_once_with("rent_inference", budget_from_treasury)
