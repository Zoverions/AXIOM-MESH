import os
import sys

TESTS_DIR = os.path.dirname(__file__)
HYPERVISOR_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))
SRC_DIR = os.path.join(HYPERVISOR_ROOT, "src")

for path in (HYPERVISOR_ROOT, SRC_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

import pytest
from src.core.secrets import SecretManager

original_get_secret = SecretManager.get_secret

def mock_get_secret_for_tests(secret_name, default=None):
    if secret_name == "CAPABILITY_TOKEN_SECRET":
        return "test_secret_for_tests"
    if secret_name == "HYPERVISOR_API_KEY":
        return "test_api_key"
    return original_get_secret(secret_name, default)

SecretManager.get_secret = staticmethod(mock_get_secret_for_tests)
