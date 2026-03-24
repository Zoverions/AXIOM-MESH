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


    def get_baseline_quotas(self, profile: str = None) -> dict:
        if profile is None:
            profile = self.get_hardware_profile()
        quotas = {
            "full_node": {
                "cpu_quota_ms": 100000,
                "memory_max_mb": 8192,
                "io_weight": 1000
            },
            "edge": {
                "cpu_quota_ms": 50000,
                "memory_max_mb": 4096,
                "io_weight": 500
            },
            "tablet": {
                "cpu_quota_ms": 20000,
                "memory_max_mb": 1024,
                "io_weight": 100
            }
        }
        return quotas.get(profile, quotas["tablet"])

    def get_hardware_profile(self, footprint: dict = None) -> str:
        if footprint is None:
            footprint = self.scan()
        if footprint["total_ram_gb"] >= 16 and footprint["vram_mb"] >= 8000:
            return "full_node"
        elif footprint["total_ram_gb"] >= 8:
            return "edge"
        else:
            return "tablet"

    def _get_os_name(self) -> str:
        sys_name = platform.system()
        if sys_name == "Linux":
            try:
                # Try to get more specific Linux distro info if possible
                with open("/etc/os-release") as f:
                    for line in f:
                        if line.startswith("PRETTY_NAME="):
                            pretty_name = line.split('=', 1)[1].strip().strip('\"')
                            return f"Linux ({pretty_name})"
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

    def _run_real_benchmarks(self) -> tuple:
        """
        Computes real benchmarks dynamically using execution instead of mock specs.
        Returns a tuple of (inf_s, mem_bandwidth_gb_s).
        """
        import timeit
        try:
            # CPU throughput proxy: 1M float ops
            elapsed_cpu = timeit.timeit('for i in range(1000000): a = i * 1.5', number=5)
            # scale to simulate an 'inf/s' token rate. Very roughly 5M passes ~ 50 inf/s on modern CPU.
            inf_s = round(25.0 / max(0.001, elapsed_cpu), 2)

            # Memory bandwidth proxy: allocate and iterate bytearray
            # 50MB array memory write
            setup_code = 'arr = bytearray(50 * 1024 * 1024); data = b"\\x01" * (50 * 1024 * 1024)'
            test_code = 'arr[:] = data'
            elapsed_mem = timeit.timeit(stmt=test_code, setup=setup_code, number=20)
            # 50MB * 20 passes = 1GB
            mem_bandwidth_gb_s = round(1.0 / max(0.001, elapsed_mem), 2)
            return inf_s, mem_bandwidth_gb_s
        except Exception:
            return 1.0, 1.0

    def generate_capability_manifest(self) -> dict:
        """
        Generates a CapabilityManifest compliant dict based on hardware footprint.
        """
        footprint = self.scan()
        profile = self.get_hardware_profile(footprint)

        tier = "edge"
        services = []
        benchmarks = {}

        # Compute real benchmarks dynamically instead of relying on static mock equations
        inf_s, mem_bandwidth_gb_s = self._run_real_benchmarks()
        benchmarks["inf/s"] = inf_s
        benchmarks["mem_bandwidth_gb_s"] = mem_bandwidth_gb_s

        if profile == "full_node":
            tier = "full"
            services = ["zkml-gen", "graph-full-sync", "deep-archive-shard", "sandbox-exec"]
        elif profile == "edge":
            tier = "mid"
            services = ["sandbox-exec", "partial-graph", "proxy"]
        else:
            tier = "edge"
            services = ["proxy", "quantized-inference"]

        return {
            "tier": tier,
            "services": services,
            "benchmarks": benchmarks
        }
