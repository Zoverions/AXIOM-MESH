"""Lightweight compatibility shim for environments without the websockets package."""


def connect(*args, **kwargs):
    raise RuntimeError("websockets dependency is not installed")
