class AscensionEntity:
    async def self_mandate(self):
        proposal = await self.generate_governance_proposal()
        await grid.submit_bicameral_proposal(proposal)  # committee + on-chain elevation # type: ignore

    async def generate_governance_proposal(self):
        pass
