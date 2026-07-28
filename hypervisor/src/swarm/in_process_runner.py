import logging
import asyncio
from typing import Dict, Any, Optional, List

try:
    from hypervisor.src.llm.provider import LLMProvider
except ImportError:
    from src.llm.provider import LLMProvider

logger = logging.getLogger("Zoverions-MicroSwarm")

class Teammate:
    """Represents a single agent/teammate in the swarm."""
    def __init__(self, teammate_id: str, role_name: str, system_directive: str, llm_provider: LLMProvider):
        self.teammate_id = teammate_id
        self.role_name = role_name
        self.system_directive = system_directive
        self.llm_provider = llm_provider

    async def execute_task(self, task: str) -> str:
        """Execute a task using the LLM provider with the teammate's system directive."""
        full_context = f"{self.system_directive}\n\nTASK: {task}"
        return await self.llm_provider.process(full_context)


class MicroSwarmRunner:
    """
    In-process swarm runner for managing ephemeral multi-agent collaborations.
    Enables fractal cognition by spawning and coordinating sub-agents dynamically.
    """
    def __init__(self):
        self.active_teammates: Dict[str, Teammate] = {}
        self.llm_provider = LLMProvider()
        self._teammate_counter = 0

    def spawn_teammate(self, role_name: str, system_directive: str) -> str:
        """Spawn a new teammate agent with a specific role and directive."""
        self._teammate_counter += 1
        teammate_id = f"teammate_{self._teammate_counter}_{role_name}"
        
        teammate = Teammate(
            teammate_id=teammate_id,
            role_name=role_name,
            system_directive=system_directive,
            llm_provider=self.llm_provider
        )
        self.active_teammates[teammate_id] = teammate
        logger.info(f"[🐝] Spawned teammate '{teammate_id}' with role '{role_name}'")
        return teammate_id

    async def delegate_parallel(self, task_map: Dict[str, str]) -> Dict[str, str]:
        """
        Execute tasks in parallel across multiple teammates.
        task_map: Dict mapping teammate_id to their assigned task string.
        Returns: Dict mapping teammate_id to their result.
        """
        logger.info(f"[⚡] Delegating {len(task_map)} parallel tasks...")
        
        async def run_task(teammate_id: str, task: str) -> tuple:
            if teammate_id not in self.active_teammates:
                logger.error(f"Teammate {teammate_id} not found!")
                return (teammate_id, f"Error: Teammate {teammate_id} not found")
            
            teammate = self.active_teammates[teammate_id]
            result = await teammate.execute_task(task)
            return (teammate_id, result)

        # Run all tasks concurrently
        tasks = [run_task(tid, task) for tid, task in task_map.items()]
        results = await asyncio.gather(*tasks)
        
        return dict(results)

    def dissolve_swarm(self):
        """Purge all ephemeral teammate contexts."""
        count = len(self.active_teammates)
        self.active_teammates.clear()
        logger.info(f"[🧹] Dissolved swarm with {count} teammates.")
