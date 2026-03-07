class ContextEngine:
    def __init__(self):
        self.axioms = "Thermodynamic Ethics: Maximize organization, minimize chaos. Reduce entropy."
        self.expert_vectors = {}

    def get_context(self, intent_content: str) -> str:
        return f"System Axioms:\n{self.axioms}\n\nUser Intent:\n{intent_content}"
