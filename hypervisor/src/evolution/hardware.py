import subprocess
import os
import platform

class HardwareScanner:
    """
    Scans the hardware environment to determine the computing footprint.
    Detects CPU cores, RAM, and GPU VRAM.
    """
    def scan(self) -> dict:
        footprint = {
            "os_name": self._get_os_name(),
            "cpu_cores": self._get_cpu_cores(),
            "total_ram_gb": self._get_total_ram_gb(),
            "vram_mb": self._get_vram_mb(),
            "has_gpu": False
        }
        if footprint["vram_mb"] > 0:
            footprint["has_gpu"] = True

        return footprint

    def _get_os_name(self) -> str:
        sys_name = platform.system()
        if sys_name == "Linux":
            try:
                # Try to get more specific Linux distro info if possible
                with open("/etc/os-release") as f:
                    for line in f:
                        if line.startswith("PRETTY_NAME="):
                            return f"Linux ({line.split('=')[1].strip().strip('\"')})"
            except Exception:
                pass
            return "Linux"
        elif sys_name == "Darwin":
            return f"macOS {platform.mac_ver()[0]}"
        elif sys_name == "Windows":
            return f"Windows {platform.release()}"
        return sys_name

    def recommend_models(self, footprint: dict) -> dict:
        """
        Recommends task-specific local models based on the hardware footprint.
        """
        if footprint["has_gpu"] and footprint["vram_mb"] >= 16000:
            return {
                "default": "llama3:8b",
                "coding": "codellama:7b",
                "reasoning": "mistral:7b"
            }
        elif footprint["has_gpu"] and footprint["vram_mb"] >= 8000:
            return {
                "default": "llama3:8b",
                "coding": "qwen2.5-coder:7b",
                "reasoning": "mistral:7b"
            }
        elif footprint["total_ram_gb"] >= 16:
            # CPU only but enough RAM for small task specific models
            return {
                "default": "llama3:8b",
                "coding": "codellama:7b",
                "reasoning": "mistral:7b"
            }
        else:
            # Limited hardware, use a single small model for all tasks
            return {
                "default": "llama3:1b",
                "coding": "llama3:1b",
                "reasoning": "llama3:1b"
            }

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
            pass

        # Fallback to Apple Silicon unified memory
        try:
            cpu_brand = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"]).decode().strip()
            if "Apple" in cpu_brand:
                # On Apple Silicon, we can estimate VRAM from unified memory.
                # Let's allocate roughly 75% of total RAM as available VRAM.
                total_ram_gb = self._get_total_ram_gb()
                return int(total_ram_gb * 1024 * 0.75)
        except Exception:
            pass
        return 0
