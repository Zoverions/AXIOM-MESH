"""
Canadian Government Capsule - Ontario Implementation
=====================================================

This module provides the foundational infrastructure for a multi-level
government governance capsule with support for:
- Federal, Provincial (Ontario), and Municipal (Toronto) branches
- Funding allocation, requests, and approval workflows
- Modular templates for Education, Healthcare, Elder Care, Welfare
- Advanced customization mode for voting mechanisms
- AI and Human oversight with transparent audit trails
- Dedicated governance stations for elections and decision-making

Author: Axiom Mesh Governance Team
"""

from typing import Dict, List, Optional, Any, Tuple
from enum import Enum
from dataclasses import dataclass, field
import json
import hashlib
import time
from datetime import datetime


class JurisdictionLevel(Enum):
    """Enumeration of government jurisdiction levels in Canada."""
    FEDERAL = "federal"
    PROVINCIAL = "provincial"
    MUNICIPAL = "municipal"
    ORGANIZATION = "organization"


class VotingMechanism(Enum):
    """Supported voting mechanisms for democratic processes."""
    FIRST_PAST_THE_POST = "first_past_the_post"
    RANKED_BALLOT = "ranked_ballot"
    PROPORTIONAL_REPRESENTATION = "proportional_representation"
    SINGLE_TRANSFERABLE_VOTE = "single_transferable_vote"
    APPROVAL_VOTING = "approval_voting"
    QUADRATIC_VOTING = "quadratic_voting"


class FundingStatus(Enum):
    """Status of funding requests and allocations."""
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    DISBURSED = "disbursed"
    AUDITED = "audited"


class OversightType(Enum):
    """Types of oversight for governance decisions."""
    AI_AUTOMATED = "ai_automated"
    HUMAN_REVIEW = "human_review"
    JOINT_OVERSIGHT = "joint_oversight"
    PUBLIC_AUDIT = "public_audit"


@dataclass
class GovernanceEntity:
    """Represents a government entity at any jurisdiction level."""
    entity_id: str
    name: str
    jurisdiction_level: JurisdictionLevel
    parent_entity_id: Optional[str] = None
    budget_allocation: float = 0.0
    active_programs: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        return {
            "entity_id": self.entity_id,
            "name": self.name,
            "jurisdiction_level": self.jurisdiction_level.value,
            "parent_entity_id": self.parent_entity_id,
            "budget_allocation": self.budget_allocation,
            "active_programs": self.active_programs,
            "metadata": self.metadata
        }


@dataclass
class FundingRequest:
    """Represents a funding request from a government entity or organization."""
    request_id: str
    requester_id: str
    amount: float
    purpose: str
    program_type: str  # education, healthcare, elder_care, welfare, etc.
    justification: str
    status: FundingStatus = FundingStatus.PENDING
    created_at: float = field(default_factory=time.time)
    approved_by: Optional[str] = None
    oversight_type: OversightType = OversightType.JOINT_OVERSIGHT
    ai_assessment: Optional[Dict] = None
    human_reviewer: Optional[str] = None
    audit_trail: List[Dict] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return {
            "request_id": self.request_id,
            "requester_id": self.requester_id,
            "amount": self.amount,
            "purpose": self.purpose,
            "program_type": self.program_type,
            "justification": self.justification,
            "status": self.status.value,
            "created_at": self.created_at,
            "approved_by": self.approved_by,
            "oversight_type": self.oversight_type.value,
            "ai_assessment": self.ai_assessment,
            "human_reviewer": self.human_reviewer,
            "audit_trail": self.audit_trail
        }


@dataclass
class VotingConfiguration:
    """Configurable voting mechanism settings for advanced mode."""
    mechanism: VotingMechanism
    parameters: Dict[str, Any] = field(default_factory=dict)
    custom_rules: List[str] = field(default_factory=list)
    quorum_requirement: float = 0.5  # Default 50% participation
    threshold: float = 0.5  # Default simple majority
    
    def to_dict(self) -> Dict:
        return {
            "mechanism": self.mechanism.value,
            "parameters": self.parameters,
            "custom_rules": self.custom_rules,
            "quorum_requirement": self.quorum_requirement,
            "threshold": self.threshold
        }


