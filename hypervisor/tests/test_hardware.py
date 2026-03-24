import pytest
from unittest.mock import patch, mock_open, MagicMock
from src.evolution.hardware import HardwareScanner

def test_hardware_profile():
    scanner = HardwareScanner()

    assert scanner.get_hardware_profile({"total_ram_gb": 16, "vram_mb": 8000}) == "full_node"
    assert scanner.get_hardware_profile({"total_ram_gb": 16, "vram_mb": 4000}) == "edge"
    assert scanner.get_hardware_profile({"total_ram_gb": 8, "vram_mb": 0}) == "edge"
    assert scanner.get_hardware_profile({"total_ram_gb": 4, "vram_mb": 0}) == "tablet"

    # Test fallback when footprint is None
    with patch.object(scanner, 'scan', return_value={"total_ram_gb": 16, "vram_mb": 8000}):
        assert scanner.get_hardware_profile(None) == "full_node"

def test_recommend_models():
    scanner = HardwareScanner()

    res1 = scanner.recommend_models({"has_gpu": True, "vram_mb": 16000, "total_ram_gb": 32})
    assert res1["default"] == "llama3:8b"
    assert res1["coding"] == "codellama:7b"

    res2 = scanner.recommend_models({"has_gpu": True, "vram_mb": 8000, "total_ram_gb": 16})
    assert res2["coding"] == "qwen2.5-coder:7b"

    res3 = scanner.recommend_models({"has_gpu": False, "total_ram_gb": 16})
    assert res3["reasoning"] == "mistral:7b"

    res4 = scanner.recommend_models({"has_gpu": False, "total_ram_gb": 8})
    assert res4["default"] == "llama3:1b"

@patch('platform.system')
def test_get_os_name_linux(mock_system):
    mock_system.return_value = "Linux"
    scanner = HardwareScanner()

    # Test with /etc/os-release
    m_open = mock_open(read_data="NAME=\"Ubuntu\"\nPRETTY_NAME=\"Ubuntu 22.04 LTS\"\n")
    with patch("builtins.open", m_open):
        assert scanner._get_os_name() == "Linux (Ubuntu 22.04 LTS)"

    # Test without /etc/os-release
    with patch("builtins.open", side_effect=FileNotFoundError):
        assert scanner._get_os_name() == "Linux"

@patch('platform.system')
@patch('platform.mac_ver')
def test_get_os_name_mac(mock_mac_ver, mock_system):
    mock_system.return_value = "Darwin"
    mock_mac_ver.return_value = ("14.0", (), "")
    scanner = HardwareScanner()
    assert scanner._get_os_name() == "macOS 14.0"

@patch('platform.system')
@patch('platform.release')
def test_get_os_name_windows(mock_release, mock_system):
    mock_system.return_value = "Windows"
    mock_release.return_value = "11"
    scanner = HardwareScanner()
    assert scanner._get_os_name() == "Windows 11"

@patch('platform.system')
def test_get_os_name_unknown(mock_system):
    mock_system.return_value = "FreeBSD"
    scanner = HardwareScanner()
    assert scanner._get_os_name() == "FreeBSD"

@patch('subprocess.check_output')
@patch('os.cpu_count')
def test_get_cpu_cores(mock_cpu_count, mock_check_output):
    scanner = HardwareScanner()

    # Test nproc
    mock_check_output.return_value = b"8\n"
    assert scanner._get_cpu_cores() == 8

    # Test fallback to sysctl
    def check_output_side_effect(args, **kwargs):
        if args[0] == "nproc":
            raise FileNotFoundError()
        elif args[0] == "sysctl":
            return b"10\n"
        raise Exception("Unknown")

    mock_check_output.side_effect = check_output_side_effect
    assert scanner._get_cpu_cores() == 10

    # Test fallback to os.cpu_count
    mock_check_output.side_effect = Exception("All failed")
    mock_cpu_count.return_value = 12
    assert scanner._get_cpu_cores() == 12

