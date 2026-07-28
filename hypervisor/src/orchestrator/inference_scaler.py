import os

class InferenceScaler:
    def __init__(self, grid, budget_from_treasury):
        self.grid = grid
        self.budget_from_treasury = budget_from_treasury

    async def scale(self):
        try:
            load_avg = os.getloadavg()[0]
            cpu_count = os.cpu_count() or 1
            local_pressure = min(1.0, load_avg / cpu_count) * 100
        except OSError:
            local_pressure = 85

        if local_pressure > 80:
            # Buy/rent via on-chain task contract to external zkML/swarm
            await self.grid.submit_task("rent_inference", self.budget_from_treasury) # type: ignore
        # Auto-route donations → public-goods split