@dataclass
class GovernanceModule:
    """Template module for specific government functions."""
    module_id: str
    module_type: str  # education, healthcare, elder_care, welfare, etc.
    name: str
    description: str
    version: str
    configuration: Dict[str, Any] = field(default_factory=dict)
    voting_config: Optional[VotingConfiguration] = None
    funding_rules: Dict[str, Any] = field(default_factory=dict)
    compliance_requirements: List[str] = field(default_factory=list)
    is_customized: bool = False
    
    def to_dict(self) -> Dict:
        return {
            "module_id": self.module_id,
            "module_type": self.module_type,
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "configuration": self.configuration,
            "voting_config": self.voting_config.to_dict() if self.voting_config else None,
            "funding_rules": self.funding_rules,
            "compliance_requirements": self.compliance_requirements,
            "is_customized": self.is_customized
        }


class CanadianGovernmentCapsule:
    """
    Main capsule orchestrating Canadian government governance infrastructure.
    
    Supports multi-level governance from Federal down to Municipal levels,
    with specialized modules for various public services and benefit programs.
    """
    
    def __init__(self, region: str = "Ontario"):
        self.region = region
        self.entities: Dict[str, GovernanceEntity] = {}
        self.funding_requests: Dict[str, FundingRequest] = {}
        self.modules: Dict[str, GovernanceModule] = {}
        self.voting_sessions: Dict[str, Dict] = {}
        self.audit_log: List[Dict] = []
        self.oversight_queue: List[Dict] = []
        
        # Initialize default jurisdiction hierarchy
        self._initialize_jurisdiction_hierarchy()
        
    def _initialize_jurisdiction_hierarchy(self):
        """Initialize the default government hierarchy for Ontario."""
        # Federal level
        federal_gov = GovernanceEntity(
            entity_id="CA-FEDERAL-001",
            name="Government of Canada",
            jurisdiction_level=JurisdictionLevel.FEDERAL,
            budget_allocation=0.0,
            metadata={"capital": "Ottawa", "established": "1867"}
        )
        self.entities[federal_gov.entity_id] = federal_gov
        
        # Provincial level - Ontario
        ontario_gov = GovernanceEntity(
            entity_id="CA-ON-PROV-001",
            name="Government of Ontario",
            jurisdiction_level=JurisdictionLevel.PROVINCIAL,
            parent_entity_id=federal_gov.entity_id,
            budget_allocation=0.0,
            metadata={"capital": "Toronto", "premier": "TBD", "population": 15000000}
        )
        self.entities[ontario_gov.entity_id] = ontario_gov
        
        # Municipal level - Toronto
        toronto_gov = GovernanceEntity(
            entity_id="CA-ON-TOR-MUN-001",
            name="City of Toronto",
            jurisdiction_level=JurisdictionLevel.MUNICIPAL,
            parent_entity_id=ontario_gov.entity_id,
            budget_allocation=0.0,
            metadata={"mayor": "TBD", "population": 3000000, "wards": 25}
        )
        self.entities[toronto_gov.entity_id] = toronto_gov
        
        self._log_audit("INIT", "Jurisdiction hierarchy initialized for Ontario")
    
    def register_entity(self, entity: GovernanceEntity) -> str:
        """Register a new government entity in the capsule."""
        self.entities[entity.entity_id] = entity
        self._log_audit("ENTITY_REGISTERED", f"Entity {entity.name} registered")
        return entity.entity_id
    
    def create_funding_request(self, requester_id: str, amount: float, 
                                purpose: str, program_type: str,
                                justification: str,
                                oversight_type: OversightType = OversightType.JOINT_OVERSIGHT) -> str:
        """Create a new funding request."""
        request_id = f"FUND-{int(time.time())}-{hashlib.sha256(purpose.encode()).hexdigest()[:8]}"
        
        request = FundingRequest(
            request_id=request_id,
            requester_id=requester_id,
            amount=amount,
            purpose=purpose,
            program_type=program_type,
            justification=justification,
            oversight_type=oversight_type
        )
        
        self.funding_requests[request_id] = request
        self._log_audit("FUNDING_REQUEST_CREATED", f"Request {request_id} created for ${amount}")
        
        # Add to oversight queue if human review required
        if oversight_type in [OversightType.HUMAN_REVIEW, OversightType.JOINT_OVERSIGHT]:
            self.oversight_queue.append({
                "type": "funding_approval",
                "request_id": request_id,
                "priority": "high" if amount > 1000000 else "normal",
                "timestamp": time.time()
            })
        
        return request_id
    
    def process_funding_request(self, request_id: str, approver_id: str,
                                 decision: bool, ai_assessment: Optional[Dict] = None,
                                 reviewer_name: Optional[str] = None) -> bool:
        """Process a funding request with AI and/or human oversight."""
        if request_id not in self.funding_requests:
            return False
        
        request = self.funding_requests[request_id]
        
        # Update audit trail
        request.audit_trail.append({
            "action": "review",
            "timestamp": time.time(),
            "approver_id": approver_id,
            "decision": "approved" if decision else "rejected",
            "ai_assessment": ai_assessment,
            "human_reviewer": reviewer_name
        })
        
        # Update request status
        request.status = FundingStatus.APPROVED if decision else FundingStatus.REJECTED
        request.approved_by = approver_id
        request.ai_assessment = ai_assessment
        request.human_reviewer = reviewer_name
        
        # If approved, update entity budget
        if decision and request.requester_id in self.entities:
            entity = self.entities[request.requester_id]
            entity.budget_allocation += request.amount
            request.status = FundingStatus.DISBURSED
        
        self._log_audit("FUNDING_DECISION", f"Request {request_id} {'approved' if decision else 'rejected'} by {approver_id}")
        
        return True
    
    def create_module(self, module_type: str, name: str, description: str,
                      configuration: Optional[Dict] = None,
                      voting_config: Optional[VotingConfiguration] = None,
                      funding_rules: Optional[Dict] = None,
                      compliance_requirements: Optional[List[str]] = None) -> str:
        """Create a governance module (education, healthcare, etc.)."""
        module_id = f"MOD-{module_type.upper()}-{int(time.time())}"
        
        module = GovernanceModule(
            module_id=module_id,
            module_type=module_type,
            name=name,
            description=description,
            version="1.0.0",
            configuration=configuration or {},
            voting_config=voting_config,
            funding_rules=funding_rules or {},
            compliance_requirements=compliance_requirements or []
        )
        
        self.modules[module_id] = module
        self._log_audit("MODULE_CREATED", f"Module {name} ({module_type}) created")
        
        return module_id
    
    def customize_module(self, module_id: str, updates: Dict[str, Any]) -> bool:
        """Advanced mode: Customize a module's configuration."""
        if module_id not in self.modules:
            return False
        
        module = self.modules[module_id]
        
        # Apply updates
        for key, value in updates.items():
            if hasattr(module, key):
                setattr(module, key, value)
            elif key in module.configuration:
                module.configuration[key] = value
            else:
                module.configuration[key] = value
        
        module.is_customized = True
        self._log_audit("MODULE_CUSTOMIZED", f"Module {module_id} customized in advanced mode")
        
        return True
    
    def configure_voting_mechanism(self, module_id: str, mechanism: VotingMechanism,
                                    parameters: Optional[Dict] = None,
                                    custom_rules: Optional[List[str]] = None,
                                    quorum: float = 0.5,
                                    threshold: float = 0.5) -> bool:
        """Configure or update voting mechanism for a module (advanced mode)."""
        if module_id not in self.modules:
            return False
        
        voting_config = VotingConfiguration(
            mechanism=mechanism,
            parameters=parameters or {},
            custom_rules=custom_rules or [],
            quorum_requirement=quorum,
            threshold=threshold
        )
        
        self.modules[module_id].voting_config = voting_config
        self.modules[module_id].is_customized = True
        
        self._log_audit("VOTING_CONFIGURED", f"Module {module_id} configured with {mechanism.value}")
        
        return True
    
    def initiate_voting_session(self, module_id: str, proposal: str,
                                 voters: List[str], duration_hours: int = 24) -> Optional[str]:
        """Initiate a voting session for a proposal."""
        if module_id not in self.modules:
            return None
        
        module = self.modules[module_id]
        if not module.voting_config:
            # Default to first-past-the-post if not configured
            module.voting_config = VotingConfiguration(
                mechanism=VotingMechanism.FIRST_PAST_THE_POST
            )
        
        session_id = f"VOTE-{int(time.time())}-{hashlib.sha256(proposal.encode()).hexdigest()[:8]}"
        
        self.voting_sessions[session_id] = {
            "session_id": session_id,
            "module_id": module_id,
            "proposal": proposal,
            "voters": voters,
            "votes": {},
            "start_time": time.time(),
            "end_time": time.time() + (duration_hours * 3600),
            "status": "active",
            "mechanism": module.voting_config.mechanism.value,
            "results": None
        }
        
        self._log_audit("VOTING_INITIATED", f"Session {session_id} started for module {module_id}")
        
        return session_id
    
    def cast_vote(self, session_id: str, voter_id: str, vote_data: Any) -> bool:
        """Cast a vote in an active session."""
        if session_id not in self.voting_sessions:
            return False
        
        session = self.voting_sessions[session_id]
        
        if session["status"] != "active":
            return False
        
        if time.time() > session["end_time"]:
            session["status"] = "closed"
            return False
        
        if voter_id not in session["voters"]:
            return False
        
        # Record vote (format depends on voting mechanism)
        session["votes"][voter_id] = {
            "vote": vote_data,
            "timestamp": time.time()
        }
        
        self._log_audit("VOTE_CAST", f"Vote cast in session {session_id} by {voter_id}")
        
        return True
    
    def finalize_voting_session(self, session_id: str) -> Optional[Dict]:
        """Finalize a voting session and calculate results."""
        if session_id not in self.voting_sessions:
            return None
        
        session = self.voting_sessions[session_id]
        
        if session["status"] == "finalized":
            return session["results"]
        
        # Calculate results based on voting mechanism
        mechanism = session["mechanism"]
        votes = session["votes"]
        
        results = {
            "total_votes": len(votes),
            "participation_rate": len(votes) / len(session["voters"]) if session["voters"] else 0,
            "outcome": None,
            "details": {}
        }
        
        # Simple implementation for different mechanisms
        if mechanism == VotingMechanism.FIRST_PAST_THE_POST.value:
            # Count votes for each option
            vote_counts = {}
            for voter_data in votes.values():
                vote = voter_data["vote"]
                vote_counts[vote] = vote_counts.get(vote, 0) + 1
            
            results["details"] = vote_counts
            if vote_counts:
                winner = max(vote_counts, key=vote_counts.get)
                results["outcome"] = winner
        
        elif mechanism == VotingMechanism.RANKED_BALLOT.value:
            # Simplified ranked ballot counting
            rankings = {}
            for voter_data in votes.values():
                ranking = voter_data["vote"]  # Expected: list of candidates in order
                if isinstance(ranking, list) and ranking:
                    first_choice = ranking[0]
                    rankings[first_choice] = rankings.get(first_choice, 0) + 1
            
            results["details"] = rankings
            if rankings:
                winner = max(rankings, key=rankings.get)
                results["outcome"] = winner
        
        # Check quorum requirement
        module = self.modules.get(session["module_id"])
        if module and module.voting_config:
            if results["participation_rate"] < module.voting_config.quorum_requirement:
                results["outcome"] = None  # No quorum
                results["quorum_not_met"] = True
        
        session["results"] = results
        session["status"] = "finalized"
        
        self._log_audit("VOTING_FINALIZED", f"Session {session_id} finalized with outcome: {results['outcome']}")
        
        return results
    
    def get_oversight_queue(self) -> List[Dict]:
        """Get items requiring human oversight."""
        return self.oversight_queue.copy()
    
    def get_audit_log(self, limit: int = 100) -> List[Dict]:
        """Retrieve audit log entries."""
        return self.audit_log[-limit:]
    
    def _log_audit(self, action: str, details: str):
        """Log an action to the audit trail."""
        entry = {
            "timestamp": time.time(),
            "datetime": datetime.now().isoformat(),
            "action": action,
            "details": details,
            "region": self.region
        }
        self.audit_log.append(entry)
    
    def export_capsule_state(self) -> Dict:
        """Export complete capsule state for transparency/audit."""
        return {
            "region": self.region,
            "entities": {k: v.to_dict() for k, v in self.entities.items()},
            "funding_requests": {k: v.to_dict() for k, v in self.funding_requests.items()},
            "modules": {k: v.to_dict() for k, v in self.modules.items()},
            "voting_sessions": self.voting_sessions,
            "audit_log_entries": len(self.audit_log),
            "pending_oversight": len(self.oversight_queue),
            "exported_at": datetime.now().isoformat()
        }


