import pytest
from src.evolution.skill_rl import EvolutionEngine

class MockHardwareScanner:
    def __init__(self, footprint):
        self.footprint = footprint

    def scan(self):
        return self.footprint

def test_extract_single_skill():
    mock_footprint = {
        "cpu_cores": 4,
        "total_ram_gb": 16,
        "vram_mb": 4000,
        "has_gpu": True
    }
    scanner = MockHardwareScanner(mock_footprint)
    engine = EvolutionEngine(hardware_scanner=scanner)

    task_desc = "Sort array"
    successful_execution = "def sort(arr): return sorted(arr)"

    skill_name = engine.extract_skill(task_desc, successful_execution)

    assert skill_name == "skill_1"

    skills = engine.get_skills()
    assert "skill_1" in skills
    skill = skills["skill_1"]

    assert skill["task"] == task_desc
    assert skill["code_ref"] == hash(successful_execution)
    assert skill["vector"] == "v(0.5, 0.8, -0.2)"
    assert skill["hardware_footprint"] == mock_footprint

def test_extract_multiple_skills():
    mock_footprint = {
        "cpu_cores": 4,
        "total_ram_gb": 16,
        "vram_mb": 4000,
        "has_gpu": True
    }
    scanner = MockHardwareScanner(mock_footprint)
    engine = EvolutionEngine(hardware_scanner=scanner)

    skill1_name = engine.extract_skill("Task 1", "Code 1")
    skill2_name = engine.extract_skill("Task 2", "Code 2", vector_repr="v(1.0, 0.0, 0.0)")

    assert skill1_name == "skill_1"
    assert skill2_name == "skill_2"

    skills = engine.get_skills()
    assert len(skills) == 2
    assert skills["skill_1"]["task"] == "Task 1"
    assert skills["skill_2"]["task"] == "Task 2"
    assert skills["skill_1"]["vector"] == "v(0.5, 0.8, -0.2)"
    assert skills["skill_2"]["vector"] == "v(1.0, 0.0, 0.0)"
    assert skills["skill_1"]["code_ref"] == hash("Code 1")
    assert skills["skill_2"]["code_ref"] == hash("Code 2")

def test_get_skills_empty():
    mock_footprint = {"cpu_cores": 4}
    scanner = MockHardwareScanner(mock_footprint)
    engine = EvolutionEngine(hardware_scanner=scanner)

    assert engine.get_skills() == {}

def test_extract_skill_custom_vector():
    mock_footprint = {"cpu_cores": 4}
    scanner = MockHardwareScanner(mock_footprint)
    engine = EvolutionEngine(hardware_scanner=scanner)

    task_desc = "Sort array"
    successful_execution = "def sort(arr): return sorted(arr)"
    custom_vector = "v(0.1, 0.2, 0.3)"

    skill_name = engine.extract_skill(task_desc, successful_execution, vector_repr=custom_vector)

    skills = engine.get_skills()
    skill = skills[skill_name]

    assert skill["vector"] == custom_vector
