from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

# Import all pillar managers (from previous packages)
from hypervisor.blockchain.AutonomousDeployer import AutonomousDeployer
from hypervisor.src.evolution.auto_training import AutoTrainingLoop as AutonomousModelTrainer
from hypervisor.resources.AutonomousResourceManager import AutonomousResourceManager
from hypervisor.legacy.InheritanceExecutor import InheritanceExecutor
from hypervisor.shadow.ShadowNode import ShadowNode
from hypervisor.distribution.AutonomousDistributionManager import AutonomousDistributionManager
from hypervisor.shadow.AirGapConsent import AirGapConsent  # for shadow
from hypervisor.crosschain.OmnichainRelayer import OmnichainRelayer

def build_master_autonomy_graph(primary_did: str):
    graph = StateGraph(dict)
    checkpointer = MemorySaver()

    # Pillar 1-2: Autonomy & ML
    deployer = AutonomousDeployer()
    trainer = AutonomousModelTrainer()

    async def blockchain_deploy_node(state):
        bytecode = state.get("bytecode", b'')
        salt = state.get("salt", b'')
        contract_type = state.get("contract_type", "DefaultType")
        gas_budget = state.get("gas_budget", 10000)
        await deployer.propose_and_deploy(bytecode, salt, contract_type, gas_budget)
        return state

    async def ml_training_node(state):
        # Simulate check and train using AutoTrainingLoop which operates in background thread normally
        # but here we just trigger one experiment synchronously for the node
        trainer._experiment()
        return state

    graph.add_node("blockchain_deploy", blockchain_deploy_node)
    graph.add_node("ml_training", ml_training_node)

    # Pillar 3-4: Resources & Legacy
    resource_manager = AutonomousResourceManager()
    legacy_executor = InheritanceExecutor()

    async def resource_allocation_node(state):
        await resource_manager.check_and_allocate()
        return state

    async def digital_legacy_node(state):
        await legacy_executor.execute()
        return state

    graph.add_node("resource_allocation", resource_allocation_node)
    graph.add_node("digital_legacy", digital_legacy_node)

    # Pillar 5: Shadow Sovereignty
    shadow = ShadowNode(primary_did)

    async def shadow_sovereignty_node(state):
        await shadow.run_local_cycle()
        return state

    async def dark_compute_node(state):
        await shadow.contribute_to_dark_pool()
        return state

    graph.add_node("shadow_sovereignty", shadow_sovereignty_node)
    graph.add_node("dark_compute", dark_compute_node)

    # Pillar 6: Universal Distribution
    dist_manager = AutonomousDistributionManager()

    async def distribution_pool_node(state):
        org = state.get("org_address", "0x")
        payroll = state.get("total_payroll", 0)
        employees = state.get("employee_list", [])
        await dist_manager.process_org_payroll(org, payroll, employees)
        return state

    graph.add_node("distribution_pool", distribution_pool_node)

    async def monitor_metrics_node(state):
        return state

    graph.add_node("monitor_metrics_node", monitor_metrics_node)

    # Pillar 7: Cross-Chain Sovereignty
    relayer = OmnichainRelayer()

    async def cross_chain_bridge_node(state):
        await relayer.relay_payroll()
        return state

    graph.add_node("cross_chain_bridge", cross_chain_bridge_node)


    # Connect all pillars (monitor → allocate → distribute → train → shadow)
    graph.set_entry_point("monitor_metrics_node")
    graph.add_edge("monitor_metrics_node", "resource_allocation")
    graph.add_edge("resource_allocation", "distribution_pool")
    graph.add_edge("distribution_pool", "cross_chain_bridge")
    graph.add_edge("cross_chain_bridge", "ml_training")
    graph.add_edge("ml_training", "blockchain_deploy")
    graph.add_edge("blockchain_deploy", "shadow_sovereignty")
    graph.add_edge("shadow_sovereignty", "digital_legacy")
    graph.add_edge("digital_legacy", END)

    return graph.compile(checkpointer=checkpointer)