import sys
import pytest
from unittest.mock import patch

# Need to ensure the script directory is in path so we can import install
sys.path.append('.')
import install

@patch('install.install_prereqs')
@patch('install.get_os')
@patch('builtins.print')
def test_main(mock_print, mock_get_os, mock_install_prereqs):
    """
    Test that main() correctly detects the OS and calls install_prereqs.
    We raise an exception in install_prereqs to halt execution and avoid side effects
    further down in the main function.
    """
    # Setup mock returns
    mock_get_os.return_value = 'linux'

    # We use a custom exception to stop main() from running the rest of the installer script
    class StopExecution(Exception):
        pass

    mock_install_prereqs.side_effect = StopExecution("Stop early")

    # Patch sys.argv to avoid argparse issues during test run
    with patch.object(sys, 'argv', ['install.py']):
        with pytest.raises(StopExecution):
            install.main()

    # Verify that get_os was called
    mock_get_os.assert_called_once()

    # Verify install_prereqs was called with the detected OS
    mock_install_prereqs.assert_called_once_with('linux')

    # Verify the correct print statements were executed
    mock_print.assert_any_call("Detected OS: linux")