@patch('subprocess.check_output')
def test_get_total_ram_gb(mock_check_output):
    scanner = HardwareScanner()

    # Test Linux free
    mock_check_output.return_value = b"              total        used        free      shared  buff/cache   available\nMem:             31           5          20           0           5          25\nSwap:             0           0           0\n"
    assert scanner._get_total_ram_gb() == 31.0

    # Test macOS sysctl
    def check_output_side_effect(args, **kwargs):
        if args[0] == "free":
            raise Exception("No free command")
        elif args[0] == "sysctl":
            return b"17179869184\n" # 16GB
        raise Exception("Unknown")

    mock_check_output.side_effect = check_output_side_effect
    assert scanner._get_total_ram_gb() == 16.0

    # Test fallback inside the exception handler (e.g., sysctl raises an exception)
    mock_check_output.side_effect = Exception("All failed")
    assert scanner._get_total_ram_gb() == 8.0

    # Test final fallback (e.g., Linux free doesn't find Mem: line)
    mock_check_output.side_effect = None
    mock_check_output.return_value = b"              total        used        free\nSwap:             0           0           0\n"
    assert scanner._get_total_ram_gb() == 8.0

@patch('subprocess.check_output')
def test_get_vram_mb(mock_check_output):
    scanner = HardwareScanner()

    # Test nvidia-smi
    mock_check_output.return_value = b"24576\n"
    assert scanner._get_vram_mb() == 24576

    # Test Apple Silicon
    def check_output_side_effect(args, **kwargs):
        if args[0] == "nvidia-smi":
            raise Exception("No nvidia")
        elif args[0] == "sysctl" and "machdep.cpu.brand_string" in args:
            return b"Apple M2 Max\n"
        raise Exception("Unknown")

    mock_check_output.side_effect = check_output_side_effect
    with patch.object(scanner, '_get_total_ram_gb', return_value=32.0):
        assert scanner._get_vram_mb() == int(32 * 1024 * 0.75)

    # Test fallback
    mock_check_output.side_effect = Exception("All failed")
    assert scanner._get_vram_mb() == 0

@patch('platform.system')
@patch('subprocess.check_output')
def test_scan_full_mock(mock_check_output, mock_system):
    mock_system.return_value = "Windows"

    def check_output_side_effect(args, **kwargs):
        if args[0] == "nproc":
            return b"12\n"
        elif args[0] == "free":
            return b"              total        used        free      shared  buff/cache   available\nMem:             64           5          20           0           5          25\nSwap:             0           0           0\n"
        elif args[0] == "nvidia-smi":
            return b"16384\n"
        raise Exception("Unknown command: " + str(args))

    mock_check_output.side_effect = check_output_side_effect

    with patch('platform.release', return_value="10"):
        scanner = HardwareScanner()
        res = scanner.scan()

    assert res == {
        "os_name": "Windows 10",
        "cpu_cores": 12,
        "total_ram_gb": 64.0,
        "vram_mb": 16384,
        "has_gpu": True
    }

@patch('platform.system')
@patch('subprocess.check_output')
@patch('os.cpu_count')
def test_scan_no_gpu(mock_cpu_count, mock_check_output, mock_system):
    mock_system.return_value = "Linux"
    mock_cpu_count.return_value = 4

    def check_output_side_effect(args, **kwargs):
        if args[0] == "nproc":
            raise Exception("No nproc")
        elif args[0] == "sysctl" and "hw.ncpu" in args:
            raise Exception("No sysctl ncpu")
        elif args[0] == "free":
            return b"              total        used        free      shared  buff/cache   available\nMem:             15           5          20           0           5          25\nSwap:             0           0           0\n"
        elif args[0] == "nvidia-smi":
            raise Exception("No nvidia-smi")
        elif args[0] == "sysctl" and "machdep.cpu.brand_string" in args:
            raise Exception("No Apple")
        raise Exception("Unknown command: " + str(args))

    mock_check_output.side_effect = check_output_side_effect

    m_open = mock_open(read_data="NAME=\"Debian\"\nPRETTY_NAME=\"Debian GNU/Linux 11\"\n")
    with patch("builtins.open", m_open):
        scanner = HardwareScanner()
        res = scanner.scan()

    assert res == {
        "os_name": "Linux (Debian GNU/Linux 11)",
        "cpu_cores": 4,
        "total_ram_gb": 15.0,
        "vram_mb": 0,
        "has_gpu": False
    }

