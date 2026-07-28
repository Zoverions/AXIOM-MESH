"""
Carbonyl Web Browser Agent for AxiomMesh Hypervisor

Integrates the Carbonyl terminal browser with the AxiomMesh agent system.
Enables AI agents to browse, interact with, and extract information from
websites using spatial text matrices instead of pixel-based vision models.

This module provides:
- CarbonylAgent: High-level agent for web browsing tasks
- SpatialWebParser integration for terminal buffer parsing
- IPC communication with Rust Sandbox's CarbonylDriver
- Task execution pipeline for web automation

Part of AxiomMesh's Terminal-Native Spatial Browsing system.
"""

import os
import json
import time
import logging
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum

from .spatial_web_parser import SpatialWebParser, CarbonylBufferStreamer

logger = logging.getLogger("AxiomMesh-CarbonylAgent")


class ActionType(Enum):
    """Types of actions the agent can perform on a webpage."""
    CLICK = "CLICK"
    TYPE = "TYPE"
    NAVIGATE = "NAVIGATE"
    SCROLL_UP = "SCROLL_UP"
    SCROLL_DOWN = "SCROLL_DOWN"
    WAIT = "WAIT"
    EXTRACT = "EXTRACT"
    READ = "READ"


@dataclass
class Action:
    """Represents an action to be performed on a webpage."""
    action_type: ActionType
    x: Optional[int] = None
    y: Optional[int] = None
    text: Optional[str] = None
    url: Optional[str] = None
    lines: Optional[int] = None
    ms: Optional[int] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert action to dictionary for IPC serialization."""
        result = {"type": self.action_type.value}
        if self.x is not None:
            result["x"] = self.x
        if self.y is not None:
            result["y"] = self.y
        if self.text is not None:
            result["text"] = self.text
        if self.url is not None:
            result["url"] = self.url
        if self.lines is not None:
            result["lines"] = self.lines
        if self.ms is not None:
            result["ms"] = self.ms
        return result
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Action":
        """Create action from dictionary."""
        action_type = ActionType(data.get("type", "CLICK"))
        return cls(
            action_type=action_type,
            x=data.get("x"),
            y=data.get("y"),
            text=data.get("text"),
            url=data.get("url"),
            lines=data.get("lines"),
            ms=data.get("ms"),
        )


@dataclass
class ActionResult:
    """Result of executing an action."""
    success: bool
    message: str
    data: Optional[str] = None
    error: Optional[str] = None


@dataclass
class WebTask:
    """Represents a web browsing task for the agent."""
    task_id: str
    url: str
    objective: str
    max_steps: int = 20
    timeout_secs: int = 300
    extracted_data: Optional[str] = None
    completed: bool = False
    actions_taken: List[Action] = field(default_factory=list)
    

class CarbonylIPCClient:
    """
    IPC client for communicating with the Rust Sandbox CarbonylDriver.
    
    Handles bidirectional communication between Python Hypervisor
    and Rust Sandbox over Unix domain sockets or shared memory.
    """
    
    def __init__(self, socket_path: Optional[str] = None):
        """
        Initialize the IPC client.
        
        Args:
            socket_path: Path to Unix domain socket (default: from env)
        """
        self.socket_path = socket_path or os.environ.get(
            "CARBONYL_IPC_SOCKET",
            "/var/run/axiom-carbonyl.sock"
        )
        self.connected = False
        self._socket = None
        
    def connect(self) -> bool:
        """Establish connection to Rust Sandbox."""
        try:
            import socket
            self._socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self._socket.connect(self.socket_path)
            self.connected = True
            logger.info(f"[🔌] Connected to Carbonyl IPC at {self.socket_path}")
            return True
        except Exception as e:
            logger.warning(f"[⚠️] Failed to connect to Carbonyl IPC: {e}")
            logger.info("[ℹ️] Running in simulation mode without Carbonyl backend")
            self.connected = False
            return False
    
    def disconnect(self):
        """Close connection to Rust Sandbox."""
        if self._socket:
            try:
                self._socket.close()
            except:
                pass
            self._socket = None
            self.connected = False
    
    def send_command(self, command: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Send a command to the Rust CarbonylDriver.
        
        Args:
            command: Command name (spawn, navigate, click, type, scroll, read_buffer)
            params: Command parameters
            
        Returns:
            Response from Rust driver
        """
        if not self.connected:
            # Simulate response in disconnected mode
            return self._simulate_response(command, params)
        
        try:
            message = json.dumps({"command": command, "params": params})
            self._socket.sendall(message.encode() + b"\n")
            
            # Read response
            response_data = b""
            while True:
                chunk = self._socket.recv(4096)
                response_data += chunk
                if b"\n" in response_data:
                    break
            
            response = json.loads(response_data.decode().strip())
            return response
        except Exception as e:
            logger.error(f"[❌] IPC communication error: {e}")
            return {"success": False, "error": str(e)}
    
    def _simulate_response(self, command: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Simulate responses when not connected to actual Carbonyl backend."""
        logger.debug(f"[🎭] Simulating command: {command}")
        
        if command == "read_buffer":
            # Return sample terminal buffer for testing
            return {
                "success": True,
                "buffer": self._get_sample_buffer(),
            }
        elif command == "spawn":
            return {"success": True, "pid": 12345}
        elif command in {"click", "type", "navigate", "scroll"}:
            return {"success": True, "message": f"Command {command} executed"}
        
        return {"success": True}
    
    def _get_sample_buffer(self) -> str:
        """Return a sample Carbonyl terminal buffer for testing."""
        return """\x1b[1;36mGoogle\x1b[0m
\x1b[0m
\x1b[37mSearch the world's information\x1b[0m
\x1b[0m
[\x1b[32mGoogle Search\x1b[0m] [\x1b[32mI'm Feeling Lucky\x1b[0m]
\x1b[0m
Sign in | Settings | Privacy | Terms
"""


class CarbonylAgent:
    """
    AI Agent for terminal-native web browsing using Carbonyl.
    
    This agent combines:
    - SpatialWebParser for converting terminal buffers to geometric matrices
    - CarbonylIPCClient for controlling the Carbonyl browser
    - LLM integration for interpreting spatial layouts and planning actions
    
    Usage:
        agent = CarbonylAgent()
        result = agent.execute_task(
            url="https://example.com",
            objective="Find the main headline and extract it"
        )
    """
    
    def __init__(
        self,
        viewport_width: int = 120,
        viewport_height: int = 40,
        ipc_socket: Optional[str] = None,
        llm_client: Optional[Any] = None,
    ):
        """
        Initialize the Carbonyl Agent.
        
        Args:
            viewport_width: Terminal viewport width in characters
            viewport_height: Terminal viewport height in lines
            ipc_socket: Path to IPC socket for Rust communication
            llm_client: Optional LLM client for task interpretation
        """
        self.viewport_width = viewport_width
        self.viewport_height = viewport_height
        self.parser = SpatialWebParser(viewport_width, viewport_height)
        self.buffer_streamer = CarbonylBufferStreamer(
            max_frames=10,
            viewport_width=viewport_width,
            viewport_height=viewport_height,
        )
        self.ipc_client = CarbonylIPCClient(ipc_socket)
        self.llm_client = llm_client
        self.current_task: Optional[WebTask] = None
        self.spatial_matrix: Optional[str] = None
        
    def connect(self) -> bool:
        """Connect to the Rust CarbonylDriver via IPC."""
        return self.ipc_client.connect()
    
    def disconnect(self):
        """Disconnect from Rust CarbonylDriver."""
        self.ipc_client.disconnect()
    
    def spawn_browser(self, url: str) -> ActionResult:
        """
        Spawn Carbonyl browser instance targeting a URL.
        
        Args:
            url: URL to navigate to
            
        Returns:
            ActionResult indicating success or failure
        """
        logger.info(f"[🌐] Spawning Carbonyl browser for: {url}")
        
        response = self.ipc_client.send_command("spawn", {"url": url})
        
        if response.get("success"):
            # Give browser time to load
            time.sleep(2)
            # Read initial buffer
            self._update_spatial_matrix()
            return ActionResult(success=True, message=f"Browser spawned for {url}")
        else:
            error = response.get("error", "Unknown error")
            return ActionResult(success=False, message="Failed to spawn browser", error=error)
    
    def navigate(self, url: str) -> ActionResult:
        """
        Navigate to a new URL.
        
        Args:
            url: Target URL
            
        Returns:
            ActionResult
        """
        logger.info(f"[🧭] Navigating to: {url}")
        
        response = self.ipc_client.send_command("navigate", {"url": url})
        
        if response.get("success"):
            time.sleep(1.5)
            self._update_spatial_matrix()
            return ActionResult(success=True, message=f"Navigated to {url}")
        else:
            return ActionResult(
                success=False,
                message="Navigation failed",
                error=response.get("error"),
            )
    
    def click(self, x: int, y: int) -> ActionResult:
        """
        Click at specific coordinates in the spatial matrix.
        
        Args:
            x: X coordinate (column)
            y: Y coordinate (row)
            
        Returns:
            ActionResult
        """
        logger.info(f"[🖱️] Clicking at ({x}, {y})")
        
        response = self.ipc_client.send_command("click", {"x": x, "y": y})
        
        if response.get("success"):
            time.sleep(0.5)
            self._update_spatial_matrix()
            return ActionResult(success=True, message=f"Clicked at ({x}, {y})")
        else:
            return ActionResult(
                success=False,
                message="Click failed",
                error=response.get("error"),
            )
    
    def type_text(self, x: int, y: int, text: str) -> ActionResult:
        """
        Type text at specific coordinates.
        
        Args:
            x: X coordinate
            y: Y coordinate
            text: Text to type
            
        Returns:
            ActionResult
        """
        logger.info(f"[⌨️] Typing at ({x}, {y}): {text[:30]}...")
        
        # First click to focus
        self.click(x, y)
        
        response = self.ipc_client.send_command("type", {"text": text})
        
        if response.get("success"):
            self._update_spatial_matrix()
            return ActionResult(success=True, message=f"Typed: {text[:30]}...")
        else:
            return ActionResult(
                success=False,
                message="Type failed",
                error=response.get("error"),
            )
    
    def scroll(self, direction: str, lines: int = 10) -> ActionResult:
        """
        Scroll the page.
        
        Args:
            direction: "up" or "down"
            lines: Number of lines to scroll
            
        Returns:
            ActionResult
        """
        logger.info(f"[📜] Scrolling {direction} by {lines} lines")
        
        response = self.ipc_client.send_command(
            "scroll",
            {"direction": direction, "lines": lines},
        )
        
        if response.get("success"):
            time.sleep(0.3)
            self._update_spatial_matrix()
            return ActionResult(success=True, message=f"Scrolled {direction}")
        else:
            return ActionResult(
                success=False,
                message="Scroll failed",
                error=response.get("error"),
            )
    
    def wait(self, ms: int = 2000) -> ActionResult:
        """
        Wait for page to stabilize.
        
        Args:
            ms: Milliseconds to wait
            
        Returns:
            ActionResult
        """
        logger.info(f"[⏳] Waiting for {ms}ms")
        time.sleep(ms / 1000.0)
        self._update_spatial_matrix()
        return ActionResult(success=True, message=f"Waited {ms}ms")
    
    def extract_content(self) -> ActionResult:
        """
        Extract content from current view.
        
        Returns:
            ActionResult with extracted data
        """
        logger.info("[📥] Extracting content")
        
        response = self.ipc_client.send_command("read_buffer", {})
        
        if response.get("success"):
            buffer = response.get("buffer", "")
            clean_text = self.parser.strip_ansi(buffer)
            return ActionResult(
                success=True,
                message="Content extracted",
                data=clean_text,
            )
        else:
            return ActionResult(
                success=False,
                message="Extraction failed",
                error=response.get("error"),
            )
    
    def _update_spatial_matrix(self):
        """Update the current spatial matrix from the terminal buffer."""
        response = self.ipc_client.send_command("read_buffer", {})
        
        if response.get("success"):
            buffer = response.get("buffer", "")
            self.buffer_streamer.add_frame(buffer)
            self.spatial_matrix = self.parser.parse_carbonyl_buffer(buffer)
            logger.debug("[🕸️] Spatial matrix updated")
    
    def get_spatial_matrix(self) -> Optional[str]:
        """Get the current spatial matrix representation."""
        return self.spatial_matrix
    
    def detect_interactive_elements(self) -> List[Tuple[int, int, str]]:
        """Detect clickable elements in current view."""
        response = self.ipc_client.send_command("read_buffer", {})
        
        if response.get("success"):
            buffer = response.get("buffer", "")
            return self.parser.extract_clickable_elements(buffer)
        
        return []
    
    def execute_task(self, url: str, objective: str, max_steps: int = 20) -> WebTask:
        """
        Execute a complete web browsing task.
        
        This is the main entry point for agents to perform web tasks.
        It combines spatial understanding with action execution to achieve
        the specified objective.
        
        Args:
            url: Starting URL
            objective: Natural language description of what to accomplish
            max_steps: Maximum number of interaction steps
            
        Returns:
            WebTask with results
        """
        import uuid
        
        task = WebTask(
            task_id=str(uuid.uuid4())[:8],
            url=url,
            objective=objective,
            max_steps=max_steps,
        )
        
        self.current_task = task
        logger.info(f"[🎯] Starting task {task.task_id}: {objective}")
        
        try:
            # Step 1: Spawn browser and navigate to URL
            result = self.spawn_browser(url)
            if not result.success:
                raise Exception(f"Failed to spawn browser: {result.error}")
            
            # Step 2: Main interaction loop
            for step in range(max_steps):
                logger.info(f"[🔄] Task step {step + 1}/{max_steps}")
                
                # Get current spatial matrix
                matrix = self.get_spatial_matrix()
                elements = self.detect_interactive_elements()
                
                # Check if we've achieved the objective
                # In production, this would use LLM to evaluate progress
                if self._check_objective_complete(objective, matrix):
                    logger.info("[✅] Objective complete!")
                    break
                
                # Plan next action based on spatial layout
                action = self._plan_next_action(objective, matrix, elements)
                
                if action:
                    task.actions_taken.append(action)
                    result = self._execute_action(action)
                    
                    if not result.success:
                        logger.warning(f"[⚠️] Action failed: {result.error}")
                
                # Check for page changes
                if self.buffer_streamer.detect_changes():
                    logger.debug("[📊] Page content changed")
            
            # Step 3: Extract final results
            extract_result = self.extract_content()
            if extract_result.success:
                task.extracted_data = extract_result.data
            
            task.completed = True
            
        except Exception as e:
            logger.error(f"[❌] Task failed: {e}")
            task.completed = False
        finally:
            self.current_task = None
        
        return task
    
    def _check_objective_complete(self, objective: str, matrix: Optional[str]) -> bool:
        """Check if the task objective has been achieved."""
        # In production, use LLM to evaluate
        # For now, simple heuristic
        return False
    
    def _plan_next_action(
        self,
        objective: str,
        matrix: Optional[str],
        elements: List[Tuple[int, int, str]],
    ) -> Optional[Action]:
        """Plan the next action based on current state."""
        # In production, use LLM with spatial matrix context
        # For now, return a placeholder action
        
        if elements:
            # Click first detected element
            x, y, desc = elements[0]
            return Action(action_type=ActionType.CLICK, x=x, y=y)
        
        return None
    
    def _execute_action(self, action: Action) -> ActionResult:
        """Execute a single action."""
        if action.action_type == ActionType.CLICK:
            return self.click(action.x, action.y)
        elif action.action_type == ActionType.TYPE:
            return self.type_text(action.x, action.y, action.text or "")
        elif action.action_type == ActionType.NAVIGATE:
            return self.navigate(action.url or "")
        elif action.action_type == ActionType.SCROLL_UP:
            return self.scroll("up", action.lines or 10)
        elif action.action_type == ActionType.SCROLL_DOWN:
            return self.scroll("down", action.lines or 10)
        elif action.action_type == ActionType.WAIT:
            return self.wait(action.ms or 2000)
        elif action.action_type == ActionType.EXTRACT:
            return self.extract_content()
        
        return ActionResult(success=False, message="Unknown action type")
    
    def create_interaction_prompt(self, task_objective: str) -> str:
        """
        Create an LLM prompt with spatial context for interaction planning.
        
        Args:
            task_objective: The task the agent needs to perform
            
        Returns:
            Formatted prompt for LLM
        """
        response = self.ipc_client.send_command("read_buffer", {})
        buffer = response.get("buffer", "")
        
        return self.parser.generate_interaction_prompt(buffer, task_objective)


# Convenience function for quick web tasks
def browse_web(
    url: str,
    objective: str,
    viewport_width: int = 120,
    viewport_height: int = 40,
) -> WebTask:
    """
    Quick helper to execute a single web browsing task.
    
    Args:
        url: URL to browse
        objective: What to accomplish
        viewport_width: Terminal width
        viewport_height: Terminal height
        
    Returns:
        WebTask with results
    """
    agent = CarbonylAgent(
        viewport_width=viewport_width,
        viewport_height=viewport_height,
    )
    
    try:
        agent.connect()
        return agent.execute_task(url, objective)
    finally:
        agent.disconnect()
