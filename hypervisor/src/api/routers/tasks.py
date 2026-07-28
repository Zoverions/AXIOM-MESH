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
import json
from datetime import datetime, timezone
from src.orchestrator.task_scheduler import global_scheduler
from src.graph.resource_balancer import analyze_metrics, evaluate_route

router = APIRouter(prefix="/tasks", tags=["tasks"])
NONCE_CACHE: set[str] = set()
MAX_SKEW_MS = int(os.getenv("TASK_SIGNATURE_MAX_SKEW_MS", "300000"))
EXEC_TIMEOUT_SECS = int(os.getenv("TASK_EXEC_TIMEOUT_SECS", "30"))
ALLOWED_SCHEDULED_COMMANDS = {
    cmd.strip()
    for cmd in os.getenv("ALLOWED_SCHEDULED_COMMANDS", "echo,python3,python").split(",")
    if cmd.strip()
}
ALLOWED_AUTONOMY_LEVELS = {"manual", "assisted", "supervised", "autonomous"}
ALLOWED_RISK_CLASSES = {"low", "medium", "high", "critical"}
HIGH_RISK_CLASSES = {"high", "critical"}
GLOBAL_FLEET_SCOPES = {"global", "national"}
HIGH_RISK_APPROVAL_MIN = int(os.getenv("HIGH_RISK_APPROVAL_MIN", "2"))
EMBODIED_GUARDRAIL_AUDIT_LOG = os.getenv("EMBODIED_GUARDRAIL_AUDIT_LOG", "logs/embodied_guardrails.audit.log")
GOVERNANCE_EVENT_AUDIT_LOG = os.getenv("GOVERNANCE_EVENT_AUDIT_LOG", "logs/governance_events.audit.log")
EMERGENCY_HALT_FILE = os.getenv("EMERGENCY_HALT_FILE", "/tmp/axiom_emergency_halt")
SENTIENCE_UNCERTAINTY_THRESHOLD = float(os.getenv("SENTIENCE_UNCERTAINTY_THRESHOLD", "0.7"))
ESCALATION_BOARD_MIN_MEMBERS = int(os.getenv("ESCALATION_BOARD_MIN_MEMBERS", "3"))


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
    priority_tag: str = "default"
    timestamp_ms: Optional[int] = None
    nonce: Optional[str] = None
    signature: Optional[str] = None
    autonomy_level: str = "manual"
    risk_class: str = "low"
    required_approvals: int = 0
    fleet_scope: str = "community"
    allowed_geofences: list[str] = []
    current_geofence: Optional[str] = None
    allowed_tools: list[str] = []
    requested_tool: Optional[str] = None
    allowed_time_windows_utc: list[str] = []
    requested_force_newtons: Optional[float] = None
    max_force_newtons: Optional[float] = None
    sentience_uncertainty_score: Optional[float] = None
    sentience_trigger: Optional[str] = None
    escalation_board: list[str] = []
    protected_mode: bool = False
    approval_trace_id: Optional[str] = None
    policy_evidence_ref: Optional[str] = None
    incident_drill_id: Optional[str] = None


def _emit_guardrail_audit_event(event_type: str, task_name: str, status: str, details: dict) -> None:
    event = {
        "event_id": str(uuid.uuid4()),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "task_name": task_name,
        "status": status,
        "details": details,
    }
    print(f"[EmbodiedGuardrails] {json.dumps(event, sort_keys=True)}")
    try:
        os.makedirs(os.path.dirname(EMBODIED_GUARDRAIL_AUDIT_LOG), exist_ok=True)
        with open(EMBODIED_GUARDRAIL_AUDIT_LOG, "a", encoding="utf-8") as audit_file:
            audit_file.write(json.dumps(event, sort_keys=True) + "\n")
    except Exception as exc:
        print(f"[EmbodiedGuardrails] audit-log-write-failed task={task_name} error={exc}")


def _emit_governance_event(event_type: str, task_name: str, status: str, details: dict) -> None:
    event = {
        "event_id": str(uuid.uuid4()),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "task_name": task_name,
        "status": status,
        "details": details,
    }
    print(f"[GovernanceEvents] {json.dumps(event, sort_keys=True)}")
    try:
        os.makedirs(os.path.dirname(GOVERNANCE_EVENT_AUDIT_LOG), exist_ok=True)
        with open(GOVERNANCE_EVENT_AUDIT_LOG, "a", encoding="utf-8") as audit_file:
            audit_file.write(json.dumps(event, sort_keys=True) + "\n")
    except Exception as exc:
        print(f"[GovernanceEvents] audit-log-write-failed task={task_name} error={exc}")


