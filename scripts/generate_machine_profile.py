#!/usr/bin/env python3
"""Generate machine profile for installer/runtime routing decisions."""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path


@dataclass
class MachineProfile:
    os: str
    cpu_cores: int
    ram_gb: float
    disk_free_gb: float
    gpu_name: str
    gpu_vram_mb: int
    machine_role: str
    hardware_tier: str
    recommended_local_model: str
    local_load_threshold: float
    memory_pressure_threshold: float


def _run(cmd: list[str]) -> str:
    try:
        return subprocess.check_output(cmd, stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:
        return ""


def detect_cpu_cores() -> int:
    return os.cpu_count() or 1


def detect_ram_gb() -> float:
    if Path("/proc/meminfo").exists():
        meminfo = Path("/proc/meminfo").read_text()
        m = re.search(r"MemTotal:\s+(\d+)\s+kB", meminfo)
        if m:
            return round(int(m.group(1)) / 1024 / 1024, 2)
    if platform.system() == "Darwin":
        out = _run(["sysctl", "-n", "hw.memsize"])
        if out.isdigit():
            return round(int(out) / 1024 / 1024 / 1024, 2)
    return 0.0


def detect_disk_free_gb() -> float:
    usage = shutil.disk_usage("/")
    return round(usage.free / 1024 / 1024 / 1024, 2)


def detect_gpu() -> tuple[str, int]:
    if shutil.which("nvidia-smi"):
        name = _run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"]).splitlines()[:1]
        vram = _run(["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader"]).splitlines()[:1]
        gpu_name = name[0] if name else "nvidia"
        vram_mb = 0
        if vram:
            m = re.search(r"(\d+)", vram[0])
            if m:
                vram_mb = int(m.group(1))
        return gpu_name, vram_mb
    return "none", 0


def choose_hardware_tier(cpu: int, ram_gb: float, vram_mb: int) -> str:
    if cpu >= 16 and ram_gb >= 64 and vram_mb >= 24000:
        return "full_node"
    if cpu >= 8 and ram_gb >= 24:
        return "standard"
    return "edge"


def choose_model(ram_gb: float, vram_mb: int) -> str:
    if vram_mb >= 24000 or ram_gb >= 64:
        return "llama3:70b"
    if vram_mb >= 12000 or ram_gb >= 24:
        return "mixtral:8x7b"
    return "llama3:8b"


def thresholds(machine_role: str) -> tuple[float, float]:
    if machine_role == "dedicated-mesh":
        return 0.9, 0.9
    if machine_role == "minimal-edge":
        return 0.55, 0.7
    return 0.65, 0.8


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--machine-role", default=os.getenv("MACHINE_ROLE", "shared-machine"))
    parser.add_argument("--output", default="config/machine_profile.json")
    args = parser.parse_args()

    cpu = detect_cpu_cores()
    ram_gb = detect_ram_gb()
    disk_free_gb = detect_disk_free_gb()
    gpu_name, vram_mb = detect_gpu()
    tier = choose_hardware_tier(cpu, ram_gb, vram_mb)
    model = choose_model(ram_gb, vram_mb)
    load_th, mem_th = thresholds(args.machine_role)

    profile = MachineProfile(
        os=platform.platform(),
        cpu_cores=cpu,
        ram_gb=ram_gb,
        disk_free_gb=disk_free_gb,
        gpu_name=gpu_name,
        gpu_vram_mb=vram_mb,
        machine_role=args.machine_role,
        hardware_tier=tier,
        recommended_local_model=model,
        local_load_threshold=load_th,
        memory_pressure_threshold=mem_th,
    )

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(asdict(profile), indent=2) + "\n")
    print(output)


if __name__ == "__main__":
    main()
