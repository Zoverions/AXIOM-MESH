import pytest
from services.provision.provision_service import generate_secure_token

def test_generate_secure_token():
    """Test generating a cryptographically secure token."""
    # Test generation
    token1 = generate_secure_token()
    token2 = generate_secure_token()

    # Assert tokens are generated
    assert isinstance(token1, str)
    assert isinstance(token2, str)

    # Assert tokens are non-empty
    assert len(token1) > 0
    assert len(token2) > 0

    # Assert tokens have sufficient length (urlsafe 32 bytes should be ~43 chars)
    assert len(token1) >= 43

    # Assert tokens are unique (randomly generated)
    assert token1 != token2

    # Assert token format (urlsafe base64 contains no + or /)
    assert '+' not in token1
    assert '/' not in token1
