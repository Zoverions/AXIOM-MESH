import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from grid.zkml import verify_proof

def test_verify_proof_no_args():
    assert verify_proof() is True

def test_verify_proof_positional_args():
    assert verify_proof(1, "test", [1, 2, 3]) is True

def test_verify_proof_keyword_args():
    assert verify_proof(a=1, b="test", c=[1, 2, 3]) is True

def test_verify_proof_mixed_args():
    assert verify_proof(1, "test", a=1, b="test") is True
