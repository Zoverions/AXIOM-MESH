import threading
import time
import random
import asyncio
import httpx
import urllib.parse
import xml.etree.ElementTree as ET
import hashlib

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

    async def _fetch_with_retry(self, url, headers=None, follow_redirects=False):
        max_retries = 3
        base_delay = 1.0
        async with httpx.AsyncClient() as client:
            for attempt in range(max_retries):
                try:
                    res = await client.get(url, headers=headers, timeout=5.0, follow_redirects=follow_redirects)
                    if res.status_code == 200:
                        return res
                except Exception as e:
                    if attempt == max_retries - 1:
                        raise e
                    await asyncio.sleep(base_delay * (2 ** attempt))
        raise Exception(f"Failed to fetch {url} after {max_retries} attempts.")

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
            res = await self._fetch_with_retry(query_url)
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
        try:
            wiki_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(topic)}"
            headers = {"User-Agent": "AxiomMesh-AutoResearch/1.0 (contact@axiommesh.local)"}
            res = await self._fetch_with_retry(wiki_url, headers=headers, follow_redirects=True)
            extract = res.json().get('extract')
            if extract:
                wikipedia_data = f"Wikipedia Summary: {extract}"
        except Exception as e:
            print(f"[AutoResearch Daemon] Wikipedia fetch failed: {e}")

        # External fetching via Crossref
        crossref_data = ""
        try:
            crossref_url = f"https://api.crossref.org/works?query={urllib.parse.quote(topic)}&select=title,abstract&rows=1"
            headers = {"User-Agent": "AxiomMesh-AutoResearch/1.0 (mailto:contact@axiommesh.local)"}
            res = await self._fetch_with_retry(crossref_url, headers=headers, follow_redirects=True)
            items = res.json().get('message', {}).get('items', [])
            if items:
                title = items[0].get('title', ['Unknown'])[0]
                abstract = items[0].get('abstract', 'No abstract available.')
                # Basic cleanup for JATS XML tags often found in Crossref abstracts
                abstract = abstract.replace('<jats:p>', '').replace('</jats:p>', '').replace('<jats:sec>', '').replace('</jats:sec>', '').replace('<jats:title>', '').replace('</jats:title>', '')
                crossref_data = f"Crossref Title: {title}\nAbstract: {abstract}"
        except Exception as e:
            print(f"[AutoResearch Daemon] Crossref fetch failed: {e}")


        # External fetching via Grokipedia
        grokipedia_data = ""
        try:
            def fetch_grokipedia():
                import grokipedia_api
                client = grokipedia_api.GrokipediaClient()
                try:
                    results = client.search_pages(topic, limit=1)
                    if results:
                        slug = results[0]['slug']
                        page_data = client.get_page(slug)
                        if page_data and page_data.get('found'):
                            title = page_data['page'].get('title', 'Unknown')
                            text_content = page_data['page'].get('content', '')
                            # Truncate content to avoid blowing up context
                            if len(text_content) > 1500:
                                text_content = text_content[:1500] + "..."
                            return f"Grokipedia Title: {title}\nContent: {text_content}"
                finally:
                    client.close()
                return ""

            grok_result = await asyncio.to_thread(fetch_grokipedia)
            if grok_result:
                grokipedia_data = grok_result
        except Exception as e:
            print(f"[AutoResearch Daemon] Grokipedia fetch failed: {e}")

        sources = []
        if ncp_info:
            sources.append({"name": "NCP", "content": ncp_info, "score": 0.8})
        if arxiv_data:
            sources.append({"name": "ArXiv", "content": arxiv_data, "score": 0.9})
        if wikipedia_data:
            sources.append({"name": "Wikipedia", "content": wikipedia_data, "score": 0.5})
        if crossref_data:
            sources.append({"name": "Crossref", "content": crossref_data, "score": 0.85})
        if grokipedia_data:
            sources.append({"name": "Grokipedia", "content": grokipedia_data, "score": 0.9})

        if not sources:
            print(f"[AutoResearch Daemon] All external sources failed for topic: {topic}. Attempting offline fallback.")
            if self.llm:
                prompt = f"Objective: Provide a comprehensive, structured summary on the topic of '{topic}'. Include verifiable claims and conceptual relationships. This will be used as a primary offline source."
                fallback_summary = await self.llm.process(prompt)
                if fallback_summary and "Error" not in fallback_summary:
                    sources.append({"name": "OfflineLLM", "content": fallback_summary, "score": 0.3})

            if not sources:
                print(f"[AutoResearch Daemon] Offline fallback failed for topic: {topic}")
                return

        # Deduplication
        unique_sources = []
        seen_hashes = set()
        for source in sources:
            content_hash = hashlib.md5(source["content"].encode('utf-8')).hexdigest()
            if content_hash not in seen_hashes:
                seen_hashes.add(content_hash)
                unique_sources.append(source)

        # Source Ranking
        unique_sources.sort(key=lambda x: x["score"], reverse=True)

        # Provenance Confidence Calculation
        base_confidence = sum(source['score'] for source in unique_sources) / len(unique_sources) if unique_sources else 0.0
        diversity_bonus = min(0.2, len(unique_sources) * 0.05)
        provenance_confidence = round(min(1.0, base_confidence + diversity_bonus), 3)

        # Combine data
        combined_raw = f"Topic: {topic}\n\nSources:\n"
        for i, source in enumerate(unique_sources):
            combined_raw += f"[{i+1}] {source['name']} (Score: {source['score']}):\n{source['content']}\n\n"
        combined_raw = combined_raw.strip()

        # ActionEngine "compilation"
        if self.action_engine:
            self.action_engine.compile_web_memory(f"arxiv://{topic}", combined_raw)

        # Synthesis via LLM
        final_content = combined_raw
        if self.llm:
            synthesis_prompt = (
                f"Axiom: Reduce entropy. Synthesize the following research into verifiable logic for AxiomMesh.\n"
                f"Data: {combined_raw}\n"
                f"Output a structured summary including: Objective, Rationalization, Commitment, and Claim Extraction.\n"
                f"For Claim Extraction, extract verifiable claims from the ranked text and construct a citation graph that links each claim to its corresponding source index (e.g., [1], [2])."
            )
            synthesis = await self.llm.process(synthesis_prompt)
            if synthesis and "Error" not in synthesis:
                final_content = synthesis

        metadata = {
            "source": "autoresearch_daemon",
            "topic": topic,
            "timestamp": time.time(),
            "provenance_confidence": provenance_confidence
        }
        await self.archive.sync_to_grid(content=final_content, metadata=metadata)
        self.archive.add(content=final_content, metadata=metadata)
        print(f"[AutoResearch Daemon] Foraged and compiled research on: {topic} (Confidence: {provenance_confidence})")
