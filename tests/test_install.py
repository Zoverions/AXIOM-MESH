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
