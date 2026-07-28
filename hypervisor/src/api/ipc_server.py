import asyncio
import json
import logging
import os
import tempfile
from src.engine.context_engine import enforce_context_cap

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SOCKET_PATH = os.path.join(tempfile.gettempdir(), "axiom_mesh.sock")

async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    logger.info("New IPC connection established.")
    try:
        while True:
            data = await reader.readline()
            if not data:
                break

            try:
                # Expecting normalized JSON Intent Object
                intent = json.loads(data.decode('utf-8'))
                text_input = intent.get('content') or intent.get('input') or ''

                # Apply the strict context cap
                validated_output = enforce_context_cap(text_input, max_tokens=8192)

                print(f"Validated Intent Output:\n{validated_output}")

                # Optionally send response back
                response = {"status": "success", "processed_length": len(validated_output)}
                writer.write((json.dumps(response) + "\\n").encode('utf-8'))
                await writer.drain()
            except json.JSONDecodeError:
                logger.error("Failed to decode incoming intent as JSON.")

    except asyncio.CancelledError:
        pass
    finally:
        logger.info("IPC connection closed.")
        writer.close()
        await writer.wait_closed()

async def start_ipc_server():
    # Remove the socket file if it already exists
    if os.path.exists(SOCKET_PATH):
        os.remove(SOCKET_PATH)

    server = await asyncio.start_unix_server(handle_client, path=SOCKET_PATH)

    # Ensure proper permissions if needed, here we just let the OS handle default
    logger.info(f"IPC Server listening on {SOCKET_PATH}")

    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(start_ipc_server())
    except KeyboardInterrupt:
        logger.info("IPC Server stopped by user.")
