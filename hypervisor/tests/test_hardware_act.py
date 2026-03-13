import pytest
from src.evolution.skill_rl import EvolutionEngine

class MockHardwareScanner:
    def __init__(self, footprint):
        self.footprint = footprint

    def scan(self):
        return self.footprint

def test_hardware_aware_act_high_fidelity():
    mock_footprint = {
        "cpu_cores": 16,
        "total_ram_gb": 64,
        "vram_mb": 24000,
        "has_gpu": True
    }
    scanner = MockHardwareScanner(mock_footprint)
    engine = EvolutionEngine(hardware_scanner=scanner)

    skill_name = engine.agentic_critical_training(
        task="optimize_sql",
        baseline_code="SELECT * FROM table",
        mutated_code="SELECT col FROM table",
        baseline_loss=1.0,
        mutated_loss=0.5
    )

    assert skill_name != "NO_IMPROVEMENT"
    skill = engine.get_skills()[skill_name]
    assert "hardware='high_fidelity'" in skill["vector"]
    assert "scaling=1.0" in skill["vector"]
    assert skill["hardware_footprint"] == mock_footprint

def test_hardware_aware_act_low_footprint():
    mock_footprint = {
        "cpu_cores": 2,
        "total_ram_gb": 4,
        "vram_mb": 0,
        "has_gpu": False
    }
    scanner = MockHardwareScanner(mock_footprint)
    engine = EvolutionEngine(hardware_scanner=scanner)

    skill_name = engine.agentic_critical_training(
        task="optimize_sql",
        baseline_code="SELECT * FROM table",
        mutated_code="SELECT col FROM table",
        baseline_loss=1.0,
        mutated_loss=0.5
    )

    assert skill_name != "NO_IMPROVEMENT"
    skill = engine.get_skills()[skill_name]
    assert "hardware='low_footprint_optimized'" in skill["vector"]
    assert "scaling=0.5" in skill["vector"]
    assert skill["hardware_footprint"] == mock_footprint

def test_hardware_aware_act_balanced():
    mock_footprint = {
        "cpu_cores": 8,
        "total_ram_gb": 16,
        "vram_mb": 4000,
        "has_gpu": True
    }
    scanner = MockHardwareScanner(mock_footprint)
    engine = EvolutionEngine(hardware_scanner=scanner)

    skill_name = engine.agentic_critical_training(
        task="optimize_sql",
        baseline_code="SELECT * FROM table",
        mutated_code="SELECT col FROM table",
        baseline_loss=1.0,
        mutated_loss=0.5
    )

    assert skill_name != "NO_IMPROVEMENT"
    skill = engine.get_skills()[skill_name]
    assert "hardware='balanced'" in skill["vector"]
    assert "scaling=0.8" in skill["vector"]
    assert skill["hardware_footprint"] == mock_footprint
