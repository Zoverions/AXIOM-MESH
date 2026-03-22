class InferenceScaler:
    async def scale(self):
        local_pressure = 85 # TODO get this dynamically
        if local_pressure > 80:
            # Buy/rent via on-chain task contract to external zkML/swarm
            await grid.submit_task("rent_inference", budget_from_treasury) # type: ignore
        # Auto-route donations → public-goods split
