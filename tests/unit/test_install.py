import pytest
import sys
import os
import time
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))
from install import prompt_with_timeout

def test_prompt_with_timeout_user_input():
    with patch('builtins.input', return_value='my_input'):
        result = prompt_with_timeout("Test prompt", "default_value", timeout=1)
        assert result == 'my_input'

def test_prompt_with_timeout_empty_input():
    with patch('builtins.input', return_value='   '):
        result = prompt_with_timeout("Test prompt", "default_value", timeout=1)
        assert result == 'default_value'

def test_prompt_with_timeout_reached():
    def slow_input():
        time.sleep(0.5)
        return "too_late"

    with patch('builtins.input', side_effect=slow_input):
        result = prompt_with_timeout("Test prompt", "default_value", timeout=0.1)
        assert result == 'default_value'

def test_prompt_with_timeout_eof():
    with patch('builtins.input', side_effect=EOFError):
        result = prompt_with_timeout("Test prompt", "default_value", timeout=1)
        assert result == 'default_value'
