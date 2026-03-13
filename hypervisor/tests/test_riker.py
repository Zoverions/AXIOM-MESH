import os
import sys
import pytest

# Ensure hypervisor/src is in sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from cortex.riker import RIKERGenerator

@pytest.fixture
def riker():
    db_path = "data/test_riker.db"
    if os.path.exists(db_path):
        os.remove(db_path)
    return RIKERGenerator(db_path=db_path)

def test_riker_initialization(riker):
    assert os.path.exists(riker.db_path)
    probes = riker.get_hallucination_probes()
    assert len(probes) > 0

def test_generate_corpus(riker):
    corpus = riker.generate_corpus()
    assert len(corpus) > 0
    assert "AxiomMesh" in corpus[0]["content"]

def test_score_faithfulness(riker):
    # Fact 1 is AxiomMesh version 2.5.0
    score = riker.score_faithfulness(1, "The version is 2.5.0")
    assert score == 1.0

    score = riker.score_faithfulness(1, "Something else")
    assert score == 0.0

def test_hallucination_probes(riker):
    probes = riker.get_hallucination_probes()
    assert any(p["entity"] == "Zorp-99 Galaxy" for p in probes)
