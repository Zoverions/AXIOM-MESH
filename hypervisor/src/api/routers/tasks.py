from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio
from typing import Optional
import hashlib
import hmac
import os
import shlex
import time
import uuid
from src.orchestrator.task_scheduler import global_scheduler

router = APIRouter(prefix="/tasks", tags=["tasks"])
NONCE_CACHE: set[str] = set()
MAX_SKEW_MS = int(os.getenv("TASK_SIGNATURE_MAX_SKEW_MS", "300000"))
EXEC_TIMEOUT_SECS = int(os.getenv("TASK_EXEC_TIMEOUT_SECS", "30"))
ALLOWED_SCHEDULED_COMMANDS = {
    cmd.strip()
    for cmd in os.getenv("ALLOWED_SCHEDULED_COMMANDS", "echo,python3,python").split(",")
    if cmd.strip()
}


def _get_scheduler_signing_key() -> str:
    key = os.getenv("TASK_SCHEDULER_SIGNING_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="TASK_SCHEDULER_SIGNING_KEY is not configured")
    return key


def _verify_schedule_signature(request: "ScheduleRequest") -> None:
    if not request.command:
        return
    if request.timestamp_ms is None or not request.nonce or not request.signature:
        raise HTTPException(status_code=403, detail="Missing signature fields for scheduled command")

    now_ms = int(time.time() * 1000)
    if abs(now_ms - request.timestamp_ms) > MAX_SKEW_MS:
        raise HTTPException(status_code=403, detail="Signature timestamp outside allowed skew")

    if request.nonce in NONCE_CACHE:
        raise HTTPException(status_code=403, detail="Replay detected for scheduled command")

    signing_key = _get_scheduler_signing_key()
    canonical = f"{request.name}:{request.interval}:{request.is_recurring}:{request.command}:{request.timestamp_ms}:{request.nonce}"
    expected = hmac.new(signing_key.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.signature):
        raise HTTPException(status_code=403, detail="Invalid command signature")

    NONCE_CACHE.add(request.nonce)
    if len(NONCE_CACHE) > 10000:
        NONCE_CACHE.clear()

class ScheduleRequest(BaseModel):
    name: str
    interval: int
    is_recurring: bool = True
    command: Optional[str] = None
    timestamp_ms: Optional[int] = None
    nonce: Optional[str] = None
    signature: Optional[str] = None

@router.post("/schedule")
async def schedule_task(request: ScheduleRequest):
    try:
        _verify_schedule_signature(request)
        # Define a closure that will execute the requested command
        async def dynamic_task():
            if not request.command:
                print(f"[TaskScheduler] Executing dynamically scheduled task '{request.name}' (no command provided)")
                return

            print(f"[TaskScheduler] Executing dynamically scheduled task '{request.name}': {request.command}")
            try:
                args = shlex.split(request.command)
                if not args:
                    raise ValueError("Empty command")
                binary = os.path.basename(args[0])
                if binary not in ALLOWED_SCHEDULED_COMMANDS:
                    raise ValueError(f"Command '{binary}' is not allowlisted")

                process = await asyncio.create_subprocess_exec(
                    *args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=EXEC_TIMEOUT_SECS)

                if process.returncode == 0:
                    print(f"[TaskScheduler] Task '{request.name}' executed successfully. audit_event={uuid.uuid4()}")
                    if stdout:
                        print(f"[TaskScheduler] Output:\n{stdout.decode().strip()}")
                else:
                    print(f"[TaskScheduler] Task '{request.name}' failed with code {process.returncode}.")
                    if stderr:
                        print(f"[TaskScheduler] Error:\n{stderr.decode().strip()}")
            except asyncio.TimeoutError:
                print(f"[TaskScheduler] Task '{request.name}' exceeded timeout of {EXEC_TIMEOUT_SECS}s.")
            except Exception as e:
                print(f"[TaskScheduler] Exception running task '{request.name}': {e}")

        global_scheduler.add_task(
            name=request.name,
            interval=request.interval,
            func=dynamic_task,
            is_recurring=request.is_recurring
        )
        return {"status": "scheduled", "task_name": request.name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/")
async def list_tasks():
    try:
        tasks = global_scheduler.get_tasks()
        return {"status": "success", "tasks": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{name}")
async def delete_task(name: str):
    try:
        global_scheduler.remove_task(name)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
