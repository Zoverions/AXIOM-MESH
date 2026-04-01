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

import subprocess

@patch('subprocess.run')
def test_run_cmd_success(mock_run):
    mock_run.return_value.stdout = " test output \n"

    assert install.run_cmd(["echo", "test"]) is True
    assert install.run_cmd(["echo", "test"], capture_output=True) == "test output"

@patch('subprocess.run')
def test_run_cmd_failure(mock_run):
    mock_run.side_effect = subprocess.CalledProcessError(1, "cmd")

    res = install.run_cmd(["invalid"])
    assert res in (None, False)

    assert install.run_cmd(["invalid"], capture_output=True) == ""
