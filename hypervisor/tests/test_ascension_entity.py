import pytest

from hypervisor.src.agents.ascension_entity import AscensionEntity


class DummyCapsuleLoader:
    def load(self, identity: str):
        return {"capsule_id": f"capsule-{identity}", "weights": [0.4, 0.3, 0.2]}


class DummyGrid:
    async def submit_bicameral_proposal(self, proposal):
        return {"status": "submitted", "proposal": proposal}


class DummyProver:
    def infer_and_prove(self, input_vector):
        return {
            "model_commitment": "commit-1",
            "input": input_vector,
            "output": [sum(input_vector)],
            "proof": "proof-json",
            "vk": "vk-b64",
            "settings": "settings-json",
        }


@pytest.mark.asyncio
async def test_generate_governance_proposal_includes_proof_bundle():
    entity = AscensionEntity(
        identity="did:mesh:abc",
        capsule_loader=DummyCapsuleLoader(),
        grid_client=DummyGrid(),
        zkml_prover=DummyProver(),
    )

    proposal = await entity.generate_governance_proposal()

    assert proposal["type"] == "Ascension_Governance_Proposal"
    assert proposal["proof_bundle"]["zkml_proof"] == "proof-json"
    assert proposal["proof_bundle"]["cpor_causal_hash"]


@pytest.mark.asyncio
async def test_self_mandate_submits_to_grid():
    entity = AscensionEntity(
        identity="did:mesh:abc",
        capsule_loader=DummyCapsuleLoader(),
        grid_client=DummyGrid(),
        zkml_prover=DummyProver(),
    )

    result = await entity.self_mandate()

    assert result["status"] == "submitted"
    assert result["proposal"]["identity"] == "did:mesh:abc"
