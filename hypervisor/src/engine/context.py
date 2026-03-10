from src.memory.archive import DeepArchive
from src.engine.ncp_client import NCPClient

class ContextEngine:
    def __init__(self):
        self.ncp_client = NCPClient()
        self.axioms = (
            "Thermodynamic Ethics: Maximize organization, minimize chaos. Reduce entropy.\n"
            "Uncertainty Optimization: You must explicitly halt and state 'I do not know' "
            "if data is missing or you are unsure. Do not guess. Acknowledge uncertainty as a high-value state."
        )
        self.expert_vectors = {} # Tier 2
        self.deep_archive = DeepArchive() # Tier 3

    async def get_context(self, intent_content: str) -> str:
        # Tier 3 Retrieval
        retrieved_data = self.deep_archive.search(intent_content)
        archive_context = "\n".join([item["content"] for item in retrieved_data])

        # Node Context Protocol (NCP) External Retrieval
        ncp_context = await self.ncp_client.fetch_context(intent_content)

        context_str = (
            f"--- TIER 1: SYSTEM AXIOMS ---\n{self.axioms}\n\n"
            f"--- TIER 3: DEEP ARCHIVE CONTEXT ---\n{archive_context}\n\n"
        )

        if ncp_context:
            context_str += f"--- EXTERNAL NCP CONTEXT ---\n{ncp_context}\n\n"

        context_str += f"--- USER INTENT ---\n{intent_content}"
        return context_str
