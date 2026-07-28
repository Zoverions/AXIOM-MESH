#!/usr/bin/env python3
"""Seed deterministic development fixtures used by docker-compose.dev.yml."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"


def ensure_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def ensure_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = "\n".join(json.dumps(record, separators=(",", ":")) for record in records)
    path.write_text(serialized + "\n", encoding="utf-8")


def main() -> None:
    ensure_json(
        DATA_DIR / "cooperation_metrics.json",
        [
            {
                "peer_id": "dev-peer-001",
                "cooperation_score": 0.98,
                "latency_ms": 14,
                "timestamp": "2026-04-08T00:00:00Z",
            }
        ],
    )
    ensure_jsonl(
        DATA_DIR / "embodied_governance_events.jsonl",
        [
            {
                "event": "DEV_SEED",
                "message": "Development fixture baseline generated",
                "timestamp": "2026-04-08T00:00:00Z",
            }
        ],
    )
    print("Seeded development fixtures in ./data")


if __name__ == "__main__":
    main()
