import json
import httpx
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

class ActionEngineParser(HTMLParser):
    def __init__(self, base_url):
        super().__init__()
        self.base_url = base_url
        self.links = []
        self.text_content = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            for attr in attrs:
                if attr[0] == 'href':
                    link = attr[1]
                    # Normalize and resolve relative URLs
                    full_url = urljoin(self.base_url, link)
                    # Only include same-domain links to avoid infinite web crawls
                    if urlparse(full_url).netloc == urlparse(self.base_url).netloc:
                        self.links.append(full_url)

    def handle_data(self, data):
        text = data.strip()
        if text:
            self.text_content.append(text)

class ActionEngine:
    """
    ActionEngine Web Compiler (State-Machine Web Memory).
    Compiles offline web states into traversable graphs.
    """
    def __init__(self, network_sync=None):
        self.web_memory_graph = {}
        self.network_sync = network_sync

    def compile_web_memory(self, url: str, html_content: str) -> dict:
        """
        Compiles raw HTML or text from a web page into a state-machine node.
        Extracts links and text into a structured JSON state via a robust HTML parser.
        """
        parser = ActionEngineParser(url)
        parser.feed(html_content)

        clean_text = " ".join(parser.text_content)
        state_node = {
            "url": url,
            "text_length": len(clean_text),
            "outbound_links": list(set(parser.links)), # Deduplicate
            "compiled_state": "ACTIVE"
        }
        self.web_memory_graph[url] = state_node

        # Publish to decentralized cache if network_sync is available
        if self.network_sync:
            self.network_sync.publish_web_state(state_node)

        return state_node

    async def offline_web_mapping(self, urls: list, max_depth: int = 2) -> dict:
        """
        Recursively maps a list of URLs offline to build the web state graph.
        Uses httpx for real fetching and integrates with the Grid cache.
        """
        async with httpx.AsyncClient() as client:
            for url in urls:
                await self._recursive_map(url, client, depth=0, max_depth=max_depth)
        return self.web_memory_graph

    async def _recursive_map(self, url: str, client: httpx.AsyncClient, depth: int, max_depth: int):
        if depth > max_depth or url in self.web_memory_graph:
            return

        # 1. Check local memory first
        if url in self.web_memory_graph:
            return

        # 2. Check Grid's decentralized cache
        if self.network_sync:
            cached_state = self.network_sync.fetch_web_cache(url)
            if cached_state:
                self.web_memory_graph[url] = cached_state
                # Recurse on links from cached state
                for link in cached_state.get("outbound_links", []):
                    await self._recursive_map(link, client, depth + 1, max_depth)
                return

        # 3. Real Fetch
        try:
            print(f"[ActionEngine] Fetching: {url} (depth={depth})")
            response = await client.get(url, timeout=10.0)
            if response.status_code == 200:
                state_node = self.compile_web_memory(url, response.text)
                # Recurse
                for link in state_node["outbound_links"]:
                    await self._recursive_map(link, client, depth + 1, max_depth)
        except Exception as e:
            print(f"[ActionEngine] Failed to fetch {url}: {e}")

class EvolutionEngine:
    def __init__(self):
        self.skills = {}
        self.rollout_buffer = []

    def store_rollout(self, action: str, signal: dict, sender_identity: str):
        """
        Stores (Action, Signal) pairs for the OpenClaw-RL rollout collection loop.
        """
        self.rollout_buffer.append({
            "action": action,
            "signal": signal,
            "sender": sender_identity
        })

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