# Convenience function to create pre-configured Ontario capsule
def create_ontario_capsule() -> CanadianGovernmentCapsule:
    """Create a pre-configured capsule for Ontario with standard modules."""
    capsule = CanadianGovernmentCapsule(region="Ontario")
    
    # Create standard governance modules
    education_module = capsule.create_module(
        module_type="education",
        name="Ontario Education System",
        description="K-12 and post-secondary education governance",
        configuration={
            "levels": ["elementary", "secondary", "post_secondary"],
            "boards": ["public", "catholic", "french_public", "french_catholic"]
        },
        compliance_requirements=["Education Act", "Curriculum Standards", "Accessibility"]
    )
    
    healthcare_module = capsule.create_module(
        module_type="healthcare",
        name="Ontario Healthcare System",
        description="OHIP and healthcare service delivery",
        configuration={
            "coverage": "universal",
            "services": ["primary_care", "emergency", "specialist", "hospital"]
        },
        compliance_requirements=["Health Insurance Act", "PHIPA", "Quality Standards"]
    )
    
    elder_care_module = capsule.create_module(
        module_type="elder_care",
        name="Ontario Elder Care Programs",
        description="Senior support and long-term care",
        configuration={
            "programs": ["home_care", "long_term_care", "pension_supplement"],
            "eligibility_age": 65
        },
        compliance_requirements=["Long-Term Care Act", "Senior Support Standards"]
    )
    
    welfare_module = capsule.create_module(
        module_type="welfare",
        name="Ontario Works & Social Assistance",
        description="Social welfare and employment support programs",
        configuration={
            "programs": ["ontario_works", "odsp", "employment_support"],
            "payment_schedule": "monthly"
        },
        compliance_requirements=["Ontario Works Act", "ODSP Act", "Financial Eligibility"]
    )
    
    # Configure default voting mechanisms
    capsule.configure_voting_mechanism(
        education_module,
        VotingMechanism.RANKED_BALLOT,
        parameters={"max_rankings": 5},
        quorum=0.4
    )
    
    capsule.configure_voting_mechanism(
        healthcare_module,
        VotingMechanism.FIRST_PAST_THE_POST,
        quorum=0.5
    )
    
    return capsule


