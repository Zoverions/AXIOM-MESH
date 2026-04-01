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


def test_write_env_new_file(tmp_path):
    """Test writing to a completely new .env file."""
    env_file = tmp_path / ".env"
    config = {
        "MACHINE_ROLE": "education-node",
        "LAUNCH_MODE": "local-mesh"
    }

    with patch("install.ENV_FILE", str(env_file)):
        install.write_env(config)

    assert env_file.exists()
    content = env_file.read_text()
    assert "# AXIOM-MESH Environment Configuration" in content
    assert "MACHINE_ROLE=education-node" in content
    assert "LAUNCH_MODE=local-mesh" in content


def test_write_env_existing_file(tmp_path):
    """Test appending/updating an existing .env file."""
    env_file = tmp_path / ".env"
    env_file.write_text("# AXIOM-MESH Environment Configuration\nOLD_VAR=123\nMACHINE_ROLE=shared-machine\n")

    config = {
        "MACHINE_ROLE": "education-node", # Should not override existing if not empty
        "LAUNCH_MODE": "local-mesh",      # Should be added
        "EMPTY_VAR": "new_value"          # Should override existing empty var
    }

    # Add an empty variable to existing file to test the override behavior
    with open(env_file, 'a') as f:
        f.write("EMPTY_VAR=\n")

    with patch("install.ENV_FILE", str(env_file)):
        install.write_env(config)

    content = env_file.read_text()
    assert "OLD_VAR=123" in content
    assert "MACHINE_ROLE=shared-machine" in content # Existing value is kept
    assert "LAUNCH_MODE=local-mesh" in content      # New value is added
    assert "EMPTY_VAR=new_value" in content         # Empty value is replaced
