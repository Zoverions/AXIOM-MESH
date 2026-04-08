from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from hypervisor.src.agents.ascension_entity import AscensionEntity


class LegacyContract(Protocol):
    async def get_will(self, token_id: int) -> dict[str, Any]:
        ...


class SkillCapsuleRepository(Protocol):
    def load_finalized_capsule(self, token_id: int) -> dict[str, Any]:
        ...


@dataclass
class StaticCapsuleLoader:
    capsule: dict[str, Any]

    def load(self, identity: str) -> dict[str, Any]:
        return {"identity": identity, **self.capsule}


class InheritanceExecutor:
    def __init__(self, legacy_contract: LegacyContract, capsule_repository: SkillCapsuleRepository, grid_client: Any):
        self.legacy_contract = legacy_contract
        self.capsule_repository = capsule_repository
        self.grid_client = grid_client

    async def execute(self, token_id: int) -> AscensionEntity | None:
        will = await self.legacy_contract.get_will(token_id)
        if not will.get("digitalEntityContinues"):
            return None

        capsule = self.capsule_repository.load_finalized_capsule(token_id)
        loader = StaticCapsuleLoader(capsule=capsule)
        identity = will.get("sovereign") or f"token:{token_id}"
        return AscensionEntity(identity=identity, capsule_loader=loader, grid_client=self.grid_client)
