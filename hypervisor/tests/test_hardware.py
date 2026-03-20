import pytest
from unittest.mock import patch, mock_open, MagicMock
from src.evolution.hardware import HardwareScanner
import subprocess
import os

@pytest.fixture
def scanner():
    return HardwareScanner()

def test_get_os_name_linux_with_os_release(scanner):
    with patch('platform.system', return_value='Linux'):
        mock_file = mock_open(read_data='PRETTY_NAME="Ubuntu 22.04 LTS"\n')
        with patch('builtins.open', mock_file):
            assert scanner._get_os_name() == 'Linux (Ubuntu 22.04 LTS)'

def test_get_os_name_linux_without_os_release(scanner):
    with patch('platform.system', return_value='Linux'):
        with patch('builtins.open', side_effect=Exception('File not found')):
            assert scanner._get_os_name() == 'Linux'

def test_get_os_name_darwin(scanner):
    with patch('platform.system', return_value='Darwin'):
        with patch('platform.mac_ver', return_value=('13.0.0', ('', '', ''), 'arm64')):
            assert scanner._get_os_name() == 'macOS 13.0.0'

def test_get_os_name_windows(scanner):
    with patch('platform.system', return_value='Windows'):
        with patch('platform.release', return_value='10'):
            assert scanner._get_os_name() == 'Windows 10'

def test_get_cpu_cores_nproc(scanner):
    with patch('subprocess.check_output', return_value=b'8\n'):
        assert scanner._get_cpu_cores() == 8

def test_get_cpu_cores_sysctl(scanner):
    def mock_check_output(args, **kwargs):
        if args == ["nproc"]:
            raise Exception("Command not found")
        elif args == ["sysctl", "-n", "hw.ncpu"]:
            return b'12\n'
        raise Exception("Unknown command")

    with patch('subprocess.check_output', side_effect=mock_check_output):
        assert scanner._get_cpu_cores() == 12

def test_get_cpu_cores_fallback(scanner):
    with patch('subprocess.check_output', side_effect=Exception("Error")):
        with patch('os.cpu_count', return_value=4):
            assert scanner._get_cpu_cores() == 4

def test_get_cpu_cores_fallback_none(scanner):
    with patch('subprocess.check_output', side_effect=Exception("Error")):
        with patch('os.cpu_count', return_value=None):
            assert scanner._get_cpu_cores() == 1

def test_get_total_ram_gb_linux(scanner):
    output = b"""              total        used        free      shared  buff/cache   available
Mem:              31           8           5           0          17          22
Swap:              0           0           0
"""
    with patch('subprocess.check_output', return_value=output):
        assert scanner._get_total_ram_gb() == 31.0

def test_get_total_ram_gb_macos(scanner):
    def mock_check_output(args, **kwargs):
        if args == ["free", "-g"]:
            raise Exception("Command not found")
        elif args == ["sysctl", "-n", "hw.memsize"]:
            return b'17179869184\n' # 16 GB
        raise Exception("Unknown command")

    with patch('subprocess.check_output', side_effect=mock_check_output):
        assert scanner._get_total_ram_gb() == 16.0

def test_get_total_ram_gb_fallback(scanner):
    with patch('subprocess.check_output', side_effect=Exception("Error")):
        assert scanner._get_total_ram_gb() == 8.0

def test_get_vram_mb_nvidia(scanner):
    with patch('subprocess.check_output', return_value=b'12288\n'):
        assert scanner._get_vram_mb() == 12288

def test_get_vram_mb_apple_silicon(scanner):
    def mock_check_output(args, **kwargs):
        if args[0] == "nvidia-smi":
            raise Exception("No nvidia")
        elif args == ["sysctl", "-n", "machdep.cpu.brand_string"]:
            return b'Apple M1 Pro\n'
        raise Exception("Unknown command")

    with patch('subprocess.check_output', side_effect=mock_check_output):
        with patch.object(scanner, '_get_total_ram_gb', return_value=16.0):
            assert scanner._get_vram_mb() == 12288

def test_get_vram_mb_fallback(scanner):
    with patch('subprocess.check_output', side_effect=Exception("Error")):
        assert scanner._get_vram_mb() == 0

def test_scan(scanner):
    with patch.object(scanner, '_get_os_name', return_value='Linux'):
        with patch.object(scanner, '_get_cpu_cores', return_value=8):
            with patch.object(scanner, '_get_total_ram_gb', return_value=16.0):
                with patch.object(scanner, '_get_vram_mb', return_value=8192):
                    footprint = scanner.scan()
                    assert footprint == {
                        "os_name": "Linux",
                        "cpu_cores": 8,
                        "total_ram_gb": 16.0,
                        "vram_mb": 8192,
                        "has_gpu": True
                    }

def test_scan_no_gpu(scanner):
    with patch.object(scanner, '_get_os_name', return_value='Windows'):
        with patch.object(scanner, '_get_cpu_cores', return_value=4):
            with patch.object(scanner, '_get_total_ram_gb', return_value=8.0):
                with patch.object(scanner, '_get_vram_mb', return_value=0):
                    footprint = scanner.scan()
                    assert footprint == {
                        "os_name": "Windows",
                        "cpu_cores": 4,
                        "total_ram_gb": 8.0,
                        "vram_mb": 0,
                        "has_gpu": False
                    }

def test_get_hardware_profile(scanner):
    assert scanner.get_hardware_profile({
        "total_ram_gb": 16.0,
        "vram_mb": 8192
    }) == "full_node"

    assert scanner.get_hardware_profile({
        "total_ram_gb": 16.0,
        "vram_mb": 4096
    }) == "edge"

    assert scanner.get_hardware_profile({
        "total_ram_gb": 8.0,
        "vram_mb": 0
    }) == "edge"

    assert scanner.get_hardware_profile({
        "total_ram_gb": 4.0,
        "vram_mb": 0
    }) == "tablet"

def test_get_hardware_profile_default(scanner):
    with patch.object(scanner, 'scan', return_value={
        "total_ram_gb": 32.0,
        "vram_mb": 16384
    }):
        assert scanner.get_hardware_profile() == "full_node"

def test_recommend_models(scanner):
    assert scanner.recommend_models({
        "has_gpu": True,
        "vram_mb": 16384,
        "total_ram_gb": 32.0
    }) == {
        "default": "llama3:8b",
        "coding": "codellama:7b",
        "reasoning": "mistral:7b"
    }

    assert scanner.recommend_models({
        "has_gpu": True,
        "vram_mb": 8192,
        "total_ram_gb": 16.0
    }) == {
        "default": "llama3:8b",
        "coding": "qwen2.5-coder:7b",
        "reasoning": "mistral:7b"
    }

    assert scanner.recommend_models({
        "has_gpu": False,
        "vram_mb": 0,
        "total_ram_gb": 16.0
    }) == {
        "default": "llama3:8b",
        "coding": "codellama:7b",
        "reasoning": "mistral:7b"
    }

    assert scanner.recommend_models({
        "has_gpu": False,
        "vram_mb": 0,
        "total_ram_gb": 8.0
    }) == {
        "default": "llama3:1b",
        "coding": "llama3:1b",
        "reasoning": "llama3:1b"
    }
