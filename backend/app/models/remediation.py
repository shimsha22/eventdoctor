from pydantic import BaseModel
from typing import List

class RemediationProposal(BaseModel):
    incident_id: str
    affected_file: str
    proposed_diff: str
    reasoning: str
    risk_level: str
    validation_plan: str