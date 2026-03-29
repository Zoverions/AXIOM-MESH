import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import sys
import os

# Ensure the correct path is used to resolve module imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from hypervisor.agents.master_autonomy_graph import build_master_autonomy_graph

@patch("hypervisor.agents.master_autonomy_graph.AutonomousDeployer")
@patch("hypervisor.agents.master_autonomy_graph.AutonomousModelTrainer")
@patch("hypervisor.agents.master_autonomy_graph.AutonomousResourceManager")
@patch("hypervisor.agents.master_autonomy_graph.InheritanceExecutor")
@patch("hypervisor.agents.master_autonomy_graph.ShadowNode")
@patch("hypervisor.agents.master_autonomy_graph.AutonomousDistributionManager")
@patch("hypervisor.agents.master_autonomy_graph.AutonomousLiquidityManager")
@patch("hypervisor.agents.master_autonomy_graph.AutomatedV3LiquidityManager")
@patch("hypervisor.agents.master_autonomy_graph.OmnichainRelayer")
@pytest.mark.asyncio
async def test_build_master_autonomy_graph(
    mock_omnichain_relayer, mock_v3_liquidity, mock_liquidity, mock_dist_manager,
    mock_shadow_node, mock_inheritance, mock_resource_manager, mock_trainer, mock_deployer
):
    """
    Test the construction and execution of the master autonomy graph.
    Mocks external systems and ensures the nodes are connected correctly and flow executes.
    """
    # Setup mocks
    mock_deployer_instance = MagicMock()
    mock_deployer.return_value = mock_deployer_instance
    mock_deployer_instance.propose_and_deploy = AsyncMock(return_value=None)

    mock_trainer_instance = MagicMock()
    mock_trainer.return_value = mock_trainer_instance
    mock_trainer_instance._experiment = MagicMock(return_value=None)

    mock_resource_manager_instance = MagicMock()
    mock_resource_manager.return_value = mock_resource_manager_instance
    mock_resource_manager_instance.check_and_allocate = AsyncMock(return_value=None)

    mock_inheritance_instance = MagicMock()
    mock_inheritance.return_value = mock_inheritance_instance
    mock_inheritance_instance.execute = AsyncMock(return_value=None)

    mock_shadow_node_instance = MagicMock()
    mock_shadow_node.return_value = mock_shadow_node_instance
    mock_shadow_node_instance.run_local_cycle = AsyncMock(return_value=None)
    mock_shadow_node_instance.contribute_to_dark_pool = AsyncMock(return_value=None)

    mock_dist_manager_instance = MagicMock()
    mock_dist_manager.return_value = mock_dist_manager_instance
    mock_dist_manager_instance.process_org_payroll = AsyncMock(return_value=None)

    mock_liquidity_instance = MagicMock()
    mock_liquidity.return_value = mock_liquidity_instance
    mock_liquidity_instance.monitor_and_provide = AsyncMock(return_value=None)

    mock_v3_liquidity_instance = MagicMock()
    mock_v3_liquidity.return_value = mock_v3_liquidity_instance
    mock_v3_liquidity_instance.harvest_and_reinvest = AsyncMock(return_value=None)

    mock_omnichain_relayer_instance = MagicMock()
    mock_omnichain_relayer.return_value = mock_omnichain_relayer_instance
    mock_omnichain_relayer_instance.relay_payroll = AsyncMock(return_value=None)

    # Initialize the graph
    graph = build_master_autonomy_graph("did:test")

    # Verify graph exists and is configured
    assert graph is not None

    # Initial state
    initial_state = {
        "bytecode": b'1234',
        "salt": b'salt',
        "contract_type": "TestContract",
        "gas_budget": 50000,
        "org_address": "0x123",
        "total_payroll": 1000,
        "employee_list": ["0x456"]
    }

    # Invoke the graph - this should run all the nodes according to the edges
    final_state = await graph.ainvoke(initial_state, config={"configurable": {"thread_id": "test_thread"}})

    # Assert state was updated/maintained properly
    assert final_state["bytecode"] == b'1234'
    assert final_state["salt"] == b'salt'
    assert final_state["contract_type"] == "TestContract"

    # Assert node functions were called which verify graph edges are connected properly
    mock_resource_manager_instance.check_and_allocate.assert_called_once()
    mock_dist_manager_instance.process_org_payroll.assert_called_once_with("0x123", 1000, ["0x456"])
    mock_liquidity_instance.monitor_and_provide.assert_called_once()
    mock_v3_liquidity_instance.harvest_and_reinvest.assert_called_once()
    mock_omnichain_relayer_instance.relay_payroll.assert_called_once()
    mock_trainer_instance._experiment.assert_called_once()
    mock_deployer_instance.propose_and_deploy.assert_called_once_with(b'1234', b'salt', "TestContract", 50000)
    mock_shadow_node_instance.run_local_cycle.assert_called_once()
    mock_inheritance_instance.execute.assert_called_once()


@patch("hypervisor.agents.master_autonomy_graph.AutonomousDeployer")
@patch("hypervisor.agents.master_autonomy_graph.AutonomousModelTrainer")
@patch("hypervisor.agents.master_autonomy_graph.AutonomousResourceManager")
@patch("hypervisor.agents.master_autonomy_graph.InheritanceExecutor")
@patch("hypervisor.agents.master_autonomy_graph.ShadowNode")
@patch("hypervisor.agents.master_autonomy_graph.AutonomousDistributionManager")
@patch("hypervisor.agents.master_autonomy_graph.AutonomousLiquidityManager")
@patch("hypervisor.agents.master_autonomy_graph.AutomatedV3LiquidityManager")
@patch("hypervisor.agents.master_autonomy_graph.OmnichainRelayer")
def test_build_master_autonomy_graph_creation(
    mock_omnichain_relayer, mock_v3_liquidity, mock_liquidity, mock_dist_manager,
    mock_shadow_node, mock_inheritance, mock_resource_manager, mock_trainer, mock_deployer
):
    """
    Test the structure and creation of the master autonomy graph.
    Mocks external systems to verify graph instantiation and node composition.
    """
    # Initialize the graph
    graph = build_master_autonomy_graph("did:test")

    # Verify graph exists and is configured
    assert graph is not None

    # Verify all expected nodes exist in the compiled graph structure
    assert "blockchain_deploy" in graph.builder.nodes
    assert "ml_training" in graph.builder.nodes
    assert "resource_allocation" in graph.builder.nodes
    assert "digital_legacy" in graph.builder.nodes
    assert "shadow_sovereignty" in graph.builder.nodes
    assert "dark_compute" in graph.builder.nodes
    assert "distribution_pool" in graph.builder.nodes
    assert "network_liquidity" in graph.builder.nodes
    assert "v3_fee_harvest" in graph.builder.nodes
    assert "monitor_metrics_node" in graph.builder.nodes
    assert "cross_chain_bridge" in graph.builder.nodes
