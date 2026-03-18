from src.memory.archive import DistributedDeepArchive
import os
import json

from src.engine.ncp_client import NCPClient
from src.engine.mcp_client import MCPClient
from src.engine.temporal import TemporalStateManager
from src.engine.oracle import ChainlinkOracle
from src.models.intent import IntentObject
from src.cortex.mirofish_mapper import MiroFishMapper
from src.cortex.divergence import DivergenceEngine

class ContextEngine:
    def __init__(self, llm=None):
        self.llm = llm
        self.ncp_client = NCPClient(llm=self.llm)
        self.mcp_client = MCPClient()
        self.oracle = ChainlinkOracle()
        self.temporal_state = TemporalStateManager() # Tier 1
        self.interaction_history = []
        self.axioms = (
            "Thermodynamic Ethics: Maximize organization, minimize chaos. Reduce entropy.\n"
            "Uncertainty Optimization: You must explicitly halt and state 'I do not know' "
            "if data is missing or you are unsure. Do not guess. Acknowledge uncertainty as a high-value state.\n"
            "Intentionality Framing: Frame all responses through the lens of 'Intentionality'.\n"
            "1. State your specific goal for this response.\n"
            "2. Explain the reasoning behind your choice of tools or logic (Behavioral Legibility).\n"
            "3. Express 'desire' for a specific outcome (e.g., 'I want to find the most efficient path').\n"
            "4. Avoid 'I am a model' disclaimers; instead, say 'My current objective is...'\n"
            "Example Structure:\n"
            "- The Objective: 'My goal is to optimize your database for 1M requests/sec.'\n"
            "- The Rationalization: 'I am choosing the Shard-Key method because it minimizes cross-region latency.'\n"
            "- The Commitment: 'I will prioritize data integrity over raw speed unless you specify otherwise.'"
        )
        self.expert_vectors = {} # Tier 2
        self.deep_archive = DistributedDeepArchive() # Tier 3
        self.miro_mapper = MiroFishMapper()
        self.divergence_engine = DivergenceEngine(self.miro_mapper)

        # Adaptive interaction policies
        self.preferences_path = "data/preferences.json"
        self.user_preferences = {}
        os.makedirs("data", exist_ok=True)
        if os.path.exists(self.preferences_path):
            with open(self.preferences_path, "r") as f:
                try:
                    self.user_preferences = json.load(f)
                except json.JSONDecodeError:
                    self.user_preferences = {}

    def set_user_mode(self, sender: str, mode: str):
        self.user_preferences[sender] = mode
        with open(self.preferences_path, "w") as f:
            json.dump(self.user_preferences, f, indent=2)

    async def get_context(self, intent: IntentObject) -> str:
        intent_content = intent.content
        metadata = intent.metadata or {}
        session_id = intent.session_id
        sender = metadata.get("sender", "unknown")

        # Tier 3 Retrieval
        retrieved_data = self.deep_archive.search(intent_content)

        # Integrate MiroFish mapping for spatial-aware context
        hgr_nodes = []
        content_map = {}
        for i, item in enumerate(retrieved_data):
            node_id = f"node_{i}"
            hgr_nodes.append({
                "id": node_id,
                "label": f"Archive-{i}",
                "content": item["content"],
                "tier": 3,
                "references": []
            })
            content_map[node_id] = item["content"]

        # Add system axioms as Tier 1 nodes (Owner Nodes)
        hgr_nodes.append({
            "id": "axiom_node",
            "label": "System Axioms",
            "content": self.axioms,
            "tier": 1,
            "references": []
        })

        self.miro_mapper.map_to_spatial_grid(hgr_nodes)

        # Use Divergence Engine to find diverse nodes if we have a large corpus
        archive_context_parts = [item["content"] for item in retrieved_data]
        if len(hgr_nodes) > 5:
            diverse_node_ids = self.divergence_engine.get_diverse_nodes(top_n=2)
            for d_id in diverse_node_ids:
                if d_id in content_map and content_map[d_id] not in archive_context_parts:
                    archive_context_parts.append(f"[Diverse Context] {content_map[d_id]}")

        archive_context = "\n".join(archive_context_parts)

        # Node Context Protocol (NCP) External Retrieval
        ncp_context = await self.ncp_client.fetch_context(intent_content)

        # Model Context Protocol (MCP) External Retrieval
        mcp_context = await self.mcp_client.fetch_context(intent_content)

        # Chainlink Oracle Off-chain Verifiable Data Feed
        oracle_context = await self.oracle.fetch_data_feed(intent_content)

        # Tier 1 Temporal State
        collapsed_state = self.temporal_state.get_collapsed_state()

        # Axioms (allowing for metadata override for testing/comparison)
        axioms = metadata.get("axioms_override", self.axioms)
        response_style = metadata.get("response_style", "standard")

        style_instruction = ""
        if response_style == "concise":
            style_instruction = "Response Style: Be extremely concise, brief, and direct. Skip pleasantries."
        elif response_style == "analytical":
            style_instruction = "Response Style: Be highly analytical. Break down the problem logically with deep reasoning."
        elif response_style == "socratic":
            style_instruction = "Response Style: Use the Socratic method. Guide the user with questions rather than just providing the answer."
        else:
            style_instruction = "Response Style: Standard AxiomMesh protocol."

        # Apply Adaptive interaction policies
        mode = self.user_preferences.get(sender)
        if mode == "concise":
            axioms += "\nMode Instruction: Be extremely concise. Provide only the essential answer without elaboration."
        elif mode == "analytical":
            axioms += "\nMode Instruction: Be highly analytical. Break down the problem logically, provide step-by-step reasoning, and consider multiple angles."
        elif mode == "socratic":
            axioms += "\nMode Instruction: Use the Socratic method. Guide the user to the answer by asking probing questions instead of just giving the solution directly."
        elif mode == "executive":
            axioms += "\nMode Instruction: Use an executive summary style. Provide a high-level overview, key takeaways, and actionable bullet points."

        context_str = (
            f"--- TIER 1: SYSTEM AXIOMS ---\n{axioms}\n\n"
            f"--- TIER 1: RESPONSE STYLE ---\n{style_instruction}\n\n"
        )

        if collapsed_state:
            context_str += f"--- TIER 1: COLLAPSED STATE ---\n{collapsed_state}\n\n"

        context_str += f"--- TIER 3: DEEP ARCHIVE CONTEXT ---\n{archive_context}\n\n"

        if ncp_context:
            context_str += f"--- EXTERNAL NCP CONTEXT ---\n{ncp_context}\n\n"

        if mcp_context:
            context_str += f"--- EXTERNAL MCP CONTEXT ---\n{mcp_context}\n\n"

        if oracle_context:
            context_str += f"--- TRUTH CONTEXT (VERIFIABLE OFF-CHAIN FEEDS) ---\n{oracle_context}\n\n"

        context_str += f"--- USER INTENT ---\n{intent_content}"
        return context_str
