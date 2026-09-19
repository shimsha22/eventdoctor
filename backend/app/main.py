from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.models.schemas import (
    EvidencePackage,
    RCAResult,
    RemediationProposal,
    ValidationReport,
)
from app.api import incidents  # <-- NEW IMPORT

app = FastAPI(
    title="EventDoctor API",
    description="Incident investigation and controlled remediation orchestrator",
    version="0.1.0",
)

# Enable CORS for local Next.js development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# <-- REGISTER THE ROUTER HERE
app.include_router(incidents.router)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "eventdoctor-api",
        "region": settings.AWS_REGION,
    }