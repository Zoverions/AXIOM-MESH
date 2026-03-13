from typing import Any

class DialecticOrchestrator:
    def __init__(self, llm: Any = None):
        self.llm = llm

    async def synthesize(self, prompt: str) -> str:
        if not self.llm:
            raise ValueError("LLM provider is required for dialectic synthesis.")

        # 1. Thesis (Affirmative)
        thesis_prompt = f"Topic: {prompt}\nTask: Provide the strongest possible argument IN FAVOR of this topic. Be concise but compelling."
        thesis = await self.llm.process(thesis_prompt)

        # 2. Antithesis (Negative)
        antithesis_prompt = f"Topic: {prompt}\nTask: Provide the strongest possible argument AGAINST this topic. Focus on risks, downsides, and contradictions."
        antithesis = await self.llm.process(antithesis_prompt)

        # 3. Synthesis (Structural Truth)
        synthesis_prompt = (
            f"Topic: {prompt}\n\n"
            f"Thesis (Pro): {thesis}\n\n"
            f"Antithesis (Con): {antithesis}\n\n"
            "Task: Perform a dialectic synthesis. Do not just compromise. "
            "Identify the underlying structural truth that reconciles these contradictions. "
            "Provide a definitive 'Structural Truth' conclusion."
        )
        synthesis_result = await self.llm.process(synthesis_prompt)

        return (
            f"--- Dialectic Cognitive Partitioning: {prompt} ---\n\n"
            f"[THESIS]\n{thesis}\n\n"
            f"[ANTITHESIS]\n{antithesis}\n\n"
            f"[SYNTHESIS]\n{synthesis_result}"
        )
