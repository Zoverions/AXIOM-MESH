from __future__ import annotations

import logging
import os
import httpx
import json
import hashlib
from typing import Any, Dict, List, Optional
from datetime import datetime

from hypervisor.policies.hermes_policy import HERMES_POLICY, validate_hermes_action

logger = logging.getLogger(__name__)

class HermesAgent:
    """
    Production-ready agent class for Hermes Agent integration.
    Manages communication with the sandbox, policy enforcement, and Grid interaction.
    """

    def __init__(
        self,
        agent_id: str,
        owner_address: str,
        sandbox_url: str = os.getenv("SANDBOX_URL", "http://axiom-hermes:8000"),
        grid_url: str = os.getenv("GRID_URL", "http://localhost:5000"),
    ):
        self.agent_id = agent_id
        self.owner_address = owner_address
        self.sandbox_url = sandbox_url
        self.grid_url = grid_url
        self.session_id = hashlib.sha256(f"{agent_id}-{datetime.now().isoformat()}".encode()).hexdigest()[:12]

    async def execute_task(self, task_description: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Executes a task using the Hermes sandbox after policy validation.
        """
        logger.info(f"HermesAgent {self.agent_id} executing task: {task_description[:50]}...")

        # Policy Check: Pre-validation of the task itself
        initial_action = {"type": "task_initialization", "description": task_description}
        if not validate_hermes_action(initial_action, context or {}):
            return {"error": "Task initialization denied by security policy", "success": False}

        try:
            async with httpx.AsyncClient() as client:
                payload = {
                    "task": task_description,
                    "context": context or {},
                    "agent_id": self.agent_id,
                    "session_id": self.session_id,
                    "policy_constraints": HERMES_POLICY
                }

                response = await client.post(f"{self.sandbox_url}/task", json=payload, timeout=60.0)
                response.raise_for_status()
                result = response.json()

                # Logic to handle intermediate tool calls if the sandbox requests them
                while result.get("status") == "requires_action":
                    action = result.get("action")
                    if not action:
                        break

                    # Validate action against policy
                    if not validate_hermes_action(action, context or {}):
                        # If denied, tell sandbox it's unauthorized
                        action_result = {"error": "Unauthorized by policy", "success": False}
                    else:
                        # If action is allowed, execute it (e.g., via Grid if high risk)
                        action_result = await self._handle_governed_action(action)

                    # Send result back to sandbox
                    response = await client.post(
                        f"{self.sandbox_url}/action_result",
                        json={"session_id": self.session_id, "result": action_result}
                    )
                    response.raise_for_status()
                    result = response.json()

                return result

        except httpx.HTTPError as e:
            logger.error(f"Sandbox communication error: {e}")
            return {"error": f"Failed to communicate with Hermes sandbox: {str(e)}", "success": False}

    async def _handle_governed_action(self, action: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handles actions that require Grid interaction or special governance.
        """
        action_type = action.get("type")

        # If it's a high-risk tool, we need to interact with Grid
        if action_type in HERMES_POLICY.get("high_risk_tools", []):
            return await self._request_grid_capability(action)

        # Standard tools can be handled locally or passed through
        return {"status": "authorized", "action": action_type}

    async def _request_grid_capability(self, action: Dict[str, Any]) -> Dict[str, Any]:
        """
        Requests a capability token from the Grid for high-risk actions.
        """
        logger.info(f"Requesting Grid capability for action: {action.get('type')}")

        try:
            async with httpx.AsyncClient() as client:
                # 1. Record spend if applicable
                if "cost" in action:
                    await client.post(
                        f"{self.grid_url}/hermes/record_spend",
                        json={"agent_id": self.agent_id, "amount": action["cost"]}
                    )

                # 2. Request capability token
                action_hash = hashlib.sha256(json.dumps(action, sort_keys=True).encode()).hexdigest()
                payload = {
                    "agent_id": self.agent_id,
                    "action_hash": action_hash,
                    "requester": self.owner_address
                }

                res = await client.post(f"{self.grid_url}/hermes/request_capability", json=payload)
                if res.status_code == 200:
                    return {"status": "success", "token": res.json().get("token"), "action": action}
                else:
                    return {"error": "Grid refused capability request", "details": res.text}

        except Exception as e:
            logger.error(f"Grid communication failed: {e}")
            return {"error": f"Grid error: {str(e)}"}

    async def update_policy(self, new_policy: Dict[str, Any]) -> bool:
        """
        Updates the policy for this agent instance.
        In production, this would involve a governance check.
        """
        # Placeholder for governance-aware policy update
        logger.info(f"Policy update requested for {self.agent_id}")
        return True
