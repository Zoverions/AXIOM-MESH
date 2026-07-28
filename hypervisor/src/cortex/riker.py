import sqlite3
import os
from typing import List, Dict, Any

class RIKERGenerator:
    """
    RIKER Protocol: Ground-Truth-First Synthetic Evaluation.
    Manages a Coherent Simulated Universe (CSU) in SQLite to generate
    deterministic benchmarks for AxiomMesh.
    """
    def __init__(self, db_path: str = "data/riker_csu.db"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity TEXT NOT NULL,
                attribute TEXT NOT NULL,
                value TEXT NOT NULL,
                is_hallucination_probe BOOLEAN DEFAULT 0
            )
        ''')

        # Seed with initial "Agents of Chaos" and "Semantic Collapse" facts if empty
        cursor.execute("SELECT COUNT(*) FROM facts")
        if cursor.fetchone()[0] == 0:
            initial_facts = [
                ("AxiomMesh", "version", "2.5.0", 0),
                ("Semantic Event Horizon", "threshold", "15k-20k documents", 0),
                ("Grok 4.20", "hallucination_rate", "22%", 0),
                ("NVIDIA Nemotron 3 Super", "throughput", "452 t/s", 0),
                ("Zorp-99 Galaxy", "governor", "Overlord Quat", 1), # Probe
                ("Xylithium Crystal", "melting_point", "4500 Kelvins", 1) # Probe
            ]
            cursor.executemany(
                "INSERT INTO facts (entity, attribute, value, is_hallucination_probe) VALUES (?, ?, ?, ?)",
                initial_facts
            )

        conn.commit()
        conn.close()

    def add_fact(self, entity: str, attribute: str, value: str, is_probe: bool = False):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO facts (entity, attribute, value, is_hallucination_probe) VALUES (?, ?, ?, ?)",
            (entity, attribute, value, 1 if is_probe else 0)
        )
        conn.commit()
        conn.close()

    def generate_corpus(self) -> List[Dict[str, Any]]:
        """Generates a synthetic document corpus from known facts."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM facts WHERE is_hallucination_probe = 0")
        facts = cursor.fetchall()
        conn.close()

        corpus = []
        for fact in facts:
            content = f"The {fact['attribute']} of {fact['entity']} is {fact['value']}."
            corpus.append({
                "content": content,
                "metadata": {"source": "RIKER-CSU", "fact_id": fact['id']}
            })
        return corpus

    def get_hallucination_probes(self) -> List[Dict[str, Any]]:
        """Returns non-existent entities for the Hallucination Probe."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM facts WHERE is_hallucination_probe = 1")
        probes = cursor.fetchall()
        conn.close()
        return [dict(p) for p in probes]

    def score_faithfulness(self, fact_id: int, response: str) -> float:
        """Deterministic scoring: 1.0 if the fact value is present, 0.0 otherwise."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM facts WHERE id = ?", (fact_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return 0.0

        expected_value = row[0].lower()
        if expected_value in response.lower():
            return 1.0
        return 0.0