@patch.object(HardwareScanner, '_get_os_name')
@patch.object(HardwareScanner, '_get_cpu_cores')
@patch.object(HardwareScanner, '_get_total_ram_gb')
@patch.object(HardwareScanner, '_get_vram_mb')
def test_scan(mock_vram, mock_ram, mock_cpu, mock_os):
    mock_os.return_value = "Linux"
    mock_cpu.return_value = 8
    mock_ram.return_value = 16.0
    mock_vram.return_value = 8192

    scanner = HardwareScanner()
    res = scanner.scan()

    assert res == {
        "os_name": "Linux",
        "cpu_cores": 8,
        "total_ram_gb": 16.0,
        "vram_mb": 8192,
        "has_gpu": True
    }

    mock_vram.return_value = 0
    res2 = scanner.scan()
    assert res2["has_gpu"] == False

@patch.object(HardwareScanner, 'scan')
def test_generate_capability_manifest_full_node(mock_scan):
    scanner = HardwareScanner()
    mock_scan.return_value = {
        "os_name": "Linux",
        "cpu_cores": 8,
        "total_ram_gb": 32.0,
        "vram_mb": 16000,
        "has_gpu": True
    }

    with patch.object(HardwareScanner, '_run_real_benchmarks', return_value=(68.0, 51.2)):
        manifest = scanner.generate_capability_manifest()

    assert manifest["tier"] == "full"
    assert "zkml-gen" in manifest["services"]
    assert "graph-full-sync" in manifest["services"]
    assert "deep-archive-shard" in manifest["services"]
    assert "sandbox-exec" in manifest["services"]
    assert manifest["benchmarks"]["inf/s"] == 68.0
    assert manifest["benchmarks"]["mem_bandwidth_gb_s"] == 51.2

@patch.object(HardwareScanner, 'scan')
def test_generate_capability_manifest_edge(mock_scan):
    scanner = HardwareScanner()
    mock_scan.return_value = {
        "os_name": "Linux",
        "cpu_cores": 4,
        "total_ram_gb": 16.0,
        "vram_mb": 0,
        "has_gpu": False
    }

    with patch.object(HardwareScanner, '_run_real_benchmarks', return_value=(6.0, 8.5)):
        manifest = scanner.generate_capability_manifest()

    assert manifest["tier"] == "mid"
    assert "sandbox-exec" in manifest["services"]
    assert "partial-graph" in manifest["services"]
    assert "proxy" in manifest["services"]
    assert manifest["benchmarks"]["inf/s"] == 6.0
    assert manifest["benchmarks"]["mem_bandwidth_gb_s"] == 8.5

@patch.object(HardwareScanner, 'scan')
def test_generate_capability_manifest_tablet(mock_scan):
    scanner = HardwareScanner()
    mock_scan.return_value = {
        "os_name": "Linux",
        "cpu_cores": 2,
        "total_ram_gb": 4.0,
        "vram_mb": 0,
        "has_gpu": False
    }

    with patch.object(HardwareScanner, '_run_real_benchmarks', return_value=(1.6, 2.1)):
        manifest = scanner.generate_capability_manifest()

    assert manifest["tier"] == "edge"
    assert "proxy" in manifest["services"]
    assert "quantized-inference" in manifest["services"]
    assert manifest["benchmarks"]["inf/s"] == 1.6
    assert manifest["benchmarks"]["mem_bandwidth_gb_s"] == 2.1
