import pytest
from src.evolution.hardware import HardwareScanner
from src.evolution.resource_balancer import ResourceBalancer
from src.engine.mcp_client import MCPClient
from src.memory.crdt_sync import CRDTState
import time
import copy

# Mock Hardware Scanner to test thresholds
class MockHardwareScanner(HardwareScanner):
    def __init__(self, footprint):
        self.mock_footprint = footprint

    def scan(self):
        return self.mock_footprint

def test_hardware_profile_tablet():
    footprint = {"cpu_cores": 2, "total_ram_gb": 4, "vram_mb": 0, "has_gpu": False}
    scanner = MockHardwareScanner(footprint)
    assert scanner.get_hardware_profile() == "tablet"

def test_hardware_profile_edge():
    footprint = {"cpu_cores": 4, "total_ram_gb": 8, "vram_mb": 4000, "has_gpu": True}
    scanner = MockHardwareScanner(footprint)
    assert scanner.get_hardware_profile() == "edge"

def test_hardware_profile_full_node():
    footprint = {"cpu_cores": 8, "total_ram_gb": 16, "vram_mb": 8000, "has_gpu": True}
    scanner = MockHardwareScanner(footprint)
    assert scanner.get_hardware_profile() == "full_node"

def test_resource_balancer_routing():
    # Test Full Node
    footprint_full = {"cpu_cores": 8, "total_ram_gb": 16, "vram_mb": 8000, "has_gpu": True}
    scanner_full = MockHardwareScanner(footprint_full)
    balancer_full = ResourceBalancer(hardware_scanner=scanner_full)
    assert balancer_full.route_task("standard", 50) == "local"
    assert balancer_full.route_task("standard", 95) == "peer"
    assert balancer_full.route_task("consensus", 50) == "grid"
    assert balancer_full.route_task("settlement", 50) == "l1"

    # Test Edge Node
    footprint_edge = {"cpu_cores": 4, "total_ram_gb": 8, "vram_mb": 4000, "has_gpu": True}
    scanner_edge = MockHardwareScanner(footprint_edge)
    balancer_edge = ResourceBalancer(hardware_scanner=scanner_edge)
    assert balancer_edge.route_task("standard", 50) == "local"
    assert balancer_edge.route_task("standard", 75) == "peer"
    assert balancer_edge.route_task("standard", 95) == "grid"

    # Test Tablet Node
    footprint_tablet = {"cpu_cores": 2, "total_ram_gb": 4, "vram_mb": 0, "has_gpu": False}
    scanner_tablet = MockHardwareScanner(footprint_tablet)
    balancer_tablet = ResourceBalancer(hardware_scanner=scanner_tablet)
    assert balancer_tablet.route_task("standard", 20) == "local"
    assert balancer_tablet.route_task("standard", 50) == "grid"

def test_mcp_compatibility_matrix():
    # S1_BASELINE node
    client = MCPClient(node_security_profile=MCPClient.S1_BASELINE)
    assert client.check_compatibility(MCPClient.S1_BASELINE) is True
    assert client.check_compatibility(MCPClient.S2_HARDENED) is True
    assert client.check_compatibility(MCPClient.S3_ZKML_FULL_NODE) is True
    assert client.check_compatibility(MCPClient.S0_LEGACY_LOCKED) is True

    # S2_HARDENED node
    client2 = MCPClient(node_security_profile=MCPClient.S2_HARDENED)
    assert client2.check_compatibility(MCPClient.S2_HARDENED) is True
    assert client2.check_compatibility(MCPClient.S3_ZKML_FULL_NODE) is True
    assert client2.check_compatibility(MCPClient.S1_BASELINE) is False
    assert client2.check_compatibility(MCPClient.S0_LEGACY_LOCKED) is False

def test_crdt_delta_sync():
    node1 = CRDTState(node_id="node1")
    node2 = CRDTState(node_id="node2")

    # Node 1 updates state
    node1.update("keyA", "value1")
    delta1 = node1.generate_delta()

    # Node 2 merges Node 1's delta
    assert node2.verify_and_merge(delta1) is True
    assert node2.get("keyA") == "value1"

    # Node 2 updates state (Last Write Wins)
    time.sleep(0.01) # ensure timestamp is greater
    node2.update("keyA", "value2")
    delta2 = node2.generate_delta()

    # Node 1 merges Node 2's delta
    assert node1.verify_and_merge(delta2) is True
    assert node1.get("keyA") == "value2"

    # Test Invalid Signature
    bad_delta = copy.deepcopy(delta2)
    bad_delta["signature"] = "00" * 32 # Invalid signature
    assert node1.verify_and_merge(bad_delta) is False

    # Test Tampered State Payload
    tampered_delta = copy.deepcopy(delta2)
    tampered_delta["state"]["keyA"]["value"] = "hacked"
    assert node1.verify_and_merge(tampered_delta) is False
