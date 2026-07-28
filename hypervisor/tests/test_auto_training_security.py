import pytest
from src.evolution.auto_training import ModificationPolicy

def test_modification_policy_security_bypasses():
    policy = ModificationPolicy()

    # 1. getattr bypass
    assert policy.evaluate("getattr(math, '__builtins__')") is False
    assert policy.evaluate("getattr(math, 'eval')") is False

    # 2. __builtins__ dictionary access
    assert policy.evaluate("__builtins__['eval']('1+1')") is False
    assert policy.evaluate("math.__builtins__['exec']('1+1')") is False

    # 3. Class traversal bypass
    assert policy.evaluate("(1).__class__.__base__.__subclasses__()") is False

    # 4. builtins import
    assert policy.evaluate("import builtins") is False

    # 5. compile call
    assert policy.evaluate("compile('1+1', '', 'eval')") is False

    # 6. locals/globals
    assert policy.evaluate("globals()['eval']('1')") is False
    assert policy.evaluate("locals()['eval']('1')") is False

    # 7. __dict__ traversal
    assert policy.evaluate("math.__dict__['__builtins__']") is False

    # 8. __globals__ escape
    assert policy.evaluate("(lambda: 0).__globals__['__builtins__']['eval']('...')") is False
