import asyncio
import os
import time
from typing import Callable, Coroutine, Dict, Any

class TaskScheduler:
    def __init__(self):
        self.tasks: Dict[str, Dict[str, Any]] = {}
        self.running = False
        self._task = None

    def add_task(self, name: str, interval: int, func: Callable[[], Coroutine], is_recurring: bool = True):
        self.tasks[name] = {
            "interval": interval,
            "func": func,
            "last_run": 0,
            "is_recurring": is_recurring
        }

    def remove_task(self, name: str):
        if name in self.tasks:
            del self.tasks[name]

    def get_tasks(self):
        return [
            {
                "name": name,
                "interval": info["interval"],
                "last_run": info["last_run"],
                "is_recurring": info["is_recurring"]
            }
            for name, info in self.tasks.items()
        ]

    def setup_preestablished_tasks(self):
        machine_role = os.getenv("MACHINE_ROLE", "shared-machine")

        async def dummy_task_knowledge_sync():
            print(f"[TaskScheduler] Running knowledge sync for {machine_role}")

        async def dummy_task_cache_clear():
            print(f"[TaskScheduler] Running cache clear for {machine_role}")

        async def dummy_task_network_sync():
            print(f"[TaskScheduler] Running network state sync for {machine_role}")

        async def dream_state_learning_loop():
            # Periodic Nudge: When the 1.58-bit Ternary Engine is idle, it enters a "Dream State".
            # Reviews recent execution artifacts, compresses them into new latent skill vectors,
            # and updates Tier 2 memory without human prompting.
            print(f"[TaskScheduler] Entering Dream State learning loop for {machine_role} (Periodic Nudge)")
            try:
                from src.evolution.evolution import EvolutionEngine
                engine = EvolutionEngine()
                # Simulate reviewing recent artifacts and compressing them
                engine.extract_skill("dream_state_compression", "compressed_artifact_hash", vector_repr="v_dream(0.9, 0.9, 0.1)")
                print(f"[TaskScheduler] Dream State complete. New skill compressed: {list(engine.get_skills().keys())[-1]}")
            except Exception as e:
                print(f"[TaskScheduler] Dream State failed: {str(e)}")

        if machine_role == "education-node":
            self.add_task("education_knowledge_sync", 3600, dummy_task_knowledge_sync)
        elif machine_role == "minimal-edge":
            self.add_task("minimal_cache_clear", 86400, dummy_task_cache_clear)
        elif machine_role == "dedicated-mesh":
            self.add_task("dedicated_network_sync", 600, dummy_task_network_sync)
        else:
            self.add_task("shared_maintenance", 86400, dummy_task_cache_clear)

        # Add the dream state task for all nodes, running periodically when idle (simulated by interval)
        self.add_task("dream_state_learning", 3600, dream_state_learning_loop)

    async def _run_loop(self):
        while self.running:
            now = time.time()
            to_remove = []
            for name, task_info in list(self.tasks.items()):
                if now - task_info["last_run"] >= task_info["interval"]:
                    try:
                        await task_info["func"]()
                    except Exception as e:
                        print(f"[TaskScheduler] Error running task {name}: {e}")
                    task_info["last_run"] = time.time()
                    if not task_info["is_recurring"]:
                        to_remove.append(name)

            for name in to_remove:
                self.remove_task(name)

            await asyncio.sleep(1)

    def start(self):
        if not self.running:
            self.running = True
            self.setup_preestablished_tasks()
            self._task = asyncio.create_task(self._run_loop())

    def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()

global_scheduler = TaskScheduler()
