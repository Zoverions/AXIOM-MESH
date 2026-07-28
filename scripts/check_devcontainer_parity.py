#!/usr/bin/env python3
"""Verify devcontainer and docker-compose.dev parity for critical development services."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEVCONTAINER = ROOT / ".devcontainer" / "devcontainer.json"
DEV_COMPOSE = ROOT / "docker-compose.dev.yml"

REQUIRED_SERVICES = {"gateway", "hypervisor", "grid", "sandbox"}


def parse_compose_services(compose_text: str) -> set[str]:
    services: set[str] = set()
    in_services = False
    for line in compose_text.splitlines():
        if line.strip() == "services:":
            in_services = True
            continue
        if in_services and line and not line.startswith(" "):
            break
        if in_services and line.startswith("  ") and line.strip().endswith(":") and not line.startswith("    "):
            services.add(line.strip().rstrip(":"))
    return services


def main() -> int:
    dc = json.loads(DEVCONTAINER.read_text(encoding="utf-8"))
    compose_text = DEV_COMPOSE.read_text(encoding="utf-8")

    run_services = set(dc.get("runServices", []))
    compose_services = parse_compose_services(compose_text)

    failures = []
    missing_in_devcontainer = REQUIRED_SERVICES - run_services
    missing_in_compose = REQUIRED_SERVICES - compose_services

    if missing_in_devcontainer:
        failures.append(f"devcontainer missing runServices entries: {sorted(missing_in_devcontainer)}")
    if missing_in_compose:
        failures.append(f"docker-compose.dev missing services: {sorted(missing_in_compose)}")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        return 1

    print("PASS: devcontainer and docker-compose.dev include required services")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
