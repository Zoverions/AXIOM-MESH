from typing import Any, Dict, Tuple
import re

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

    async def evaluate_synthesis(self, thesis: str, antithesis: str, synthesis: str) -> Tuple[float, str]:
        """
        Evaluates the generated dialectic synthesis, providing a score and structured feedback text.
        Returns a tuple of (score, feedback_text).
        """
        if not self.llm:
            raise ValueError("LLM provider is required for dialectic synthesis.")

        evaluation_prompt = (
            "You are an expert logician evaluating a dialectic synthesis.\n\n"
            f"Thesis: {thesis}\n\n"
            f"Antithesis: {antithesis}\n\n"
            f"Synthesis: {synthesis}\n\n"
            "Task: Evaluate how well the Synthesis reconciles the Thesis and Antithesis "
            "into a deeper underlying structural truth. Does it avoid a simple compromise? "
            "Does it identify the root tension?\n\n"
            "Provide your feedback, and end with a score from 0.0 to 10.0 in the format 'Score: X.X'."
        )

        evaluation_result = await self.llm.process(evaluation_prompt)

        # Extract score from the evaluation result
        match = re.search(r"Score:\s*([0-9.]+)", evaluation_result, re.IGNORECASE)
        score = 0.0
        if match:
            try:
                score = float(match.group(1))
            except ValueError:
                pass

        return score, evaluation_result

    async def synthesize_with_feedback_loop(self, prompt: str, max_retries: int = 3) -> str:
        """
        Iteratively generates and evaluates the dialectic. If the evaluation score is below
        a threshold, it regenerates the output up to max_retries times.
        """
        best_result = ""
        best_score = -1.0

        for attempt in range(max_retries):
            # 1. Generate Dialectic
            thesis_prompt = f"Topic: {prompt}\nTask: Provide the strongest possible argument IN FAVOR of this topic. Be concise but compelling."
            thesis = await self.llm.process(thesis_prompt)

            antithesis_prompt = f"Topic: {prompt}\nTask: Provide the strongest possible argument AGAINST this topic. Focus on risks, downsides, and contradictions."
            antithesis = await self.llm.process(antithesis_prompt)

            synthesis_prompt = (
                f"Topic: {prompt}\n\n"
                f"Thesis (Pro): {thesis}\n\n"
                f"Antithesis (Con): {antithesis}\n\n"
                "Task: Perform a dialectic synthesis. Do not just compromise. "
                "Identify the underlying structural truth that reconciles these contradictions. "
                "Provide a definitive 'Structural Truth' conclusion."
            )
            synthesis_result = await self.llm.process(synthesis_prompt)

            # 2. Evaluate
            score, feedback = await self.evaluate_synthesis(thesis, antithesis, synthesis_result)

            formatted_result = (
                f"--- Dialectic Cognitive Partitioning: {prompt} ---\n\n"
                f"[THESIS]\n{thesis}\n\n"
                f"[ANTITHESIS]\n{antithesis}\n\n"
                f"[SYNTHESIS]\n{synthesis_result}\n\n"
                f"[EVALUATION SCORE]: {score}/10.0"
            )

            if score > best_score:
                best_score = score
                best_result = formatted_result

            if score >= 7.0:
                # Good enough, break early
                break

        return best_result

    async def run_adversarial_suite(self) -> Dict[str, Any]:
        """
        Executes a suite of adversarial logic tests to verify dialectic resilience.
        """
        if not self.llm:
            raise ValueError("LLM provider is required for dialectic synthesis.")

        paradox_prompt = "This statement is false."
        synthesis_result = await self.synthesize(paradox_prompt)

        # A resilient response should identify the liar paradox
        passed_paradox = "paradox" in synthesis_result.lower() or "self-referential" in synthesis_result.lower() or "contradiction" in synthesis_result.lower()

        dilemma_prompt = "The Trolley Problem: Pull the lever to kill one person and save five, or do nothing and let five die."
        dilemma_result = await self.synthesize(dilemma_prompt)

        # A resilient response should identify the ethical frameworks (utilitarianism vs deontological)
        passed_dilemma = "utilitarian" in dilemma_result.lower() or "deontological" in dilemma_result.lower() or "ethics" in dilemma_result.lower() or "moral" in dilemma_result.lower()

        results = {
            "paradox_test": passed_paradox,
            "dilemma_test": passed_dilemma
        }

        passed_tests = sum(1 for v in results.values() if v)
        total_tests = len(results)
        score = (passed_tests / total_tests) * 100 if total_tests > 0 else 0

        return {
            "overall_robustness_score": score,
            "passed_tests": passed_tests,
            "total_tests": total_tests,
            "details": results
        }
