import sys
import pytest
from unittest.mock import MagicMock, patch, call

# We use a fixture to safely mock dependencies and import SystemMetrics locally
# This avoids global side effects and ensures tests are isolated.

@pytest.fixture(scope="module")
def system_metrics():
    # Store original sys.modules to restore it later
    original_modules = sys.modules.copy()

    # Mock missing dependencies only if they aren't already present
    if "langgraph" not in sys.modules:
        sys.modules["langgraph"] = MagicMock()
        sys.modules["langgraph.graph"] = MagicMock()
    if "ecdsa" not in sys.modules:
        sys.modules["ecdsa"] = MagicMock()

    try:
        # Import the class under test
        from src.graph.resource_balancer import SystemMetrics
        yield SystemMetrics
    finally:
        # Restore original sys.modules to prevent global side effects
        sys.modules.clear()
        sys.modules.update(original_modules)

# Constant for the default value returned on failure
DEFAULT_MEMORY_PRESSURE = 0.5

def test_get_memory_pressure_success(system_metrics):
    meminfo_content = """
MemTotal:       16354416 kB
MemFree:         1234567 kB
MemAvailable:    8177208 kB
Buffers:          123456 kB
"""
    # Create a mock Path object
    mock_path = MagicMock()
    mock_path.exists.return_value = True
    mock_path.read_text.return_value = meminfo_content

    # Patch the Path class inside the resource_balancer module
    # We use patch.object on the module itself to be more robust
    import src.graph.resource_balancer as rb
    with patch.object(rb, "Path", return_value=mock_path) as mock_path_class:
        pressure = system_metrics.get_memory_pressure()

        # Verify Path was called with the correct file
        mock_path_class.assert_called_with('/proc/meminfo')

        # 1 - (8177208 / 16354416) = 1 - 0.5 = 0.5
        assert pressure == pytest.approx(0.5)

def test_get_memory_pressure_no_file(system_metrics):
    mock_path = MagicMock()
    mock_path.exists.return_value = False

    import src.graph.resource_balancer as rb
    with patch.object(rb, "Path", return_value=mock_path) as mock_path_class:
        pressure = system_metrics.get_memory_pressure()
        mock_path_class.assert_called_with('/proc/meminfo')
        assert pressure == DEFAULT_MEMORY_PRESSURE

def test_get_memory_pressure_malformed_file(system_metrics):
    meminfo_content = "Invalid content"
    mock_path = MagicMock()
    mock_path.exists.return_value = True
    mock_path.read_text.return_value = meminfo_content

    import src.graph.resource_balancer as rb
    with patch.object(rb, "Path", return_value=mock_path) as mock_path_class:
        pressure = system_metrics.get_memory_pressure()
        mock_path_class.assert_called_with('/proc/meminfo')
        assert pressure == DEFAULT_MEMORY_PRESSURE

def test_get_memory_pressure_zero_total(system_metrics):
    # This might cause ZeroDivisionError, which should be caught by the try-except
    meminfo_content = """
MemTotal:              0 kB
MemAvailable:          0 kB
"""
    mock_path = MagicMock()
    mock_path.exists.return_value = True
    mock_path.read_text.return_value = meminfo_content

    import src.graph.resource_balancer as rb
    with patch.object(rb, "Path", return_value=mock_path) as mock_path_class:
        pressure = system_metrics.get_memory_pressure()
        mock_path_class.assert_called_with('/proc/meminfo')
        assert pressure == DEFAULT_MEMORY_PRESSURE

def test_get_memory_pressure_full(system_metrics):
    meminfo_content = """
MemTotal:       100 kB
MemAvailable:     0 kB
"""
    mock_path = MagicMock()
    mock_path.exists.return_value = True
    mock_path.read_text.return_value = meminfo_content

    import src.graph.resource_balancer as rb
    with patch.object(rb, "Path", return_value=mock_path) as mock_path_class:
        pressure = system_metrics.get_memory_pressure()
        mock_path_class.assert_called_with('/proc/meminfo')
        assert pressure == 1.0

def test_get_memory_pressure_empty(system_metrics):
    meminfo_content = """
MemTotal:       100 kB
MemAvailable:   100 kB
"""
    mock_path = MagicMock()
    mock_path.exists.return_value = True
    mock_path.read_text.return_value = meminfo_content

    import src.graph.resource_balancer as rb
    with patch.object(rb, "Path", return_value=mock_path) as mock_path_class:
        pressure = system_metrics.get_memory_pressure()
        mock_path_class.assert_called_with('/proc/meminfo')
        assert pressure == 0.0

def test_get_memory_pressure_more_available_than_total(system_metrics):
    # Should be clamped to 0.0
    meminfo_content = """
MemTotal:       100 kB
MemAvailable:   150 kB
"""
    mock_path = MagicMock()
    mock_path.exists.return_value = True
    mock_path.read_text.return_value = meminfo_content

    import src.graph.resource_balancer as rb
    with patch.object(rb, "Path", return_value=mock_path) as mock_path_class:
        pressure = system_metrics.get_memory_pressure()
        mock_path_class.assert_called_with('/proc/meminfo')
        assert pressure == 0.0
