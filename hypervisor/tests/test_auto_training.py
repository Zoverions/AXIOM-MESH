import pytest
import os
from src.evolution.auto_training import ModificationPolicy, AutoTrainingLoop

def test_modification_policy_allowed():
    policy = ModificationPolicy()
    safe_code = """
def math_func():
    return 1 + 1
"""
    assert policy.evaluate(safe_code) is True

def test_modification_policy_forbidden_import():
    policy = ModificationPolicy()
    dangerous_code = """
import os
os.system("echo 'hack'")
"""
    assert policy.evaluate(dangerous_code) is False

def test_modification_policy_forbidden_call():
    policy = ModificationPolicy()
    dangerous_code = """
eval("1 + 1")
"""
    assert policy.evaluate(dangerous_code) is False

def test_auto_training_loop_automatic_approval():
    loop = AutoTrainingLoop(human_approval_required=False)
    assert loop._request_approval("some code", 0.5) is True

def test_auto_training_loop_human_approval_granted(monkeypatch):
    monkeypatch.setenv("AUTO_TRAINING_APPROVAL", "yes")
    loop = AutoTrainingLoop(human_approval_required=True)
    assert loop._request_approval("some code", 0.5) is True

def test_auto_training_loop_human_approval_denied(monkeypatch):
    monkeypatch.setenv("AUTO_TRAINING_APPROVAL", "no")
    loop = AutoTrainingLoop(human_approval_required=True)
    assert loop._request_approval("some code", 0.5) is False
