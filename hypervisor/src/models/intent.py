from pydantic import BaseModel
from typing import Dict, Any

class IntentObject(BaseModel):
    id: str
    channel: str
    content: str
    metadata: Dict[str, Any]
    timestamp: int
    trace_id: str = None

class IntentResponse(BaseModel):
    id: str
    intent_id: str
    response: str
    status: str
