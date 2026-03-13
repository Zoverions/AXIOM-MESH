from src.memory.archive import DeepArchive
from src.engine.ncp_client import NCPClient
from src.engine.temporal import TemporalStateManager
from src.cortex.mirofish_mapper import MiroFishMapper
from src.cortex.divergence import DivergenceEngine

class ContextEngine:
    def __init__(self):
        self.ncp_client = NCPClient()
        self.temporal_state = TemporalStateManager() # Tier 1
        self.axioms = (
            "Thermodynamic Ethics: Maximize organization, minimize chaos. Reduce entropy.\n"
            "Uncertainty Optimization: You must explicitly halt and state 'I do not know' "
            "if data is missing or you are unsure. Do not guess. Acknowledge uncertainty as a high-value state."
        )
        self.expert_vectors = {} # Tier 2
        self.deep_archive = DeepArchive() # Tier 3
        self.miro_mapper = MiroFishMapper()
        self.divergence_engine = DivergenceEngine(self.miro_mapper)

    async def get_context(self, intent_content: str) -> str:
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

        # Tier 1 Temporal State
        collapsed_state = self.temporal_state.get_collapsed_state()

        context_str = (
            f"--- TIER 1: SYSTEM AXIOMS ---\n{self.axioms}\n\n"
        )

        if collapsed_state:
            context_str += f"--- TIER 1: COLLAPSED STATE ---\n{collapsed_state}\n\n"

        context_str += f"--- TIER 3: DEEP ARCHIVE CONTEXT ---\n{archive_context}\n\n"

        if ncp_context:
            context_str += f"--- EXTERNAL NCP CONTEXT ---\n{ncp_context}\n\n"

        context_str += f"--- USER INTENT ---\n{intent_content}"
        return context_str