if __name__ == "__main__":
    # Demo usage
    print("Initializing Canadian Government Capsule for Ontario...")
    capsule = create_ontario_capsule()
    
    print("\n=== Registered Entities ===")
    for entity_id, entity in capsule.entities.items():
        print(f"  {entity.name} ({entity.jurisdiction_level.value})")
    
    print("\n=== Governance Modules ===")
    for module_id, module in capsule.modules.items():
        print(f"  {module.name} [{module.module_type}]")
        if module.voting_config:
            print(f"    Voting: {module.voting_config.mechanism.value}")
    
    # Example: Create a funding request
    toronto_id = "CA-ON-TOR-MUN-001"
    request_id = capsule.create_funding_request(
        requester_id=toronto_id,
        amount=5000000,
        purpose="New Community Center",
        program_type="municipal_infrastructure",
        justification="Serving underserved neighborhoods in Ward 12",
        oversight_type=OversightType.JOINT_OVERSIGHT
    )
    
    print(f"\n=== Funding Request Created ===")
    print(f"  Request ID: {request_id}")
    print(f"  Amount: $5,000,000")
    print(f"  Purpose: New Community Center")
    
    # Example: Process funding with AI assessment
    ai_assessment = {
        "risk_score": 0.15,
        "compliance_check": "passed",
        "budget_impact": "low",
        "recommendation": "approve"
    }
    
    capsule.process_funding_request(
        request_id=request_id,
        approver_id="ONTARIO-FINANCE-001",
        decision=True,
        ai_assessment=ai_assessment,
        reviewer_name="Jane Smith, Finance Minister"
    )
    
    print("\n=== Audit Log (Last 5 entries) ===")
    for entry in capsule.get_audit_log(limit=5):
        print(f"  [{entry['datetime']}] {entry['action']}: {entry['details']}")
    
    print("\n=== Capsule State Export ===")
    state = capsule.export_capsule_state()
    print(f"  Region: {state['region']}")
    print(f"  Entities: {len(state['entities'])}")
    print(f"  Modules: {len(state['modules'])}")
    print(f"  Funding Requests: {len(state['funding_requests'])}")
    print(f"  Audit Entries: {state['audit_log_entries']}")
    
    print("\n✓ Canadian Government Capsule initialized successfully!")
