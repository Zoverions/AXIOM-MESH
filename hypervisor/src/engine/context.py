from src.memory.archive import DeepArchive

class ContextEngine:
    def __init__(self):
        self.axioms = (
            "Thermodynamic Ethics: Maximize organization, minimize chaos. Reduce entropy.\n"
            "Uncertainty Optimization: You must explicitly halt and state 'I do not know' "
            "if data is missing or you are unsure. Do not guess. Acknowledge uncertainty as a high-value state."
        )
        self.expert_vectors = {} # Tier 2
        self.deep_archive = DeepArchive() # Tier 3

    def get_context(self, intent_content: str) -> str:
        # Tier 3 Retrieval
        retrieved_data = self.deep_archive.search(intent_content)
        archive_context = "\n".join([item["content"] for item in retrieved_data])

        return (
            f"--- TIER 1: SYSTEM AXIOMS ---\n{self.axioms}\n\n"
            f"--- TIER 3: DEEP ARCHIVE CONTEXT ---\n{archive_context}\n\n"
            f"--- USER INTENT ---\n{intent_content}"
        )
