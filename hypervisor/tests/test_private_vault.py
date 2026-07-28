import pytest
from unittest.mock import patch
from src.memory.PrivateVault import PrivateVault

class MockContextEngine:
    pass

class MockPrivacyRouter:
    pass

@patch("src.memory.PrivateVault.PrivacyRouter")
def test_get_encryption_key_raises_error_when_secret_missing(mock_privacy_router):
    with patch("src.core.secrets.SecretManager.get_secret", return_value=None):
        context_engine = MockContextEngine()
        vault = PrivateVault(context_engine)

        with pytest.raises(RuntimeError, match="CRITICAL: VAULT_MASTER_KEY must be securely configured"):
            vault.get_encryption_key("did:example:123")

@patch("src.memory.PrivateVault.PrivacyRouter")
def test_get_encryption_key_success(mock_privacy_router):
    with patch("src.core.secrets.SecretManager.get_secret", return_value="secure_master_secret"):
        context_engine = MockContextEngine()
        vault = PrivateVault(context_engine)

        key = vault.get_encryption_key("did:example:123")
        assert key == "did:example:123:secure_master_secret"
