import os
import sys
import pytest
from unittest.mock import patch

# Need to import install.py from the root directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import install

@pytest.mark.parametrize("mock_system, mock_environ, expected", [
    ('Linux', {}, 'linux'),
    ('Linux', {'PREFIX': '/data/data/com.termux/files/usr'}, 'android'),
    ('Darwin', {}, 'macos'),
    ('Windows', {}, 'windows'),
])
def test_get_os(mock_system, mock_environ, expected):
    """Test get_os identifies the correct OS from platform.system and os.environ."""
    with patch('platform.system', return_value=mock_system):
        with patch.dict(os.environ, mock_environ, clear=True):
            assert install.get_os() == expected


@pytest.mark.parametrize(
    "base_role,capsule,monitor,os_type,expected",
    [
        ("shared-machine", "capsule", None, "linux", "shared-machine"),
        ("shared-machine", "skill-pill", None, "linux", "minimal-edge"),
        ("shared-machine", "capsule-plus", None, "linux", "education-node"),
        ("shared-machine", "capsule", "dedicated-mesh", "linux", "dedicated-mesh"),
        ("shared-machine", "capsule", None, "android", "minimal-edge"),
        ("shared-machine", "capsule", "education-node", "android", "education-node"),
    ],
)
def test_resolve_machine_role(base_role, capsule, monitor, os_type, expected):
    assert install.resolve_machine_role(base_role, capsule, monitor, os_type) == expected


def test_normalize_choice_falls_back_to_default():
    assert install.normalize_choice("unknown", ["a", "b"], "a", "test label") == "a"


@pytest.mark.parametrize(
    "available,expected",
    [
        ({"apt-get": "/usr/bin/apt-get"}, "apt-get"),
        ({"dnf": "/usr/bin/dnf"}, "dnf"),
        ({}, None),
    ],
)
def test_detect_linux_package_manager(available, expected):
    def fake_which(name):
        return available.get(name)

    with patch("shutil.which", side_effect=fake_which):
        assert install.detect_linux_package_manager() == expected

def test_prompt_with_timeout_early_input():
    with patch("builtins.input", return_value="my_input"):
        assert install.prompt_with_timeout("Test prompt", "default", timeout=2) == "my_input"

def test_prompt_with_timeout_eof():
    with patch("builtins.input", side_effect=EOFError):
        assert install.prompt_with_timeout("Test prompt", "default", timeout=0.1) == "default"

def test_prompt_with_timeout_timeout():
    import time
    def slow_input():
        time.sleep(0.5)
        return "late_input"
    with patch("builtins.input", side_effect=slow_input):
        assert install.prompt_with_timeout("Test prompt", "default", timeout=0.1) == "default"

def test_prompt_with_timeout_empty_string():
    with patch("builtins.input", return_value="   "):
        assert install.prompt_with_timeout("Test prompt", "default", timeout=0.1) == "default"
