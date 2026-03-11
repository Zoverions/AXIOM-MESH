import json
import re

class ActionEngine:
    """
    ActionEngine Web Compiler (State-Machine Web Memory).
    Simulates compilation of offline web states into traversable graphs.
    """
    def __init__(self):
        self.web_memory_graph = {}

    def compile_web_memory(self, url: str, html_content: str) -> dict:
        """
        Compiles raw HTML or text from a web page into a state-machine node.
        Extracts links and text into a structured JSON state.
        """
        # Very basic mock compilation of a web page
        links = re.findall(r'href=[\'"]?([^\'" >]+)', html_content)
        clean_text = re.sub(r'<[^>]+>', '', html_content).strip()
        state_node = {
            "url": url,
            "text_length": len(clean_text),
            "outbound_links": links,
            "compiled_state": "ACTIVE"
        }
        self.web_memory_graph[url] = state_node
        return state_node

    def offline_web_mapping(self, urls: list, mock_fetcher) -> dict:
        """
        Recursively maps a list of URLs offline to build the web state graph.
        `mock_fetcher` is a callable that returns html given a url.
        """
        for url in urls:
            if url not in self.web_memory_graph:
                content = mock_fetcher(url)
                self.compile_web_memory(url, content)
        return self.web_memory_graph

class EvolutionEngine:
    def __init__(self):
        self.skills = {}

    def agentic_critical_training(self, task: str, baseline_code: str, mutated_code: str, baseline_loss: float, mutated_loss: float) -> str:
        """
        Recursive update loop via Agentic Critical Training (ACT).
        Extracts contrastive logic equations by comparing baseline vs mutated performance.
        """
        improvement = baseline_loss - mutated_loss
        if improvement > 0:
            # The mutation improved the loss (reduced entropy)
            # We calculate a contrastive vector mimicking the delta
            contrastive_vector = f"v_contrastive(delta_loss={improvement:.4f}, task='{task}')"
            skill_name = self.extract_skill(task, mutated_code, vector_repr=contrastive_vector)
            return skill_name

        return "NO_IMPROVEMENT"

    def extract_skill(self, task_description: str, successful_execution: str, vector_repr: str = "v(0.5, 0.8, -0.2)"):
        skill_name = "skill_" + str(len(self.skills) + 1)
        self.skills[skill_name] = {
            "task": task_description,
            "code_ref": hash(successful_execution),
            "vector": vector_repr
        }
        return skill_name

    def get_skills(self):
        return self.skills
