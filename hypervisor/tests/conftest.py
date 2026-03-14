import os
import sys

TESTS_DIR = os.path.dirname(__file__)
HYPERVISOR_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))
SRC_DIR = os.path.join(HYPERVISOR_ROOT, "src")

for path in (HYPERVISOR_ROOT, SRC_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)
