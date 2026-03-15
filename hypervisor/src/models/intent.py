from pydantic import BaseModel
from typing import Dict, Any

class IntentObject(BaseModel):
    id: str
    session_id: str = "default"
    channel: str
    content: str
    metadata: Dict[str, Any]
    timestamp: int

class IntentResponse(BaseModel):
    id: str
    intent_id: str
    response: str
    status: str
    confidence: float = 1.0
    provenance: list = []
