import pytest
from unittest.mock import patch
import sys
import os

# Add the project root to the python path so `install` module can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from install import install_prereqs

def test_install_prereqs_all_met():
    """Test when all prerequisites are met."""
    with patch("shutil.which", return_value="/usr/bin/mocked") as mock_which, \
         patch("install.run_cmd") as mock_run_cmd:
        install_prereqs("linux")
        mock_which.assert_any_call("docker")
        mock_which.assert_any_call("make")
        mock_which.assert_any_call("node")

        # Only python dependencies should be installed at the end (pip upgrade + deps install)
        assert mock_run_cmd.call_count == 2

def test_install_prereqs_missing():
    """Test when a prerequisite is missing (docker) to ensure installation logic triggers."""
    def mock_which(cmd):
        if cmd == "docker":
            return None
        return "/usr/bin/mocked"

    with patch("shutil.which", side_effect=mock_which) as mock_which, \
         patch("install.run_cmd") as mock_run_cmd:
        install_prereqs("macos")

        # Missing package should trigger missing installation logic
        # run_cmd will be called for 'docker' cask installation + 2 python dep commands
        assert mock_run_cmd.call_count > 2

def test_install_prereqs_windows_choco_missing():
    """Test when Windows is the OS but choco is missing."""
    def mock_which(cmd):
        # Even if docker is missing, if choco is missing on windows it returns early
        return None

    with patch("shutil.which", side_effect=mock_which) as mock_which, \
         patch("install.run_cmd") as mock_run_cmd:
        install_prereqs("windows")

        # It should return early and not run python dependencies installation at all
        assert mock_run_cmd.call_count == 0
