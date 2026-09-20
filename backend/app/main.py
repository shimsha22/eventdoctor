from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import incidents, remediation
from app.core.config import settings

app = FastAPI(
    title="EventDoctor API",
    description="Incident investigation and controlled remediation orchestrator",
    version="0.1.0",
)

# Enable CORS for local Next.js development
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:(3000|3001|3002)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REGISTER THE ROUTERS
app.include_router(incidents.router)
app.include_router(incidents.compat_router)
app.include_router(remediation.router)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "eventdoctor-api",
        "region": settings.AWS_REGION,
    }

@app.get("/")
def root():
    return {"status": "EventDoctor Backend is running live!"}