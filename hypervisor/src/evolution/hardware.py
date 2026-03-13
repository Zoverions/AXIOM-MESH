import subprocess
import os

class HardwareScanner:
    """
    Scans the hardware environment to determine the computing footprint.
    Detects CPU cores, RAM, and GPU VRAM.
    """
    def scan(self) -> dict:
        footprint = {
            "cpu_cores": self._get_cpu_cores(),
            "total_ram_gb": self._get_total_ram_gb(),
            "vram_mb": self._get_vram_mb(),
            "has_gpu": False
        }
        if footprint["vram_mb"] > 0:
            footprint["has_gpu"] = True

        return footprint

    def _get_cpu_cores(self) -> int:
        try:
            return int(subprocess.check_output(["nproc"]).decode().strip())
        except Exception:
            try:
                # Fallback for systems without nproc (like macOS)
                return int(subprocess.check_output(["sysctl", "-n", "hw.ncpu"]).decode().strip())
            except Exception:
                # Final fallback
                return os.cpu_count() or 1

    def _get_total_ram_gb(self) -> float:
        try:
            # Linux 'free' command
            output = subprocess.check_output(["free", "-g"]).decode().split('\n')
            for line in output:
                if line.startswith("Mem:"):
                    return float(line.split()[1])
        except Exception:
            try:
                # macOS 'sysctl' command
                bytes_ram = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"]).decode().strip())
                return round(bytes_ram / (1024**3), 2)
            except Exception:
                return 8.0 # Default assumption
        return 8.0

    def _get_vram_mb(self) -> int:
        try:
            # NVIDIA GPU VRAM
            output = subprocess.check_output([
                "nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"
            ]).decode().strip()
            return int(output.split('\n')[0])
        except Exception:
            return 0
