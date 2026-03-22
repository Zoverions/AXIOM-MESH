# Network Agent Orchestrator
class NetworkAgentOrchestrator:
    async def spawn_agent(self, agent_type: str, purpose: str, is_founder: bool = False):
        quota = 5.0 if is_founder else await self.calculate_public_quota()  # dynamic % of remaining capacity
        if is_founder:
            await founder_entity.claimResources(quota) # type: ignore
        capsule = await sandbox.register_capsule(agent_type, quota) # type: ignore
        await grid.record_poer_registration(capsule.id, purpose) # type: ignore
        return capsule

    async def calculate_public_quota(self) -> float:
        # Placeholder for dynamic quota calculation
        return 1.0
