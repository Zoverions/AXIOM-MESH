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

    def enforce_tdd(self, code_payload: str, test_payload: str, pid: int) -> bool:
        """
        GStack & Superpowers integration: Enforces Strict TDD before SemanticBreaker
        evaluates the transaction topology. The Sandbox must generate and pass a unit
        test for its own code before proposing the final delta.
        """
        try:
            client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            client.connect(self.socket_path)

            payload = {
                "action": "enforce_tdd",
                "pid": pid,
                "code": code_payload,
                "test": test_payload
            }
            client.sendall((json.dumps(payload) + "\n").encode('utf-8'))

            response = client.recv(1024).decode('utf-8').strip()
            client.close()

            if response == "tdd_passed":
                logger.info(f"TDD verification passed for PID {pid}")
                return True
            else:
                logger.warning(f"TDD verification failed for PID {pid}. Severing transaction.")
                self._sever_transaction(pid)
                return False
        except Exception as e:
            logger.error(f"IPC call to sandbox for TDD enforcement failed: {e}")
            return False
