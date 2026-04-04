import logging
import os
import signal

logger = logging.getLogger(__name__)

class KillSwitchClient:
    @staticmethod
    def trigger_kill(pid: int):
        logger.info(f"Triggering kill for PID {pid}")
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            logger.warning(f"Process {pid} not found for SIGKILL.")
