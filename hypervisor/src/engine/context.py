from src.memory.archive import DistributedDeepArchive
from src.engine.ncp_client import NCPClient
from src.engine.temporal import TemporalStateManager
from src.engine.oracle import ChainlinkOracle
from src.models.intent import IntentObject
from src.cortex.mirofish_mapper import MiroFishMapper
from src.cortex.divergence import DivergenceEngine

class ContextEngine:
    def __init__(self):
        self.ncp_client = NCPClient()
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

    async def get_context(self, intent: IntentObject) -> str:
        intent_content = intent.content
        metadata = intent.metadata or {}

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

        # Chainlink Oracle Off-chain Verifiable Data Feed
        oracle_context = await self.oracle.fetch_data_feed(intent_content)

        # Tier 1 Temporal State
        collapsed_state = self.temporal_state.get_collapsed_state()

        # Axioms (allowing for metadata override for testing/comparison)
        axioms = metadata.get("axioms_override", self.axioms)

        context_str = (
            f"--- TIER 1: SYSTEM AXIOMS ---\n{axioms}\n\n"
        )

        if collapsed_state:
            context_str += f"--- TIER 1: COLLAPSED STATE ---\n{collapsed_state}\n\n"

        context_str += f"--- TIER 3: DEEP ARCHIVE CONTEXT ---\n{archive_context}\n\n"

        if ncp_context:
            context_str += f"--- EXTERNAL NCP CONTEXT ---\n{ncp_context}\n\n"

        if oracle_context:
            context_str += f"--- TRUTH CONTEXT (VERIFIABLE OFF-CHAIN FEEDS) ---\n{oracle_context}\n\n"

        context_str += f"--- USER INTENT ---\n{intent_content}"
        return context_str
