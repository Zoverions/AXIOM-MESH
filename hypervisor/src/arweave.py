"""Compatibility shim for tests that patch arweave symbols."""


class Wallet:
    def __init__(self, *args, **kwargs):
        pass


class Transaction:
    def __init__(self, *args, **kwargs):
        self.id = ""

    def add_tag(self, *args, **kwargs):
        return None

    def sign(self):
        return None

    def to_dict(self):
        return {}
