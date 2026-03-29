import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

from services.provision.provision_service import generate_qr_code

@patch('services.provision.provision_service.qrcode.QRCode')
@patch('services.provision.provision_service.Path')
def test_generate_qr_code(mock_path_class, mock_qrcode_class):
    # Setup mocks
    mock_qr_instance = MagicMock()
    mock_qrcode_class.return_value = mock_qr_instance

    mock_img = MagicMock()
    mock_qr_instance.make_image.return_value = mock_img

    mock_path_instance = MagicMock()
    mock_path_class.return_value = mock_path_instance

    # Mock the / operator for Path
    mock_filepath = MagicMock()
    mock_path_instance.__truediv__.return_value = mock_filepath
    mock_filepath.__str__.return_value = "/tmp/axiom_qr_codes/token_123.png"

    # Call function
    result = generate_qr_code("test_data", "token_123")

    # Assertions
    mock_path_class.assert_called_with("/tmp/axiom_qr_codes")
    mock_path_instance.mkdir.assert_called_with(exist_ok=True)

    mock_qrcode_class.assert_called_once()
    mock_qr_instance.add_data.assert_called_with("test_data")
    mock_qr_instance.make.assert_called_with(fit=True)
    mock_qr_instance.make_image.assert_called_with(fill_color="black", back_color="white")

    mock_img.save.assert_called_once_with(mock_filepath)

    assert result == "/tmp/axiom_qr_codes/token_123.png"
