import pytest
import sys
import os

# Ensure the hypervisor source directory is in the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from api.mcp_server import is_safe_code

def test_is_safe_code_valid():
    """Test that safe code passes the check."""
    code = "def add(a, b):\n    return a + b\n\nresult = add(1, 2)"
    assert is_safe_code(code) is True

def test_is_safe_code_syntax_error():
    """Test that code with syntax errors is flagged as unsafe."""
    code = "def add(a, b):\nreturn a + b"
    assert is_safe_code(code) is False

def test_is_safe_code_forbidden_import():
    """Test that importing a forbidden module directly is unsafe."""
    code = "import os\nos.system('echo hello')"
    assert is_safe_code(code) is False

def test_is_safe_code_forbidden_import_alias():
    """Test that importing a forbidden module with an alias is unsafe."""
    code = "import subprocess as sp"
    assert is_safe_code(code) is False

def test_is_safe_code_forbidden_from_import():
    """Test that using 'from' to import from a forbidden module is unsafe."""
    code = "from sys import exit\nexit(0)"
    assert is_safe_code(code) is False

def test_is_safe_code_forbidden_function_call():
    """Test that calling a forbidden built-in function is unsafe."""
    code = "eval('1 + 1')"
    assert is_safe_code(code) is False

def test_is_safe_code_forbidden_open_call():
    """Test that calling open() is unsafe."""
    code = "f = open('secret.txt', 'r')"
    assert is_safe_code(code) is False

def test_is_safe_code_allowed_import():
    """Test that importing allowed modules is safe."""
    code = "import math\nfrom datetime import datetime\nprint(math.pi)"
    assert is_safe_code(code) is True
