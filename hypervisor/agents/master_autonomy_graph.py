from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

# Import all pillar managers (from previous packages)
from hypervisor.blockchain.AutonomousDeployer import AutonomousDeployer
from hypervisor.src.evolution.auto_training import AutoTrainingLoop as AutonomousModelTrainer
from hypervisor.resources.AutonomousResourceManager import AutonomousResourceManager
from hypervisor.legacy.InheritanceExecutor import InheritanceExecutor
from hypervisor.shadow.ShadowNode import ShadowNode
from hypervisor.distribution.AutonomousDistributionManager import AutonomousDistributionManager
from hypervisor.crosschain.OmnichainRelayer import OmnichainRelayer
from hypervisor.liquidity.AutonomousLiquidityManager import AutonomousLiquidityManager
from hypervisor.liquidity.AutomatedV3LiquidityManager import AutomatedV3LiquidityManager


class AutonomyNodeHandlers:
    def __init__(self, primary_did: str):
        # Pillar 1-2: Autonomy & ML
        self.deployer = AutonomousDeployer()
        self.trainer = AutonomousModelTrainer()

        # Pillar 3-4: Resources & Legacy
        self.resource_manager = AutonomousResourceManager()
        self.legacy_executor = InheritanceExecutor()

        # Pillar 5: Shadow Sovereignty
        self.shadow = ShadowNode(primary_did)

        # Pillar 6: Universal Distribution
        self.dist_manager = AutonomousDistributionManager()

        # Pillar 8: Network Sovereign Liquidity
        self.liquidity = AutonomousLiquidityManager()
        self.v3_manager = AutomatedV3LiquidityManager()

        # Pillar 7: Cross-Chain Sovereignty
        self.relayer = OmnichainRelayer()

    async def blockchain_deploy_node(self, state):
        bytecode = state.get("bytecode", b'')
        salt = state.get("salt", b'')
        contract_type = state.get("contract_type", "DefaultType")
        gas_budget = state.get("gas_budget", 10000)
        await self.deployer.propose_and_deploy(bytecode, salt, contract_type, gas_budget)
        return state

    async def ml_training_node(self, state):
        # Simulate check and train using AutoTrainingLoop which operates in background thread normally
        # but here we just trigger one experiment synchronously for the node
        self.trainer._experiment()
        return state

    async def resource_allocation_node(self, state):
        await self.resource_manager.check_and_allocate()
        return state

    async def digital_legacy_node(self, state):
        await self.legacy_executor.execute()
        return state

    async def shadow_sovereignty_node(self, state):
        await self.shadow.run_local_cycle()
        return state

    async def dark_compute_node(self, state):
        await self.shadow.contribute_to_dark_pool()
        return state

    async def distribution_pool_node(self, state):
        org = state.get("org_address", "0x")
        payroll = state.get("total_payroll", 0)
        employees = state.get("employee_list", [])
        await self.dist_manager.process_org_payroll(org, payroll, employees)
        return state

    async def network_liquidity_node(self, state):
        await self.liquidity.monitor_and_provide()
        return state

    async def v3_fee_harvest_node(self, state):
        await self.v3_manager.harvest_and_reinvest()
        return state

    async def monitor_metrics_node(self, state):
        return state

    async def cross_chain_bridge_node(self, state):
        await self.relayer.relay_payroll()
        return state


def build_master_autonomy_graph(primary_did: str):
    graph = StateGraph(dict)
    checkpointer = MemorySaver()

    handlers = AutonomyNodeHandlers(primary_did)

    graph.add_node("blockchain_deploy", handlers.blockchain_deploy_node)
    graph.add_node("ml_training", handlers.ml_training_node)
    graph.add_node("resource_allocation", handlers.resource_allocation_node)
    graph.add_node("digital_legacy", handlers.digital_legacy_node)
    graph.add_node("shadow_sovereignty", handlers.shadow_sovereignty_node)
    graph.add_node("dark_compute", handlers.dark_compute_node)
    graph.add_node("distribution_pool", handlers.distribution_pool_node)
    graph.add_node("network_liquidity", handlers.network_liquidity_node)
    graph.add_node("v3_fee_harvest", handlers.v3_fee_harvest_node)
    graph.add_node("monitor_metrics_node", handlers.monitor_metrics_node)
    graph.add_node("cross_chain_bridge", handlers.cross_chain_bridge_node)

    # Connect all pillars (monitor → allocate → distribute → train → shadow → liquidity)
    graph.set_entry_point("monitor_metrics_node")
    graph.add_edge("monitor_metrics_node", "resource_allocation")
    graph.add_edge("resource_allocation", "distribution_pool")
    graph.add_edge("distribution_pool", "network_liquidity")
    graph.add_edge("network_liquidity", "v3_fee_harvest")
    graph.add_edge("v3_fee_harvest", "cross_chain_bridge")
    graph.add_edge("cross_chain_bridge", "ml_training")
    graph.add_edge("ml_training", "blockchain_deploy")
    graph.add_edge("blockchain_deploy", "shadow_sovereignty")
    graph.add_edge("shadow_sovereignty", "digital_legacy")
    graph.add_edge("digital_legacy", END)

    return graph.compile(checkpointer=checkpointer)
