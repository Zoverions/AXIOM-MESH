import json
import logging
import asyncio
from typing import Dict, Any, List

# Sub-System Imports (Legacy & Swarm)
from hypervisor.src.swarm.in_process_runner import MicroSwarmRunner
from hypervisor.src.mcp.bridge import AxiomMCPBridge
from hypervisor.src.mcp.config_manager import AxiomMCPConfigManager
from hypervisor.src.immune.precognitive_filter import PreCognitiveFilter

# THE SOVEREIGN TRIAD (Memory, Ledger, Evolution)
from hypervisor.src.memory.rbac_vault import RBACVault
from hypervisor.src.ledger.neural_state_machine import TransformerNativeLedger, NeuralContractViolation
from hypervisor.src.evolution.meta_harness_parallel import ParallelMetaHarness

logger = logging.getLogger("Zoverions-Orchestrator")

class InferenceOrchestrator:
    """
    The Central Nervous System of the Zoverions Node.
    Routes user intent through Zero-Trust memory, evaluates it via the Neural Ledger,
    and triggers autonomic self-evolution if cognitive friction is detected.
    """
    def __init__(self, llm_provider, pulse_system=None, workspace_root: str = "/axiom"):
        self.llm = llm_provider
        self.pulse = pulse_system
        self.workspace_root = workspace_root

        # 1. Swarm & External Tools
        self.swarm_runner = MicroSwarmRunner(self.llm, self.pulse)
        self.mcp_config = AxiomMCPConfigManager()
        self.mcp_bridge = AxiomMCPBridge(self.mcp_config)

        # 2. Defense & Memory (Onyx RBAC Integration)
        self.instinct_filter = PreCognitiveFilter()
        self.rbac_vault = RBACVault()

        # 3. The State Machine & Compiler
        self.neural_ledger = TransformerNativeLedger(self.llm)
        self.meta_harness = ParallelMetaHarness(self.workspace_root, self.llm)

    async def boot_sequence(self):
        """Called when the Hypervisor starts."""
        await self.mcp_bridge.initialize_mesh_connections()
        logger.info("[🧬] Zoverions Master Orchestrator Online. All Substrates Linked.")

    async def execute_sovereign_intent(self, intent: Dict[str, Any], retrieved_context: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        The Ultimate Cognitive Pipeline.
        Routes an intent through the Instinct Filter, the RBAC Vault, and the Neural Ledger.
        Triggers Autonomic Evolution if the Ledger geometrically rejects the state transition.
        """
        identity_hash = intent.get("identity_hash", "anonymous")
        prompt = intent.get("input", "")

        logger.info(f"[⚡] Orchestrating Intent from Identity: {identity_hash[:8]}...")

        # =====================================================================
        # TIER 0 DEFENSE: Instinctual Flinch (Pre-Cognitive Filter)
        # =====================================================================
        is_safe, rejection_reason = self.instinct_filter.evaluate_action("intent_parse", {"command": prompt})
        if not is_safe:
            if self.pulse:
                self.pulse.current_entropy = min(1.0, self.pulse.current_entropy + 0.4)
            return {"status": "rejected", "reason": rejection_reason}

        # =====================================================================
        # TIER 1 ZERO-TRUST MEMORY: The Onyx RBAC Sync
        # =====================================================================
        # Filter the retrieved context chunks (from Tier 3) through the RBAC Vault.
        # If the user lacks clearance for specific documents, they are silently dropped.
        safe_context = self.rbac_vault.filter_authorized_context(identity_hash, retrieved_context)
        logger.info(f"[🔐] RBAC Vault cleared {len(safe_context)}/{len(retrieved_context)} context chunks.")

        # Compile the context and the intent into a Neural Transaction format
        transaction = {
            "pub_key": identity_hash,
            "sig": intent.get("signature", "0xUNVERIFIED"),
            "prompt": prompt,
            "context": safe_context
        }

        # =====================================================================
        # TIER 2 STATE MACHINE: The Neural Ledger (TNL)
        # =====================================================================
        try:
            # Pass the structured transaction into the 1.58-bit Transformer KV-Cache
            block_result = await self.neural_ledger.process_neural_block([transaction])

            # Check if the Ledger returned a logical/semantic error explicitly
            if "error" in block_result:
                raise NeuralContractViolation(block_result["error"])

            return {"status": "success", "block_data": block_result}

        except NeuralContractViolation as e:
            # =================================================================
            # TIER 3 AUTONOMIC EVOLUTION: The Parallel Meta Harness
            # =================================================================
            logger.error(f"[🛑] Neural Contract Violation Detected: {e}")
            logger.warning("[🔄] Thermodynamic rejection occurred. Engaging Parallel Meta Harness...")

            # Artificially spike the pulse entropy to register the failure
            if self.pulse:
                self.pulse.current_entropy = 1.0

            # Package the exact point of failure for the Proposer agents
            friction_trace = {
                "task_hash": intent.get("id", "0xFAIL"),
                "bottleneck_module": "hypervisor/src/ledger/neural_state_machine.py",
                "error": str(e),
                "latency_ms": 5000,
                "epistemic_entropy": 1.0
            }

            # Inject the failure into the Epistemic Archive for grepping
            self.meta_harness.archive.add_artifact(friction_trace)

            # Trigger the Worktree Evolution Cycle (Spawns N Micro-Swarms)
            evolution_success = await self.meta_harness.run_evolution_cycle()

            if evolution_success:
                logger.info("[🟢] Meta Harness successfully mutated the architecture. State space restored.")
                return {
                    "status": "evolved",
                    "reason": "Contract rejected state, but Autonomic Compiler deployed a geometric fix."
                }
            else:
                logger.critical("[💀] Meta Harness exhausted permutations. Manual Founder intervention required.")
                return {
                    "status": "failed",
                    "reason": "Unrecoverable semantic collapse. Evolution failed."
                }

    async def _handle_tool_call(self, tool_name: str, arguments: dict):
        """Routes execution to Swarms, MCP Bridge, or Native Tooling."""
        if tool_name == "spawn_micro_swarm":
            # ... micro-swarm delegation logic ...
            return "[MICRO-SWARM SYNTHESIS]\n..."

        elif tool_name in self.mcp_bridge.available_tools:
            return await self.mcp_bridge.execute_mcp_tool(tool_name, arguments)

        else:
            return await self._execute_native_sandbox_tool(tool_name, arguments)

    async def _execute_native_sandbox_tool(self, tool_name: str, arguments: dict):
        """Mock fallback for standard sandbox execution."""
        pass