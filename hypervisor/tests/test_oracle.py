import pytest
import asyncio
from unittest.mock import patch, MagicMock
from src.engine.oracle import ChainlinkOracle
import httpx

@pytest.fixture
def oracle():
    return ChainlinkOracle()

@pytest.mark.asyncio
async def test_fetch_data_feed_no_endpoint(oracle):
    oracle.oracle_endpoint = ""
    result = await oracle.fetch_data_feed("what is the eth price")
    assert result == ""

@pytest.mark.asyncio
async def test_fetch_data_feed_unknown_query(oracle):
    oracle.oracle_endpoint = "http://fake-oracle"
    result = await oracle.fetch_data_feed("who won the super bowl")
    assert result == ""

@pytest.mark.asyncio
async def test_fetch_data_feed_success(oracle):
    oracle.oracle_endpoint = "http://fake-oracle"

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"value": "2000", "timestamp": "1234567890"}

    with patch("httpx.AsyncClient.get", return_value=mock_response):
        result = await oracle.fetch_data_feed("what is the eth price")

    assert "eth-usd" in result
    assert "2000" in result
    assert "1234567890" in result

@pytest.mark.asyncio
async def test_fetch_data_feed_failure(oracle):
    oracle.oracle_endpoint = "http://fake-oracle"

    with patch("httpx.AsyncClient.get", side_effect=Exception("Connection Error")):
        result = await oracle.fetch_data_feed("what is the btc price")

    assert "btc-usd" in result
    assert "Failed to fetch verifiable data" in result
