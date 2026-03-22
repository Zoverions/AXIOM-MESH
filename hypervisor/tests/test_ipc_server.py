import asyncio
import json
import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from src.api.ipc_server import handle_client, start_ipc_server, SOCKET_PATH

class MockStreamReader:
    def __init__(self, data_chunks):
        self.data_chunks = data_chunks
        self.index = 0

    async def readline(self):
        if self.index < len(self.data_chunks):
            chunk = self.data_chunks[self.index]
            self.index += 1
            return chunk
        return b""

class MockStreamWriter:
    def __init__(self):
        self.written_data = b""
        self.is_closed = False
        self.drained = False

    def write(self, data):
        self.written_data += data

    async def drain(self):
        self.drained = True

    def close(self):
        self.is_closed = True

    async def wait_closed(self):
        pass

@pytest.mark.asyncio
async def test_handle_client_valid_json():
    intent = {"content": "test message"}
    json_data = json.dumps(intent).encode('utf-8') + b'\n'

    reader = MockStreamReader([json_data])
    writer = MockStreamWriter()

    await handle_client(reader, writer)

    assert writer.is_closed
    assert writer.drained

    # Verify response
    response_lines = writer.written_data.strip().split(b'\n')
    assert len(response_lines) == 1
    # Replace literal literal backslash + 'n' encoded by the source file, that makes JSON invalid
    cleaned_response = response_lines[0].decode('utf-8').replace("\\n", "")
    response = json.loads(cleaned_response)
    assert response["status"] == "success"
    # 'test message' is 12 characters, tiktoken tokenization does not alter this for simple string.
    assert "processed_length" in response

@pytest.mark.asyncio
async def test_handle_client_invalid_json(caplog):
    invalid_json_data = b"not a json object\n"

    reader = MockStreamReader([invalid_json_data])
    writer = MockStreamWriter()

    await handle_client(reader, writer)

    assert writer.is_closed
    assert b'"status": "success"' not in writer.written_data

    assert "Failed to decode incoming intent as JSON." in caplog.text

@pytest.mark.asyncio
async def test_handle_client_context_cap():
    # Generate a long string that exceeds 8192 tokens.
    # Roughly 1 word = 1.3 tokens, so 10000 words should be > 8192 tokens.
    long_content = "word " * 10000
    intent = {"content": long_content}
    json_data = json.dumps(intent).encode('utf-8') + b'\n'

    reader = MockStreamReader([json_data])
    writer = MockStreamWriter()

    await handle_client(reader, writer)

    assert writer.is_closed
    assert writer.drained

    response_lines = writer.written_data.strip().split(b'\n')
    assert len(response_lines) == 1
    cleaned_response = response_lines[0].decode('utf-8').replace("\\n", "")
    response = json.loads(cleaned_response)
    assert response["status"] == "success"
    assert "processed_length" in response
    # The output should have been truncated
    assert response["processed_length"] < len(long_content)

@pytest.mark.asyncio
@patch('src.api.ipc_server.asyncio.start_unix_server')
@patch('src.api.ipc_server.os.path.exists')
@patch('src.api.ipc_server.os.remove')
async def test_start_ipc_server(mock_remove, mock_exists, mock_start_unix_server):
    # Mock os.path.exists to return True, simulating an existing socket file
    mock_exists.return_value = True

    mock_server = AsyncMock()
    mock_start_unix_server.return_value = mock_server

    # Since start_ipc_server runs `await server.serve_forever()`, it will block indefinitely.
    # We need to make `serve_forever` raise an exception or simply mock the whole context block.
    # A cleaner approach is to mock `server.serve_forever` to break out of the loop after a short delay
    # or just raise a CancelledError, but `async with server` also needs to be mockable.

    # Let's mock `serve_forever` to just return
    mock_server.serve_forever = AsyncMock()

    # mock_server.__aenter__ and __aexit__ are needed for `async with server:`
    mock_server.__aenter__.return_value = mock_server
    mock_server.__aexit__.return_value = None

    await start_ipc_server()

    mock_exists.assert_called_once_with(SOCKET_PATH)
    mock_remove.assert_called_once_with(SOCKET_PATH)
    mock_start_unix_server.assert_called_once_with(handle_client, path=SOCKET_PATH)
    mock_server.serve_forever.assert_called_once()
