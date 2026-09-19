from fastapi import APIRouter, BackgroundTasks
from app.simulation.simulator import generate_silent_degradation_incident
from app.models.schemas import EvidencePackage, RCAResult
from app.aws.s3 import save_evidence_package
from app.aws.dynamodb import create_incident_record
from app.ai.bedrock_nova import BedrockClaudeProvider

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])
ai_provider = BedrockClaudeProvider()

@router.post("/simulate", response_model=EvidencePackage)
def simulate_incident(background_tasks: BackgroundTasks):
    """Triggers a simulated production incident and saves artifacts to AWS."""
    evidence_pkg, incident_id = generate_silent_degradation_incident()
    evidence_dict = evidence_pkg.model_dump()
    
    def save_to_aws():
        s3_key = save_evidence_package(incident_id, evidence_dict)
        create_incident_record(incident_id, evidence_pkg.affected_services, s3_key)
        
    background_tasks.add_task(save_to_aws)
    return evidence_pkg

@router.post("/{incident_id}/analyze", response_model=RCAResult)
def analyze_incident(incident_id: str):
    """Sends the simulated evidence package to Amazon Bedrock (Claude) to generate an RCA."""
    # For the hackathon workflow, we regenerate/simulate the evidence package to pass directly to Claude
    evidence_pkg, _ = generate_silent_degradation_incident()
    evidence_pkg.incident_id = incident_id  # Align ID
    
    rca_result = ai_provider.generate_rca(evidence_pkg)
    return rca_result