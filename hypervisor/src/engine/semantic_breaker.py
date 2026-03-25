import json
import socket
import logging

logger = logging.getLogger(__name__)

class SemanticBreaker:
    def __init__(self, socket_path: str = "/tmp/axiom_airgap.sock"):
        self.socket_path = socket_path

    def _sever_transaction(self, pid: int) -> bool:
        """
        Sends a command to the Rust Sandbox daemon via UDS to kill the process.
        """
        try:
            client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            client.connect(self.socket_path)

            payload = {
                "action": "kill",
                "pid": pid
            }
            client.sendall((json.dumps(payload) + "\n").encode('utf-8'))

            response = client.recv(1024).decode('utf-8').strip()
            client.close()

            if response == "ok":
                logger.info(f"Successfully severed transaction for PID {pid}")
                return True
            else:
                logger.error(f"Failed to sever transaction for PID {pid}: {response}")
                return False
        except Exception as e:
            logger.error(f"IPC call to sandbox network daemon failed: {e}")
            return False