def _is_emergency_halt_triggered() -> bool:
    env_halt = os.getenv("EMBODIED_EMERGENCY_HALT", "").strip().lower()
    if env_halt in {"1", "true", "yes", "on"}:
        return True
    return os.path.exists(EMERGENCY_HALT_FILE)


def _window_contains_current_utc(window: str) -> bool:
    try:
        start_raw, end_raw = window.split("-", maxsplit=1)
        start_hour, start_minute = [int(part) for part in start_raw.split(":", maxsplit=1)]
        end_hour, end_minute = [int(part) for part in end_raw.split(":", maxsplit=1)]
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid allowed_time_windows_utc window '{window}'")

    now = datetime.now(timezone.utc)
    now_minutes = now.hour * 60 + now.minute
    start_minutes = start_hour * 60 + start_minute
    end_minutes = end_hour * 60 + end_minute

    if start_minutes <= end_minutes:
        return start_minutes <= now_minutes <= end_minutes
    # Overnight window e.g. 22:00-05:00
    return now_minutes >= start_minutes or now_minutes <= end_minutes


def _enforce_fleet_autonomy_policy(request: "ScheduleRequest") -> None:
    if request.autonomy_level not in ALLOWED_AUTONOMY_LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid autonomy_level '{request.autonomy_level}'")

    if request.risk_class not in ALLOWED_RISK_CLASSES:
        raise HTTPException(status_code=400, detail=f"Invalid risk_class '{request.risk_class}'")

    if request.required_approvals < 0:
        raise HTTPException(status_code=400, detail="required_approvals must be >= 0")

    if request.risk_class in HIGH_RISK_CLASSES and request.required_approvals < HIGH_RISK_APPROVAL_MIN:
        raise HTTPException(
            status_code=403,
            detail=(
                f"risk_class '{request.risk_class}' requires at least {HIGH_RISK_APPROVAL_MIN} approvals"
            ),
        )

    if request.autonomy_level == "autonomous" and request.required_approvals == 0:
        raise HTTPException(status_code=403, detail="autonomous tasks require non-zero required_approvals")


def _enforce_embodied_guardrails(request: "ScheduleRequest") -> None:
    if _is_emergency_halt_triggered():
        _emit_guardrail_audit_event(
            "emergency_halt",
            request.name,
            "blocked",
            {"reason": "Independent emergency halt active"},
        )
        raise HTTPException(status_code=503, detail="Emergency halt active: embodied actions are paused")

    if request.allowed_geofences:
        if not request.current_geofence:
            raise HTTPException(status_code=400, detail="current_geofence is required when allowed_geofences is set")
        if request.current_geofence not in request.allowed_geofences:
            _emit_guardrail_audit_event(
                "geofence",
                request.name,
                "blocked",
                {"allowed_geofences": request.allowed_geofences, "current_geofence": request.current_geofence},
            )
            raise HTTPException(status_code=403, detail="Task current_geofence is outside allowed_geofences policy")

    if request.allowed_tools and request.requested_tool and request.requested_tool not in request.allowed_tools:
        _emit_guardrail_audit_event(
            "tool_constraint",
            request.name,
            "blocked",
            {"allowed_tools": request.allowed_tools, "requested_tool": request.requested_tool},
        )
        raise HTTPException(status_code=403, detail="requested_tool is outside allowed_tools policy")

    if request.allowed_time_windows_utc:
        if not any(_window_contains_current_utc(window) for window in request.allowed_time_windows_utc):
            _emit_guardrail_audit_event(
                "time_constraint",
                request.name,
                "blocked",
                {"allowed_time_windows_utc": request.allowed_time_windows_utc},
            )
            raise HTTPException(status_code=403, detail="Task is outside allowed_time_windows_utc policy")

    if request.requested_force_newtons is not None:
        if request.requested_force_newtons < 0:
            raise HTTPException(status_code=400, detail="requested_force_newtons must be >= 0")
        if request.max_force_newtons is None:
            raise HTTPException(status_code=400, detail="max_force_newtons is required when requested_force_newtons is set")
        if request.max_force_newtons < 0:
            raise HTTPException(status_code=400, detail="max_force_newtons must be >= 0")
        if request.requested_force_newtons > request.max_force_newtons:
            _emit_guardrail_audit_event(
                "force_constraint",
                request.name,
                "blocked",
                {
                    "requested_force_newtons": request.requested_force_newtons,
                    "max_force_newtons": request.max_force_newtons,
                },
            )
            raise HTTPException(status_code=403, detail="requested_force_newtons exceeds max_force_newtons policy")

    _emit_guardrail_audit_event(
        "guardrail_validation",
        request.name,
        "passed",
        {
            "fleet_scope": request.fleet_scope,
            "autonomy_level": request.autonomy_level,
            "risk_class": request.risk_class,
        },
    )


