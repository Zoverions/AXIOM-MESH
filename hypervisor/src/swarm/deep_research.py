import logging
import asyncio
from typing import Dict

try:
    from hypervisor.src.swarm.in_process_runner import MicroSwarmRunner
    from hypervisor.src.llm.provider import LLMProvider
except ImportError:
    from src.swarm.in_process_runner import MicroSwarmRunner
    from src.llm.provider import LLMProvider

logger = logging.getLogger("Zoverions-DeepResearch")

class DeepResearchSwarm:
    """
    Onyx-inspired multi-step research loop utilizing Axiom's Fractal Cognition.
    Dynamically orchestrates Planning, Searching, and Synthesis sub-agents.
    """
    def __init__(self, swarm_runner: MicroSwarmRunner):
        self.swarm = swarm_runner

    async def execute_research(self, overarching_query: str) -> str:
        logger.info(f"[🔬] Initiating Deep Research Protocol for: '{overarching_query}'")
        
        # 1. Spawn the Sub-Agents
        planner_id = self.swarm.spawn_teammate(
            role_name="Query_Planner",
            system_directive="You break complex questions into 3 distinct, highly targeted search queries. Return ONLY a JSON list of strings."
        )
        synthesizer_id = self.swarm.spawn_teammate(
            role_name="Research_Synthesizer",
            system_directive="You ingest raw data chunks and compile a highly structured, factual markdown report. Exclude all AI filler."
        )

        # 2. Phase 1: Deconstruct Query
        queries_json = await self.swarm.active_teammates[planner_id].execute_task(overarching_query)
        # Mock parse the JSON queries
        sub_queries = ["Query 1", "Query 2", "Query 3"] 
        
        # 3. Phase 2: Parallel Web/MCP Search (Fractal Scaling)
        search_task_map = {}
        for i, q in enumerate(sub_queries):
            # Spawn ephemeral search agents for each sub-query
            s_id = self.swarm.spawn_teammate(f"Search_Agent_{i}", "Use the WebFetch MCP tool to find data on the given query. Extract raw facts.")
            search_task_map[s_id] = q

        logger.info(f"[⚡] Dispatching {len(sub_queries)} parallel search trajectories...")
        raw_results = await self.swarm.delegate_parallel(search_task_map)
        
        # 4. Phase 3: Synthesis
        compiled_raw_data = "\n\n".join([f"Source {k}:\n{v}" for k, v in raw_results.items()])
        final_report = await self.swarm.active_teammates[synthesizer_id].execute_task(
            f"Original Request: {overarching_query}\n\nRAW DATA:\n{compiled_raw_data}"
        )

        # Purge ephemeral contexts
        self.swarm.dissolve_swarm()
        
        logger.info("[✅] Deep Research Complete.")
        return final_report
