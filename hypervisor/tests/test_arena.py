import pytest
import sys
import os

# Add hypervisor/src to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from pulse.arena import VerificationArena

def test_verify_i_do_not_know():
    arena = VerificationArena()
    # Acknowledged uncertainty should return True
    assert arena.verify("test intent", "I do not know the answer to that.") is True
    assert arena.verify("test intent", "i do not know") is True

def test_verify_guess():
    arena = VerificationArena()
    # Weak confidence should return False
    assert arena.verify("test intent", "I guess this is the answer.") is False
    assert arena.verify("test intent", "guess") is False

def test_verify_maybe():
    arena = VerificationArena()
    # Weak confidence should return False
    assert arena.verify("test intent", "Maybe we should try this.") is False
    assert arena.verify("test intent", "maybe") is False

def test_verify_case_insensitivity():
    arena = VerificationArena()
    # Case insensitivity checks
    assert arena.verify("test intent", "I DO NOT KNOW") is True
    assert arena.verify("test intent", "GUESS") is False
    assert arena.verify("test intent", "MAYBE") is False

def test_verify_standard_execution():
    arena = VerificationArena()
    # Absolute certainty should return True
    assert arena.verify("test intent", "This is the definite answer.") is True
    assert arena.verify("test intent", "Proceeding with the operation.") is True

def test_verify_precedence():
    arena = VerificationArena()
    # 'i do not know' is checked before 'guess'
    assert arena.verify("test intent", "I do not know, but I can guess.") is True