def _enforce_sentience_uncertainty_protocol(request: "ScheduleRequest") -> None:
    if request.sentience_uncertainty_score is not None:
        if request.sentience_uncertainty_score < 0 or request.sentience_uncertainty_score > 1:
            raise HTTPException(status_code=400, detail="sentience_uncertainty_score must be between 0 and 1")

    score_triggered = (
        request.sentience_uncertainty_score is not None
        and request.sentience_uncertainty_score >= SENTIENCE_UNCERTAINTY_THRESHOLD
    )
    explicit_triggered = bool(request.sentience_trigger and request.sentience_trigger.strip())
    if not score_triggered and not explicit_triggered:
        return

    details = {
        "sentience_uncertainty_score": request.sentience_uncertainty_score,
        "sentience_trigger": request.sentience_trigger,
        "threshold": SENTIENCE_UNCERTAINTY_THRESHOLD,
        "protected_mode": request.protected_mode,
        "escalation_board_size": len(request.escalation_board),
    }
    if not request.protected_mode:
        _emit_governance_event("sentience_uncertainty", request.name, "blocked", details)
        raise HTTPException(
            status_code=403,
            detail="Sentience-uncertainty trigger requires protected_mode and escalation board workflow",
        )

    if len(request.escalation_board) < ESCALATION_BOARD_MIN_MEMBERS:
        _emit_governance_event("sentience_uncertainty", request.name, "blocked", details)
        raise HTTPException(
            status_code=403,
            detail=f"escalation_board must include at least {ESCALATION_BOARD_MIN_MEMBERS} members",
        )

    _emit_governance_event("sentience_uncertainty", request.name, "escalated", details)


def _enforce_embodied_evidence_gate(request: "ScheduleRequest") -> None:
    high_autonomy_task = request.autonomy_level == "autonomous" and request.risk_class in HIGH_RISK_CLASSES
    if not high_autonomy_task:
        return

    missing_fields = []
    if not request.approval_trace_id:
        missing_fields.append("approval_trace_id")
    if not request.policy_evidence_ref:
        missing_fields.append("policy_evidence_ref")
    if not request.incident_drill_id:
        missing_fields.append("incident_drill_id")

    details = {
        "autonomy_level": request.autonomy_level,
        "risk_class": request.risk_class,
        "required_approvals": request.required_approvals,
        "missing_fields": missing_fields,
    }
    if missing_fields:
        _emit_governance_event("embodied_evidence_gate", request.name, "blocked", details)
        raise HTTPException(
            status_code=403,
            detail=f"High-risk autonomous task requires evidence fields: {', '.join(missing_fields)}",
        )

    _emit_governance_event("embodied_evidence_gate", request.name, "passed", details)


async def _resolve_execution_route(request: "ScheduleRequest") -> tuple[str, dict]:
    state = {
        "intent": request.command or request.name,
        "priority_tag": request.priority_tag,
        "fleet_scope": request.fleet_scope,
        "autonomy_level": request.autonomy_level,
        "risk_class": request.risk_class,
        "required_approvals": request.required_approvals,
        "selected_route": "local",
        "metrics": {},
    }
    metrics_update = analyze_metrics(state)
    state.update(metrics_update)
    route_update = await evaluate_route(state)
    selected_route = route_update.get("selected_route", "local")
    return selected_route, state.get("metrics", {})

@router.post("/schedule")
async def schedule_task(request: ScheduleRequest):
    try:
        _verify_schedule_signature(request)
        _enforce_fleet_autonomy_policy(request)
        _enforce_sentience_uncertainty_protocol(request)
        _enforce_embodied_guardrails(request)
        _enforce_embodied_evidence_gate(request)
        # Define a closure that will execute the requested command
        async def dynamic_task():
            if not request.command:
                print(f"[TaskScheduler] Executing dynamically scheduled task '{request.name}' (no command provided)")
                return

            selected_route, metrics = await _resolve_execution_route(request)
            if request.fleet_scope in GLOBAL_FLEET_SCOPES and selected_route == "local":
                print(
                    f"[TaskScheduler] Blocking task '{request.name}': fleet_scope={request.fleet_scope} "
                    "must not execute on local route"
                )
                return

            if selected_route != "local":
                print(
                    f"[TaskScheduler] Deferring task '{request.name}' to route '{selected_route}'. "
                    f"local_load={metrics.get('local_load')} memory_pressure={metrics.get('memory_pressure')} "
                    f"priority_tag={request.priority_tag} fleet_scope={request.fleet_scope} "
                    f"autonomy_level={request.autonomy_level} risk_class={request.risk_class} "
                    f"required_approvals={request.required_approvals}"
                )
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
