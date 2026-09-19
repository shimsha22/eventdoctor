from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# --- Evidence Package Schemas ---
class MetricPoint(BaseModel):
    timestamp: str
    metric_name: str
    value: float
    unit: str


class LogEntry(BaseModel):
    timestamp: str
    level: str
    service: str
    message: str


class EvidencePackage(BaseModel):
    incident_id: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    affected_services: List[str]
    time_window_start: str
    time_window_end: str
    sqs_queue_depth: int
    dlq_message_count: int
    retry_counts: int
    metrics: List[MetricPoint]
    logs: List[LogEntry]
    github_deploy_commit: Optional[str] = None
    failed_event_samples: List[Dict[str, Any]] = []


# --- RCA (Root Cause Analysis) Schemas ---
class CausalChainLink(BaseModel):
    step: int
    description: str


class RCAResult(BaseModel):
    incident_id: str
    summary: str
    timeline: List[str]
    affected_services: List[str]
    symptoms: List[str]
    candidate_root_causes: List[str]
    most_likely_root_cause: str
    contributing_factors: List[str]
    supporting_evidence: List[str]
    evidence_ruling_out_alternatives: List[str]
    causal_chain: List[CausalChainLink]
    confidence_level: str = Field(..., description="High, Medium, or Low")
    recommended_remediation: str


# --- Remediation Schemas ---
class RemediationProposal(BaseModel):
    incident_id: str
    files_affected: List[str]
    conceptual_change: str
    reasoning: str
    expected_behavior: str
    risks: List[str]
    validation_plan: str
    code_diff: str


# --- Validation Report Schemas ---
class ValidationReport(BaseModel):
    incident_id: str
    test_run_id: str
    build_passed: bool
    unit_tests_passed: bool
    security_checks_passed: bool
    simulated_event_replay_passed: bool
    details: str
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())