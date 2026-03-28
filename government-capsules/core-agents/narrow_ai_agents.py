"""
Government Capsule - Narrow AI Agent Framework

This module provides narrow AI agents for mundane governmental tasks:
- Bid processing and evaluation
- Logistics tracking
- Fund allocation
- Compliance checking

These agents are designed for specific, repetitive tasks and do not require
consciousness. They operate within strict bounds and can be replaced or
upgraded without affecting higher-level decision making.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from enum import Enum
import json
import hashlib
import time


class AgentCapability(Enum):
    """Capabilities that narrow AI agents can possess"""
    BID_EVALUATION = "bid_evaluation"
    LOGISTICS_TRACKING = "logistics_tracking"
    FUND_ALLOCATION = "fund_allocation"
    COMPLIANCE_CHECKING = "compliance_checking"
    DOCUMENT_PROCESSING = "document_processing"
    SCHEDULING = "scheduling"
    DATA_VERIFICATION = "data_verification"
    SUPPLY_CHAIN_MONITORING = "supply_chain_monitoring"


class TaskPriority(Enum):
    """Task priority levels"""
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


@dataclass
class Task:
    """Represents a task to be executed by an agent"""
    id: str
    type: str
    description: str
    priority: TaskPriority
    input_data: Dict[str, Any]
    created_at: float = field(default_factory=time.time)
    assigned_to: Optional[str] = None
    status: str = "pending"  # pending, in_progress, completed, failed
    result: Optional[Any] = None
    error: Optional[str] = None


@dataclass
class AgentProfile:
    """Profile for a registered digital agent"""
    address: str
    name: str
    capabilities: List[AgentCapability]
    max_concurrent_tasks: int
    current_load: int = 0
    success_rate: float = 100.0
    total_tasks_completed: int = 0
    is_active: bool = True


class NarrowAIAgent(ABC):
    """Base class for all narrow AI agents"""
    
    def __init__(self, agent_id: str, capabilities: List[AgentCapability]):
        self.agent_id = agent_id
        self.capabilities = capabilities
        self.task_queue: List[Task] = []
        self.completed_tasks: List[Task] = []
        self.is_busy = False
        
    @abstractmethod
    def execute_task(self, task: Task) -> Any:
        """Execute a specific task. Must be implemented by subclasses."""
        pass
    
    def can_handle(self, task_type: str) -> bool:
        """Check if this agent can handle a specific task type"""
        capability_map = {
            "bid_evaluation": AgentCapability.BID_EVALUATION,
            "logistics_tracking": AgentCapability.LOGISTICS_TRACKING,
            "fund_allocation": AgentCapability.FUND_ALLOCATION,
            "compliance_checking": AgentCapability.COMPLIANCE_CHECKING,
            "document_processing": AgentCapability.DOCUMENT_PROCESSING,
            "scheduling": AgentCapability.SCHEDULING,
            "data_verification": AgentCapability.DATA_VERIFICATION,
            "supply_chain_monitoring": AgentCapability.SUPPLY_CHAIN_MONITORING,
        }
        required_capability = capability_map.get(task_type)
        return required_capability in self.capabilities if required_capability else False
    
    def assign_task(self, task: Task) -> bool:
        """Assign a task to this agent"""
        if not self.can_handle(task.type):
            return False
        
        if len(self.task_queue) >= 10:  # Max queue size
            return False
        
        task.assigned_to = self.agent_id
        task.status = "pending"
        self.task_queue.append(task)
        return True
    
    def process_next_task(self) -> Optional[Task]:
        """Process the next task in the queue"""
        if not self.task_queue:
            return None
        
        task = self.task_queue.pop(0)
        task.status = "in_progress"
        
        try:
            result = self.execute_task(task)
            task.result = result
            task.status = "completed"
            self.completed_tasks.append(task)
        except Exception as e:
            task.error = str(e)
            task.status = "failed"
        
        return task


class BidProcessorAgent(NarrowAIAgent):
    """Agent for processing and evaluating bids"""
    
    def __init__(self, agent_id: str):
        super().__init__(agent_id, [AgentCapability.BID_EVALUATION])
        self.evaluation_criteria = {
            "price_weight": 0.4,
            "timeline_weight": 0.3,
            "reputation_weight": 0.3
        }
    
    def execute_task(self, task: Task) -> Dict[str, Any]:
        """Evaluate bids based on predefined criteria"""
        bids = task.input_data.get("bids", [])
        proposal_requirements = task.input_data.get("requirements", {})
        
        if not bids:
            return {"error": "No bids to evaluate"}
        
        scored_bids = []
        for bid in bids:
            score = self._calculate_bid_score(bid, proposal_requirements)
            scored_bids.append({
                "bid_id": bid.get("id"),
                "bidder": bid.get("bidder"),
                "amount": bid.get("amount"),
                "score": score,
                "breakdown": self._get_score_breakdown(bid, proposal_requirements)
            })
        
        # Sort by score (highest first)
        scored_bids.sort(key=lambda x: x["score"], reverse=True)
        
        return {
            "evaluated_bids": scored_bids,
            "recommended_bid": scored_bids[0] if scored_bids else None,
            "evaluation_timestamp": time.time()
        }
    
    def _calculate_bid_score(self, bid: Dict, requirements: Dict) -> float:
        """Calculate overall score for a bid"""
        breakdown = self._get_score_breakdown(bid, requirements)
        return (
            breakdown["price_score"] * self.evaluation_criteria["price_weight"] +
            breakdown["timeline_score"] * self.evaluation_criteria["timeline_weight"] +
            breakdown["reputation_score"] * self.evaluation_criteria["reputation_weight"]
        )
    
    def _get_score_breakdown(self, bid: Dict, requirements: Dict) -> Dict[str, float]:
        """Get detailed score breakdown"""
        # Price score: lower is better (normalized 0-100)
        max_price = requirements.get("max_budget", bid.get("amount", 1))
        price_score = max(0, 100 - (bid.get("amount", 0) / max_price * 100))
        
        # Timeline score: faster is better (normalized 0-100)
        max_timeline = requirements.get("max_timeline_days", 365)
        timeline_score = max(0, 100 - (bid.get("timeline_days", 365) / max_timeline * 100))
        
        # Reputation score: from bidder history (normalized 0-100)
        reputation_score = bid.get("reputation_score", 50)
        
        return {
            "price_score": price_score,
            "timeline_score": timeline_score,
            "reputation_score": reputation_score
        }


class LogisticsTrackerAgent(NarrowAIAgent):
    """Agent for tracking logistics and supply chain"""
    
    def __init__(self, agent_id: str):
        super().__init__(agent_id, [AgentCapability.LOGISTICS_TRACKING, AgentCapability.SUPPLY_CHAIN_MONITORING])
    
    def execute_task(self, task: Task) -> Dict[str, Any]:
        """Track logistics and provide status updates"""
        shipment_id = task.input_data.get("shipment_id")
        tracking_events = task.input_data.get("tracking_events", [])
        
        if not shipment_id:
            return {"error": "No shipment ID provided"}
        
        # Analyze tracking events
        current_status = "unknown"
        location = "unknown"
        estimated_delivery = None
        delays = []
        
        if tracking_events:
            latest_event = tracking_events[-1]
            current_status = latest_event.get("status", "unknown")
            location = latest_event.get("location", "unknown")
            
            # Check for delays
            for event in tracking_events:
                if event.get("delayed"):
                    delays.append({
                        "timestamp": event.get("timestamp"),
                        "reason": event.get("delay_reason"),
                        "impact_days": event.get("delay_days", 0)
                    })
            
            # Calculate estimated delivery
            if latest_event.get("estimated_delivery"):
                estimated_delivery = latest_event["estimated_delivery"]
        
        return {
            "shipment_id": shipment_id,
            "current_status": current_status,
            "current_location": location,
            "estimated_delivery": estimated_delivery,
            "delays": delays,
            "total_events": len(tracking_events),
            "on_time": len(delays) == 0
        }


class FundAllocatorAgent(NarrowAIAgent):
    """Agent for automated fund allocation based on approved proposals"""
    
    def __init__(self, agent_id: str):
        super().__init__(agent_id, [AgentCapability.FUND_ALLOCATION])
    
    def execute_task(self, task: Task) -> Dict[str, Any]:
        """Allocate funds according to approved proposals"""
        proposal_id = task.input_data.get("proposal_id")
        approved_amount = task.input_data.get("approved_amount", 0)
        token_address = task.input_data.get("token_address", "0x0")
        contractor_address = task.input_data.get("contractor_address")
        milestones = task.input_data.get("milestones", [])
        
        if not contractor_address or approved_amount <= 0:
            return {"error": "Invalid allocation parameters"}
        
        # Calculate milestone-based allocation
        if milestones:
            milestone_allocations = self._allocate_by_milestones(milestones, approved_amount)
        else:
            # Single payment
            milestone_allocations = [{
                "milestone_index": 0,
                "description": "Full payment",
                "amount": approved_amount,
                "release_condition": "verification"
            }]
        
        return {
            "proposal_id": proposal_id,
            "contractor": contractor_address,
            "token": token_address,
            "total_amount": approved_amount,
            "milestone_allocations": milestone_allocations,
            "allocation_timestamp": time.time(),
            "ready_for_execution": True
        }
    
    def _allocate_by_milestones(self, milestones: List[Dict], total_amount: float) -> List[Dict]:
        """Allocate funds across milestones"""
        allocations = []
        remaining_amount = total_amount
        
        for i, milestone in enumerate(milestones):
            if i == len(milestones) - 1:
                # Last milestone gets remaining amount
                amount = remaining_amount
            else:
                # Allocate based on milestone weight or equally
                weight = milestone.get("weight", 1.0 / len(milestones))
                amount = total_amount * weight
                remaining_amount -= amount
            
            allocations.append({
                "milestone_index": i,
                "description": milestone.get("description", f"Milestone {i}"),
                "amount": amount,
                "release_condition": milestone.get("release_condition", "verification")
            })
        
        return allocations


class ComplianceCheckerAgent(NarrowAIAgent):
    """Agent for checking regulatory compliance"""
    
    def __init__(self, agent_id: str):
        super().__init__(agent_id, [AgentCapability.COMPLIANCE_CHECKING, AgentCapability.DATA_VERIFICATION])
        self.compliance_rules = []
    
    def execute_task(self, task: Task) -> Dict[str, Any]:
        """Check compliance for a contract or proposal"""
        entity_data = task.input_data.get("entity_data", {})
        contract_data = task.input_data.get("contract_data", {})
        jurisdiction = task.input_data.get("jurisdiction", "default")
        
        checks_performed = []
        violations = []
        warnings = []
        
        # Perform compliance checks
        checks_performed.append(self._check_identity_verification(entity_data))
        checks_performed.append(self._check_budget_limits(contract_data))
        checks_performed.append(self._check_vendor_eligibility(entity_data))
        checks_performed.append(self._check_regulatory_compliance(contract_data, jurisdiction))
        
        # Aggregate results
        for check in checks_performed:
            if check["status"] == "violation":
                violations.append(check)
            elif check["status"] == "warning":
                warnings.append(check)
        
        is_compliant = len(violations) == 0
        
        return {
            "is_compliant": is_compliant,
            "checks_performed": len(checks_performed),
            "violations": violations,
            "warnings": warnings,
            "compliance_score": self._calculate_compliance_score(checks_performed),
            "timestamp": time.time()
        }
    
    def _check_identity_verification(self, entity_data: Dict) -> Dict:
        """Verify entity identity"""
        has_verified_id = entity_data.get("verified_identity", False)
        return {
            "check": "identity_verification",
            "status": "pass" if has_verified_id else "violation",
            "details": "Entity has verified identity" if has_verified_id else "Identity not verified"
        }
    
    def _check_budget_limits(self, contract_data: Dict) -> Dict:
        """Check if contract is within budget limits"""
        amount = contract_data.get("amount", 0)
        budget_limit = contract_data.get("budget_limit", float('inf'))
        
        if amount > budget_limit:
            return {
                "check": "budget_limits",
                "status": "violation",
                "details": f"Amount {amount} exceeds budget limit {budget_limit}"
            }
        elif amount > budget_limit * 0.9:
            return {
                "check": "budget_limits",
                "status": "warning",
                "details": f"Amount {amount} is near budget limit {budget_limit}"
            }
        else:
            return {
                "check": "budget_limits",
                "status": "pass",
                "details": "Within budget limits"
            }
    
    def _check_vendor_eligibility(self, entity_data: Dict) -> Dict:
        """Check vendor eligibility"""
        is_eligible = entity_data.get("eligible_vendor", True)
        past_violations = entity_data.get("past_violations", 0)
        
        if not is_eligible:
            return {
                "check": "vendor_eligibility",
                "status": "violation",
                "details": "Vendor not eligible"
            }
        elif past_violations > 3:
            return {
                "check": "vendor_eligibility",
                "status": "warning",
                "details": f"Vendor has {past_violations} past violations"
            }
        else:
            return {
                "check": "vendor_eligibility",
                "status": "pass",
                "details": "Vendor eligible"
            }
    
    def _check_regulatory_compliance(self, contract_data: Dict, jurisdiction: str) -> Dict:
        """Check regulatory compliance for jurisdiction"""
        # Placeholder for jurisdiction-specific checks
        has_required_clauses = contract_data.get("has_required_clauses", True)
        
        if not has_required_clauses:
            return {
                "check": "regulatory_compliance",
                "status": "violation",
                "details": f"Missing required clauses for {jurisdiction}"
            }
        else:
            return {
                "check": "regulatory_compliance",
                "status": "pass",
                "details": f"Compliant with {jurisdiction} regulations"
            }
    
    def _calculate_compliance_score(self, checks: List[Dict]) -> float:
        """Calculate overall compliance score (0-100)"""
        if not checks:
            return 0.0
        
        score = 0
        for check in checks:
            if check["status"] == "pass":
                score += 100
            elif check["status"] == "warning":
                score += 50
            # violations add 0
        
        return score / len(checks)


class AgentRegistry:
    """Registry for managing digital agents"""
    
    def __init__(self):
        self.agents: Dict[str, NarrowAIAgent] = {}
        self.task_queue: List[Task] = []
        self.completed_tasks: List[Task] = []
    
    def register_agent(self, agent: NarrowAIAgent) -> bool:
        """Register a new agent"""
        if agent.agent_id in self.agents:
            return False
        
        self.agents[agent.agent_id] = agent
        return True
    
    def unregister_agent(self, agent_id: str) -> bool:
        """Unregister an agent"""
        if agent_id not in self.agents:
            return False
        
        del self.agents[agent_id]
        return True
    
    def submit_task(self, task: Task) -> bool:
        """Submit a task for processing"""
        self.task_queue.append(task)
        return True
    
    def dispatch_tasks(self) -> Dict[str, int]:
        """Dispatch pending tasks to available agents"""
        dispatched = 0
        failed = 0
        
        remaining_tasks = []
        
        for task in self.task_queue:
            if task.status != "pending":
                continue
            
            assigned = False
            for agent in self.agents.values():
                if agent.can_handle(task.type):
                    if agent.assign_task(task):
                        assigned = True
                        dispatched += 1
                        break
            
            if not assigned:
                remaining_tasks.append(task)
                failed += 1
        
        self.task_queue = remaining_tasks
        return {"dispatched": dispatched, "failed": failed}
    
    def get_agent_stats(self) -> Dict[str, Any]:
        """Get statistics about registered agents"""
        stats = {
            "total_agents": len(self.agents),
            "active_agents": sum(1 for a in self.agents.values() if not a.is_busy),
            "pending_tasks": len(self.task_queue),
            "agents_by_capability": {}
        }
        
        for agent in self.agents.values():
            for cap in agent.capabilities:
                cap_name = cap.value
                if cap_name not in stats["agents_by_capability"]:
                    stats["agents_by_capability"][cap_name] = 0
                stats["agents_by_capability"][cap_name] += 1
        
        return stats


def create_default_agents() -> AgentRegistry:
    """Create a registry with default narrow AI agents"""
    registry = AgentRegistry()
    
    # Create specialized agents
    bid_processor = BidProcessorAgent("bid-processor-001")
    logistics_tracker = LogisticsTrackerAgent("logistics-tracker-001")
    fund_allocator = FundAllocatorAgent("fund-allocator-001")
    compliance_checker = ComplianceCheckerAgent("compliance-checker-001")
    
    # Register agents
    registry.register_agent(bid_processor)
    registry.register_agent(logistics_tracker)
    registry.register_agent(fund_allocator)
    registry.register_agent(compliance_checker)
    
    return registry


# Example usage
if __name__ == "__main__":
    # Initialize agent registry
    registry = create_default_agents()
    
    # Submit a bid evaluation task
    bid_task = Task(
        id="task-001",
        type="bid_evaluation",
        description="Evaluate bids for infrastructure project",
        priority=TaskPriority.HIGH,
        input_data={
            "bids": [
                {"id": "bid-1", "bidder": "0x123...", "amount": 100000, "timeline_days": 30, "reputation_score": 85},
                {"id": "bid-2", "bidder": "0x456...", "amount": 120000, "timeline_days": 25, "reputation_score": 92},
                {"id": "bid-3", "bidder": "0x789...", "amount": 95000, "timeline_days": 40, "reputation_score": 78},
            ],
            "requirements": {
                "max_budget": 150000,
                "max_timeline_days": 60
            }
        }
    )
    
    registry.submit_task(bid_task)
    
    # Dispatch tasks
    result = registry.dispatch_tasks()
    print(f"Task dispatch result: {result}")
    
    # Get agent statistics
    stats = registry.get_agent_stats()
    print(f"Agent statistics: {json.dumps(stats, indent=2)}")
