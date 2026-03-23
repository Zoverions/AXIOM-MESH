from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import asyncio
from typing import Dict, Any, List, Optional
from src.orchestrator.task_scheduler import global_scheduler

router = APIRouter(prefix="/tasks", tags=["tasks"])

class ScheduleRequest(BaseModel):
    name: str
    interval: int
    is_recurring: bool = True
    command: Optional[str] = None # Will be parsed / ran if present. For now we just mock.

@router.post("/schedule")
async def schedule_task(request: ScheduleRequest):
    try:
        # Define a closure that will execute the requested command
        async def dynamic_task():
            print(f"[TaskScheduler] Executing dynamically scheduled task '{request.name}': {request.command}")

        global_scheduler.add_task(
            name=request.name,
            interval=request.interval,
            func=dynamic_task,
            is_recurring=request.is_recurring
        )
        return {"status": "scheduled", "task_name": request.name}
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
