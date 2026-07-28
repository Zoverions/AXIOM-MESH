import sys
from unittest.mock import MagicMock, patch

# To avoid import errors for missing dependencies during module collection,
# we mock them using a temporary dictionary for sys.modules
MOCK_MODULES = [
    "langgraph", "langgraph.graph", "langgraph.checkpoint", "langgraph.checkpoint.memory",
    "web3", "web3.middleware", "web3.exceptions", "requests", "ecdsa", "mcp", "yaml", "httpx", "jsonschema", "qrcode", "cryptography", "cryptography.fernet", "PIL"
]

def test_autonomy_node_handlers_init():
    """
    Test that AutonomyNodeHandlers initializes all pillar managers correctly.
    """
    mock_deps = {module: MagicMock() for module in MOCK_MODULES}

    with patch.dict(sys.modules, mock_deps):
        # We need to import inside the patch to ensure mocks are used
        from hypervisor.agents.master_autonomy_graph import AutonomyNodeHandlers

        with patch("hypervisor.agents.master_autonomy_graph.AutonomousDeployer") as mock_deployer, \
             patch("hypervisor.agents.master_autonomy_graph.AutonomousModelTrainer") as mock_trainer, \
             patch("hypervisor.agents.master_autonomy_graph.AutonomousResourceManager") as mock_resource_manager, \
             patch("hypervisor.agents.master_autonomy_graph.InheritanceExecutor") as mock_executor, \
             patch("hypervisor.agents.master_autonomy_graph.ShadowNode") as mock_shadow, \
             patch("hypervisor.agents.master_autonomy_graph.AutonomousDistributionManager") as mock_dist_manager, \
             patch("hypervisor.agents.master_autonomy_graph.AutonomousLiquidityManager") as mock_liquidity, \
             patch("hypervisor.agents.master_autonomy_graph.AutomatedV3LiquidityManager") as mock_v3_manager, \
             patch("hypervisor.agents.master_autonomy_graph.OmnichainRelayer") as mock_relayer:

            primary_did = "did:test:123"

            # Instantiate the handlers
            handlers = AutonomyNodeHandlers(primary_did)

            # Assert that all attributes are initialized via their respective classes
            assert handlers.deployer == mock_deployer.return_value
            assert handlers.trainer == mock_trainer.return_value
            assert handlers.resource_manager == mock_resource_manager.return_value
            assert handlers.legacy_executor == mock_executor.return_value
            assert handlers.shadow == mock_shadow.return_value
            assert handlers.dist_manager == mock_dist_manager.return_value
            assert handlers.liquidity == mock_liquidity.return_value
            assert handlers.v3_manager == mock_v3_manager.return_value
            assert handlers.relayer == mock_relayer.return_value

            # Verify ShadowNode was initialized with the correct DID
            mock_shadow.assert_called_once_with(primary_did)
