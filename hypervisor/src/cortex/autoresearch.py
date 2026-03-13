import threading
import time
import random
import asyncio
import httpx
import urllib.parse
import xml.etree.ElementTree as ET

class AutoResearchDaemon:
    def __init__(self, archive, llm=None, action_engine=None, ncp_client=None):
        self.archive = archive
        self.llm = llm
        self.action_engine = action_engine
        self.ncp_client = ncp_client
        self.running = False
        self.thread = None

    def start(self):
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._run_loop, daemon=True)
            self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join()

    def _run_loop(self):
        while self.running:
            time.sleep(10) # Simulate idle time/waiting for idle compute
            self._forage()

    def _forage(self):
        # Synchronous wrapper for backward compatibility or thread-based execution
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(self._async_forage())
            finally:
                loop.close()
        except Exception as e:
            print(f"[AutoResearch Daemon] Sync forage wrapper error: {e}")
            return

    async def _async_forage(self):
        """
        Performs actual epistemic foraging:
        1. Discover topic via LLM.
        2. Query external NCP context.
        3. Query ArXiv API for papers.
        4. Compile via ActionEngine.
        5. Synthesize into verifiable logic via LLM.
        """
        topic = random.choice(["decentralized consensus", "entropy reduction in LLMs", "p2p intelligence", "semantic collapse"])

        if self.llm:
            prompt = f"Objective: Discover a high-value research topic for AxiomMesh. Focus on: {topic}. Output ONLY the topic name."
            discovered_topic = await self.llm.process(prompt)
            if discovered_topic and "Error" not in discovered_topic:
                topic = discovered_topic.strip()

        # External fetching via NCP
        ncp_info = ""
        if self.ncp_client:
            ncp_info = await self.ncp_client.fetch_context(f"Recent breakthroughs in {topic}")

        # External fetching via ArXiv
        arxiv_data = ""
        try:
            query_url = f"http://export.arxiv.org/api/query?search_query=all:{topic.replace(' ', '+')}&start=0&max_results=1"
            async with httpx.AsyncClient() as client:
                res = await client.get(query_url, timeout=5.0)
                if res.status_code == 200:
                    root = ET.fromstring(res.text)
                    ns = {'atom': 'http://www.w3.org/2005/Atom'}
                    entry = root.find('atom:entry', ns)
                    if entry is not None:
                        title_elem = entry.find('atom:title', ns)
                        summary_elem = entry.find('atom:summary', ns)
                        title = title_elem.text.strip() if title_elem is not None else "Unknown"
                        summary = summary_elem.text.strip() if summary_elem is not None else "No summary available."
                        arxiv_data = f"ArXiv Title: {title}\nSummary: {summary}"
        except Exception as e:
            print(f"[AutoResearch Daemon] ArXiv fetch failed: {e}")

        # External fetching via Wikipedia as fallback
        wikipedia_data = ""
        if not arxiv_data and not ncp_info:
            try:
                wiki_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(topic)}"
                headers = {"User-Agent": "AxiomMesh-AutoResearch/1.0 (contact@axiommesh.local)"}
                async with httpx.AsyncClient() as client:
                    res = await client.get(wiki_url, headers=headers, timeout=5.0, follow_redirects=True)
                    if res.status_code == 200:
                        extract = res.json().get('extract')
                        if extract:
                            wikipedia_data = f"Wikipedia Summary: {extract}"
            except Exception as e:
                print(f"[AutoResearch Daemon] Wikipedia fetch failed: {e}")

        # Combine data
        combined_raw = f"Topic: {topic}\n{ncp_info}\n{arxiv_data}\n{wikipedia_data}".strip()

        if not arxiv_data and not ncp_info and not wikipedia_data:
            print(f"[AutoResearch Daemon] All external sources failed for topic: {topic}")
            return

        # ActionEngine "compilation"
        if self.action_engine:
            self.action_engine.compile_web_memory(f"arxiv://{topic}", combined_raw)

        # Synthesis via LLM
        final_content = combined_raw
        if self.llm:
            synthesis_prompt = (
                f"Axiom: Reduce entropy. Synthesize the following research into verifiable logic for AxiomMesh.\n"
                f"Data: {combined_raw}\n"
                f"Output a structured summary including: Objective, Rationalization, and Commitment."
            )
            synthesis = await self.llm.process(synthesis_prompt)
            if synthesis and "Error" not in synthesis:
                final_content = synthesis

        metadata = {"source": "autoresearch_daemon", "topic": topic, "timestamp": time.time()}
        self.archive.add(content=final_content, metadata=metadata)
        print(f"[AutoResearch Daemon] Foraged and compiled research on: {topic}")
