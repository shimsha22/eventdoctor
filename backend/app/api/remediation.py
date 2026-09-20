from fastapi import APIRouter, Depends, HTTPException
from app.core.auth import require_roles

router = APIRouter(prefix="/api/remediation", tags=["Remediation"])

@router.get("/{incident_id}/proposal", dependencies=[Depends(require_roles("Admin", "SRE", "Developer"))])
def get_remediation_proposal(incident_id: str):
    raise HTTPException(
        status_code=501,
        detail=(
            f"Live remediation generation is not configured for incident {incident_id}. "
            "Set GITHUB_REPO and implement a repository-specific proposal provider before enabling this route."
        ),
    )