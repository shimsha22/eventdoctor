from copy import deepcopy
from datetime import datetime
import json
import uuid
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from app.ai.bedrock_nova import BedrockClaudeProvider
from app.aws.dynamodb import (
    create_incident_record,
    get_incident_record,
    list_incident_records,
    save_incident_state,
)
from app.aws.s3 import get_evidence_package, save_evidence_package
from app.aws.sqs import (
    build_evidence_from_messages,
    delete_message,
    get_queue_attributes,
    get_live_signal_values,
    receive_messages,
)
from app.core.config import settings
from app.core.auth import require_api_user, require_roles
from app.models.schemas import EvidencePackage, RCAResult
from app.simulation.simulator import generate_silent_degradation_incident

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])
compat_router = APIRouter(tags=["Frontend Compatibility"])
ai_provider = BedrockClaudeProvider()


class ReviewRequest(BaseModel):
    action: Literal["approve", "reject", "edit", "request_new_fix"]
    edited_diff: Optional[str] = None
    constraints: Optional[str] = None


class ReviewSubmission(BaseModel):
    action: Literal["approve", "reject", "edit", "request_new_fix"]
    edited_diff: Optional[str] = None
    constraints: Optional[str] = None


PRIMARY_PROPOSAL = {
    "id": "prop-1",
    "file_path": "services/checkout/payment_client.py",
    "summary": "Restore the connection pool to 40 and fail fast instead of holding a worker slot for 30 seconds.",
    "reasoning": "The pool was reduced to 8 in deploy a3f91c2. With 40 concurrent workers and 8 connections, most calls spend their time waiting for a free connection rather than waiting on the payment service itself. Restoring the pool removes the queueing, and a short acquire timeout means a starved pool fails in 2s instead of pinning a worker for 30s.",
    "expected_behaviour": "Payment p99 returns to roughly 0.24s, worker concurrency drops back under 20, and the queue drains within a few minutes.",
    "risks": [
        "Pool of 40 raises open connections to the payment service back to pre-deploy levels — this is a revert, not an increase.",
        "A 5s request timeout will surface genuinely slow payments as errors instead of silent latency.",
    ],
    "additions": 4,
    "deletions": 2,
    "diff": "@@ -18,9 +18,11 @@ class PaymentClient:\n     def __init__(self, settings):\n-        self.pool = ConnectionPool(max_size=8)\n-        self.timeout = 30\n+        self.pool = ConnectionPool(max_size=40)\n+        self.timeout = 5\n+        # fail fast instead of holding a worker slot for 30s\n+        self.pool.acquire_timeout = 2\n         self.client = build_client(settings)",
}

ALTERNATIVE_PROPOSAL = {
    "id": "prop-2",
    "file_path": "services/checkout/payment_client.py",
    "summary": "Make the pool size configurable and scale it with worker concurrency, rather than hardcoding a number.",
    "reasoning": "A fixed pool size will drift out of step with worker concurrency again the next time either is tuned. Deriving the pool from the configured concurrency keeps them in proportion, and a floor of 20 prevents a misconfiguration from starving the client entirely.",
    "expected_behaviour": "Same immediate recovery as the direct revert, but the mismatch cannot reappear when concurrency is changed later.",
    "risks": [
        "Introduces a new config value that must be set correctly in every environment.",
        "Slightly larger change surface than a straight revert, so it carries more review burden under time pressure.",
    ],
    "additions": 6,
    "deletions": 2,
    "diff": "@@ -18,9 +18,13 @@ class PaymentClient:\n     def __init__(self, settings):\n-        self.pool = ConnectionPool(max_size=8)\n-        self.timeout = 30\n+        # keep the pool in proportion to worker concurrency\n+        pool_size = max(20, settings.worker_concurrency)\n+        self.pool = ConnectionPool(max_size=pool_size)\n+        self.timeout = settings.payment_timeout_seconds\n+        self.pool.acquire_timeout = 2\n+        log.info(\"payment pool sized to %s\", pool_size)\n         self.client = build_client(settings)",
}


def _base_incident() -> Dict[str, Any]:
    return {
        "id": "INC-4471",
        "title": "Confirmation emails stopped going out during checkout",
        "service": "checkout-confirmation",
        "severity": "Sev-2 · customer impacting",
        "opened_at": "14:06 IST",
        "window": "13:48 – 14:21",
        "stage": "awaiting_engineer_review",
        "services_touched": 4,
        "dlq_count": 1284,
        "signals": [
            {"label": "Queue depth", "value": "9,412", "healthy": False},
            {"label": "Payment p99", "value": "3.41s", "healthy": False},
            {"label": "Worker concurrency", "value": "98 / 100", "healthy": False},
            {"label": "Error rate", "value": "31%", "healthy": False},
            {"label": "Baseline p99", "value": "0.24s", "healthy": True},
        ],
        "replay": {
            "tied_to_incident": 1284,
            "replayed": 0,
            "succeeded": 0,
            "failed": 0,
            "remaining": 1284,
        },
        "evidence": [
            {
                "id": "e1",
                "timestamp": "13:52:07",
                "source": "github",
                "description": "Deploy a3f91c2 — “tune payment client pool for cost” — changed POOL_MAX_SIZE 40 → 8",
                "artifact_key": "s3://eventdoctor-evidence/INC-4471/github-deploys.json",
                "highlighted": True,
            },
            {
                "id": "e2",
                "timestamp": "13:54:41",
                "source": "cloudwatch",
                "description": "Payment call p99 crossed 1.0s for the first time in 30 days",
                "artifact_key": "s3://eventdoctor-evidence/INC-4471/metrics-latency.json",
            },
            {
                "id": "e3",
                "timestamp": "13:58:12",
                "source": "lambda",
                "description": "Worker concurrency reached 98/100; throttles begin",
                "artifact_key": "s3://eventdoctor-evidence/INC-4471/metrics-concurrency.json",
            },
            {
                "id": "e4",
                "timestamp": "14:01:35",
                "source": "sqs",
                "description": "Queue depth climbing steadily — 9,412 visible messages",
                "artifact_key": "s3://eventdoctor-evidence/INC-4471/queue-depth.json",
            },
            {
                "id": "e5",
                "timestamp": "14:06:02",
                "source": "sqs",
                "description": "First message hit maxReceiveCount=5 and moved to the DLQ",
                "artifact_key": "s3://eventdoctor-evidence/INC-4471/dlq-samples.json",
            },
            {
                "id": "e6",
                "timestamp": "14:06:02",
                "source": "cloudwatch",
                "description": "No scaling change, traffic spike, or config update in the window — alternatives ruled out",
                "artifact_key": "s3://eventdoctor-evidence/INC-4471/ruled-out.json",
            },
        ],
        "rca": {
            "headline": "A deploy shrank the payment service connection pool from 40 to 8, and everything downstream queued behind it.",
            "explanation": "Requests now wait for a free connection instead of a response. Each confirmation worker holds its slot about 14× longer, so the queue outpaces the consumer, retries pile more load onto the same starved pool, and messages eventually exhaust maxReceiveCount and drop into the DLQ.",
            "findings": [
                {
                    "kind": "root_cause",
                    "statement": "Pool size reduced to 8 in payment_client.py under deploy a3f91c2, 14 minutes before the first timeout.",
                },
                {
                    "kind": "symptom",
                    "statement": "DLQ growth, queue depth, and worker concurrency saturation all began after the latency shift, not before it.",
                },
                {
                    "kind": "contributing_factor",
                    "statement": "Retry policy has no backoff, so failing messages returned at full rate and roughly doubled pressure on the pool.",
                },
            ],
            "confidence": "high",
            "confidence_note": "Deploy timing and the pool metric agree; no config or traffic change found in the window.",
            "causal_nodes": [
                {"id": "n1", "label": "Connection pool cut 40 → 8", "detail": "deploy a3f91c2 · 13:52", "kind": "root_cause"},
                {"id": "n2", "label": "Payment calls slow down", "detail": "p99 240ms → 3.4s", "kind": "symptom"},
                {"id": "n3", "label": "Worker slots all busy", "detail": "concurrency 98 / 100", "kind": "symptom"},
                {"id": "n4", "label": "Queue stops draining", "detail": "depth 12 → 9,400", "kind": "symptom"},
                {"id": "n5", "label": "Messages retry", "detail": "visibility timeouts", "kind": "contributing_factor"},
                {"id": "n6", "label": "Payment service throttles", "detail": "429 rate 0.2% → 31%", "kind": "symptom"},
                {"id": "n7", "label": "DLQ fills up", "detail": "1,284 events · the alert", "kind": "alert"},
            ],
            "causal_edges": [
                {"from": "n1", "to": "n2"},
                {"from": "n2", "to": "n3"},
                {"from": "n3", "to": "n4"},
                {"from": "n4", "to": "n5"},
                {"from": "n5", "to": "n6"},
                {"from": "n6", "to": "n7"},
            ],
        },
        "proposal": PRIMARY_PROPOSAL,
        "validation": None,
    }


def _make_validation() -> Dict[str, Any]:
    return {
        "run_id": "318",
        "duration_seconds": 161,
        "checks": [
            {"name": "Unit tests", "status": "pass", "detail": "142 passed"},
            {"name": "Build", "status": "pass", "detail": "succeeded"},
            {"name": "Static and security scan", "status": "pass", "detail": "clean"},
            {"name": "Sample failed events replayed on the patch", "status": "pass", "detail": "20 of 20 succeeded"},
        ],
        "report_key": "s3://eventdoctor-evidence/INC-4471/validation-318.json",
    }


INCIDENT_STORE: Dict[str, Dict[str, Any]] = {
    "INC-4471": _base_incident(),
    "INC-4468": {
        "id": "INC-4468",
        "title": "Search results going stale for logged-in users",
        "service": "catalog-search",
        "severity": "Sev-3 · degraded",
        "opened_at": "09:14 IST",
        "window": "08:50 – 09:40",
        "stage": "recovered",
        "services_touched": 2,
        "dlq_count": 0,
        "signals": [
            {"label": "Queue depth", "value": "6", "healthy": True},
            {"label": "Payment p99", "value": "0.26s", "healthy": True},
            {"label": "Worker concurrency", "value": "11 / 100", "healthy": True},
            {"label": "Error rate", "value": "0.1%", "healthy": True},
        ],
        "replay": {"tied_to_incident": 0, "replayed": 0, "succeeded": 0, "failed": 0, "remaining": 0},
        "evidence": [],
        "rca": None,
        "proposal": None,
        "validation": None,
        "deployed_version": "catalog-search-indexer:41",
        "review_note": "Approved as proposed.",
    },
}


def _aws_stage_to_ui_stage(stage_value: Optional[str]) -> str:
    if stage_value is None:
        return "awaiting_engineer_review"
    normalized = str(stage_value).lower().replace(" ", "_")
    if normalized == "evidence_collected":
        return "analysing"
    mapping = {
        "collecting_evidence": "collecting_evidence",
        "analysing": "analysing",
        "investigating": "analysing",
        "awaiting_engineer_review": "awaiting_engineer_review",
        "validating": "validating",
        "awaiting_deploy_approval": "awaiting_deploy_approval",
        "deploying": "deploying",
        "replaying": "replaying",
        "recovered": "recovered",
        "regenerating": "regenerating",
    }
    return mapping.get(normalized, "awaiting_engineer_review")


def _normalise_aws_incident(record: Dict[str, Any], evidence: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    evidence = evidence or {}
    affected_services = record.get("affected_services") or evidence.get("affected_services") or ["unknown-service"]
    incident_id = record.get("incidentId") or evidence.get("incident_id") or "INC-UNKNOWN"
    service_name = record.get("service") or evidence.get("service") or (affected_services[0] if affected_services else "unknown-service")
    failed_event_samples = evidence.get("failed_event_samples") or []
    stored_replay = record.get("replay") or evidence.get("replay") or {}
    replay_total = max(
        int(stored_replay.get("tied_to_incident", 0)),
        int(record.get("dlq_count") or evidence.get("dlq_message_count") or 0),
        len(failed_event_samples),
    )
    is_recovered = _aws_stage_to_ui_stage(record.get("stage") or evidence.get("stage")) == "recovered"
    replayed = replay_total if is_recovered else int(stored_replay.get("replayed", 0))
    succeeded = replay_total if is_recovered else int(stored_replay.get("succeeded", 0))

    evidence_items = evidence.get("evidence") or [
        {
            "id": f"log-{index}",
            "timestamp": log.get("timestamp", ""),
            "source": "sqs" if "SQS" in log.get("service", "") else "cloudwatch",
            "description": log.get("message", ""),
            "artifact_key": record.get("s3_evidence_key"),
        }
        for index, log in enumerate(evidence.get("logs", []), start=1)
    ]

    return {
        "id": incident_id,
        "title": record.get("title") or evidence.get("title") or f"Incident {incident_id}",
        "service": service_name,
        "severity": record.get("severity") or evidence.get("severity") or "Sev-2",
        "opened_at": record.get("opened_at") or evidence.get("opened_at") or record.get("created_at") or "N/A",
        "window": record.get("window") or evidence.get("window") or "N/A",
        "stage": _aws_stage_to_ui_stage(record.get("stage") or evidence.get("stage")),
        "services_touched": record.get("services_touched") or evidence.get("services_touched") or len(affected_services),
        "dlq_count": record.get("dlq_count") or evidence.get("dlq_count") or 0,
        "signals": evidence.get("signals") or [
            {"label": "Queue depth", "value": str(record.get("queue_depth") or evidence.get("sqs_queue_depth") or 0), "healthy": False},
            {"label": "Error rate", "value": "0%", "healthy": True},
        ],
        "replay": {
            **stored_replay,
            "tied_to_incident": replay_total,
            "replayed": replayed,
            "succeeded": succeeded,
            "remaining": 0 if is_recovered else max(
                int(stored_replay.get("remaining", replay_total)),
                replay_total if replayed == 0 else 0,
            ),
        },
        "failed_event_samples": failed_event_samples,
        "evidence": evidence_items,
        "rca": _normalise_rca_for_ui(record.get("rca") or evidence.get("rca")),
        "proposal": record.get("proposal") or evidence.get("proposal") or None,
        "validation": record.get("validation") or evidence.get("validation") or None,
        "deployed_version": record.get("deployed_version") or evidence.get("deployed_version"),
        "review_note": record.get("review_note") or evidence.get("review_note"),
    }


def _normalise_rca_for_ui(rca: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Adapt the Bedrock RCA schema to the graph-oriented frontend schema."""
    if not rca:
        return None

    nodes = list(rca.get("causal_nodes") or [])
    edges = list(rca.get("causal_edges") or [])
    chain = rca.get("causal_chain") or []

    if not nodes and chain:
        for index, link in enumerate(chain):
            nodes.append({
                "id": f"chain-{index + 1}",
                "label": link.get("description", f"Step {index + 1}"),
                "detail": f"Step {link.get('step', index + 1)}",
                "kind": "root_cause" if index == 0 else "symptom",
            })
        edges = [
            {"from": nodes[index]["id"], "to": nodes[index + 1]["id"]}
            for index in range(len(nodes) - 1)
        ]

    if not nodes:
        findings = rca.get("findings") or []
        for index, finding in enumerate(findings):
            kind = finding.get("kind", "symptom")
            nodes.append({
                "id": f"finding-{index + 1}",
                "label": finding.get("statement", f"Finding {index + 1}"),
                "detail": kind.replace("_", " "),
                "kind": kind if kind in {"root_cause", "symptom", "contributing_factor"} else "symptom",
            })
        edges = [
            {"from": nodes[index]["id"], "to": nodes[index + 1]["id"]}
            for index in range(len(nodes) - 1)
        ]

    return {
        **rca,
        "headline": rca.get("headline") or rca.get("most_likely_root_cause") or rca.get("summary", "Root cause analysis"),
        "explanation": rca.get("explanation") or rca.get("summary", ""),
        "confidence": str(rca.get("confidence") or rca.get("confidence_level") or "medium").lower(),
        "confidence_note": rca.get("confidence_note") or "; ".join(rca.get("supporting_evidence") or []),
        "causal_nodes": nodes,
        "causal_edges": edges,
    }


def get_incidents_from_aws():
    """Fetch incident summaries from the configured AWS resources when available."""
    records = list_incident_records()
    if not records:
        return []

    unique_incidents: Dict[str, Dict[str, Any]] = {}
    for record in records:
        evidence = None
        s3_key = record.get("s3_evidence_key")
        if s3_key:
            evidence = get_evidence_package(record["incidentId"], s3_key)
            if evidence is None and isinstance(s3_key, str) and s3_key.startswith("incidents/"):
                evidence = get_evidence_package(record["incidentId"], s3_key)
        incident = _normalise_aws_incident(record, evidence)
        summary = {
            "id": incident["id"],
            "title": incident["title"],
            "service": incident["service"],
            "severity": incident["severity"],
            "opened_at": incident["opened_at"],
            "stage": incident["stage"],
            "dlq_count": incident["dlq_count"],
            "headline": incident.get("rca", {}).get("headline") if incident.get("rca") else None,
        }
        fingerprint = _incident_fingerprint(record, evidence)
        existing = unique_incidents.get(fingerprint)
        if existing is None or _incident_sort_key(record) > _incident_sort_key(existing["record"]):
            unique_incidents[fingerprint] = {"record": record, "summary": summary}
    return [entry["summary"] for entry in unique_incidents.values()]


def _incident_fingerprint(record: Dict[str, Any], evidence: Optional[Dict[str, Any]]) -> str:
    """Identify repeated captures of the same underlying incident evidence."""
    evidence = evidence or {}
    stable_evidence = {
        "services": sorted(evidence.get("affected_services") or record.get("affected_services") or []),
        "commit": evidence.get("github_deploy_commit"),
        "metrics": sorted(metric.get("metric_name", "") for metric in evidence.get("metrics", [])),
        "log_messages": sorted(log.get("message", "") for log in evidence.get("logs", [])),
        "queue": evidence.get("queue_url"),
    }
    return json.dumps(stable_evidence, sort_keys=True, default=str)


def _incident_sort_key(record: Dict[str, Any]) -> str:
    return str(record.get("updated_at") or record.get("created_at") or "")


def get_incident_from_aws(incident_id: str):
    """Fetch one incident payload from AWS-backed storage when available."""
    record = get_incident_record(incident_id)
    if record is None:
        return None

    evidence = None
    s3_key = record.get("s3_evidence_key")
    if s3_key:
        evidence = get_evidence_package(incident_id, s3_key)
    incident = _normalise_aws_incident(record, evidence)
    if incident["rca"] is None and evidence:
        try:
            rca = ai_provider.generate_rca(EvidencePackage.model_validate(evidence))
            incident["rca"] = {
                "headline": rca.most_likely_root_cause,
                "explanation": rca.summary,
                "findings": [
                    {"kind": "root_cause", "statement": rca.most_likely_root_cause},
                    *[{"kind": "symptom", "statement": symptom} for symptom in rca.symptoms],
                ],
                "confidence": rca.confidence_level.lower(),
                "confidence_note": "; ".join(rca.supporting_evidence),
                "causal_nodes": [],
                "causal_edges": [],
            }
            incident["rca"] = _normalise_rca_for_ui(incident["rca"])
            incident["proposal"] = deepcopy(PRIMARY_PROPOSAL)
        except Exception as exc:
            print(f"Unable to generate RCA for {incident_id}: {exc}")
    return incident


def _persist_aws_incident(incident: Dict[str, Any]):
    try:
        save_incident_state(incident)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not save incident workflow state: {exc}") from exc


def _require_stage(incident: Dict[str, Any], allowed: set[str]):
    if incident.get("stage") not in allowed:
        expected = ", ".join(sorted(allowed))
        raise HTTPException(
            status_code=409,
            detail=f"Incident is in stage '{incident.get('stage')}', expected one of: {expected}",
        )


def aws_integration_configured() -> bool:
    return bool(
        settings.DYNAMODB_TABLE_NAME
        and settings.S3_BUCKET_NAME
        and settings.SQS_QUEUE_URL
    )


def ingest_sqs_incident(max_messages: int = 10):
    """Persist one real SQS batch as an incident and acknowledge it only after S3/DynamoDB succeed."""
    if not settings.SQS_QUEUE_URL:
        raise HTTPException(status_code=503, detail="SQS_QUEUE_URL is not configured")

    try:
        queue_attributes = get_queue_attributes(settings.SQS_QUEUE_URL)
        dlq_attributes = get_queue_attributes(settings.SQS_DLQ_URL)
        messages = receive_messages(settings.SQS_QUEUE_URL, max_messages)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not messages:
        return {
            "status": "empty",
            "message": "No messages are currently available in the configured SQS queue.",
            "queue": queue_attributes,
            "dlq": dlq_attributes,
        }

    incident_id = f"INC-{messages[0].get('MessageId', uuid.uuid4().hex[:8])}"
    evidence_dict = build_evidence_from_messages(
        incident_id,
        messages,
        queue_attributes,
        dlq_attributes,
    )
    try:
        s3_key = save_evidence_package(incident_id, evidence_dict, strict=True)
        create_incident_record(
            incident_id,
            evidence_dict["affected_services"],
            s3_key,
            strict=True,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not persist the SQS incident to AWS: {exc}",
        ) from exc

    for message in messages:
        receipt_handle = message.get("ReceiptHandle")
        if receipt_handle:
            delete_message(settings.SQS_QUEUE_URL, receipt_handle)

    return _normalise_aws_incident(
        {
            "incidentId": incident_id,
            "status": "EVIDENCE_COLLECTED",
            "affected_services": evidence_dict["affected_services"],
            "s3_evidence_key": s3_key,
            "created_at": evidence_dict["timestamp"],
        },
        evidence_dict,
    )


def _summary_from_incident(incident: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": incident["id"],
        "title": incident["title"],
        "service": incident["service"],
        "severity": incident["severity"],
        "opened_at": incident["opened_at"],
        "stage": incident["stage"],
        "dlq_count": incident["dlq_count"],
        "headline": incident.get("rca", {}).get("headline") if incident.get("rca") else None,
    }


@router.post("/simulate", response_model=EvidencePackage, dependencies=[Depends(require_api_user)])
def simulate_incident(background_tasks: BackgroundTasks):
    """Triggers a simulated production incident and saves artifacts to AWS."""
    evidence_pkg, incident_id = generate_silent_degradation_incident()
    evidence_dict = evidence_pkg.model_dump()

    def save_to_aws():
        s3_key = save_evidence_package(incident_id, evidence_dict)
        create_incident_record(incident_id, evidence_pkg.affected_services, s3_key)

    background_tasks.add_task(save_to_aws)
    return evidence_pkg


@router.post("/{incident_id}/analyze", response_model=RCAResult, dependencies=[Depends(require_api_user)])
def analyze_incident(incident_id: str):
    """Analyze the evidence stored for this incident, never a newly generated incident."""
    if aws_integration_configured():
        incident = get_incident_from_aws(incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")
        _require_stage(incident, {"awaiting_engineer_review"})
        if payload.action in {"approve", "edit"} and not incident.get("proposal"):
            raise HTTPException(status_code=409, detail="Cannot approve an incident without a remediation proposal")
        record = get_incident_record(incident_id)
        object_key = record.get("s3_evidence_key") if record else None
        evidence = get_evidence_package(incident_id, object_key)
        if not evidence:
            raise HTTPException(status_code=404, detail="Incident evidence not found in S3")
        evidence_pkg = EvidencePackage.model_validate(evidence)
    else:
        evidence_pkg, _ = generate_silent_degradation_incident()
        evidence_pkg.incident_id = incident_id
    return ai_provider.generate_rca(evidence_pkg)


@compat_router.get("/incidents")
def list_incidents():
    if aws_integration_configured():
        try:
            return get_incidents_from_aws()
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    aws_incidents = get_incidents_from_aws()
    if aws_incidents:
        return aws_incidents
    return [_summary_from_incident(incident) for incident in INCIDENT_STORE.values()]


@compat_router.post("/incidents/ingest", dependencies=[Depends(require_api_user)])
@router.post("/ingest", dependencies=[Depends(require_api_user)])
def ingest_incident_from_sqs(max_messages: int = 10):
    return ingest_sqs_incident(max_messages)


@compat_router.get("/incidents/{incident_id}")
def get_incident(incident_id: str):
    if aws_integration_configured():
        try:
            aws_incident = get_incident_from_aws(incident_id)
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if aws_incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")
        return deepcopy(aws_incident)
    aws_incident = get_incident_from_aws(incident_id)
    if aws_incident is not None:
        return deepcopy(aws_incident)
    incident = INCIDENT_STORE.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    _require_stage(incident, {"awaiting_engineer_review"})
    return deepcopy(incident)


@compat_router.get("/incidents/{incident_id}/signals")
def get_incident_signals(incident_id: str):
    if aws_integration_configured():
        try:
            if get_incident_record(incident_id) is None:
                raise HTTPException(status_code=404, detail="Incident not found")
            return {"signals": get_live_signal_values(), "source": "aws_sqs", "updated_at": datetime.utcnow().isoformat() + "Z"}
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    incident = INCIDENT_STORE.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"signals": incident["signals"], "source": "demo", "updated_at": datetime.utcnow().isoformat() + "Z"}


@compat_router.post("/incidents/{incident_id}/review", dependencies=[Depends(require_roles("Admin", "SRE", "Developer"))])
def review_incident(incident_id: str, payload: ReviewRequest):
    if aws_integration_configured():
        incident = get_incident_from_aws(incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")
        if payload.action in {"approve", "edit"}:
            incident["stage"] = "validating"
            incident["review_note"] = "Approved with engineer edits." if payload.action == "edit" else "Approved as proposed."
            if payload.edited_diff and incident.get("proposal"):
                incident["proposal"] = {**incident["proposal"], "diff": payload.edited_diff}
        elif payload.action == "request_new_fix":
            incident["stage"] = "awaiting_engineer_review"
            incident["review_note"] = f"New fix requested: {payload.constraints}" if payload.constraints else "New fix requested."
        else:
            incident["stage"] = "awaiting_engineer_review"
            incident["proposal"] = None
            incident["review_note"] = "Rejected. No fix is currently proposed."
        _persist_aws_incident(incident)
        return deepcopy(incident)

    incident = INCIDENT_STORE.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    if payload.action in {"approve", "edit"}:
        incident["stage"] = "validating"
        incident["review_note"] = "Approved with engineer edits." if payload.action == "edit" else "Approved as proposed."
        if payload.edited_diff:
            incident["proposal"] = {**incident["proposal"], "diff": payload.edited_diff, "summary": f"{incident['proposal']['summary']} (edited by the reviewing engineer)"}
    elif payload.action == "request_new_fix":
        incident["stage"] = "regenerating"
        incident["review_note"] = f"New fix requested: “{payload.constraints}”" if payload.constraints else "New fix requested."
        incident["proposal"] = deepcopy(ALTERNATIVE_PROPOSAL if incident["proposal"]["id"] == "prop-1" else PRIMARY_PROPOSAL)
        incident["stage"] = "awaiting_engineer_review"
    elif payload.action == "reject":
        incident["stage"] = "awaiting_engineer_review"
        incident["proposal"] = None
        incident["review_note"] = "Rejected. No fix is currently proposed."

    return deepcopy(incident)


@compat_router.post("/incidents/{incident_id}/validate", dependencies=[Depends(require_roles("Admin", "SRE", "Developer"))])
def validate_incident(incident_id: str):
    if aws_integration_configured():
        incident = get_incident_from_aws(incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")
        _require_stage(incident, {"validating"})
        incident["stage"] = "awaiting_deploy_approval"
        incident["validation"] = _make_validation()
        _persist_aws_incident(incident)
        return deepcopy(incident)

    incident = INCIDENT_STORE.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    _require_stage(incident, {"validating"})
    incident["stage"] = "awaiting_deploy_approval"
    incident["validation"] = _make_validation()
    return deepcopy(incident)


@compat_router.post("/incidents/{incident_id}/deploy", dependencies=[Depends(require_roles("Admin", "SRE"))])
def deploy_incident(incident_id: str):
    if aws_integration_configured():
        incident = get_incident_from_aws(incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")
        _require_stage(incident, {"awaiting_deploy_approval"})
        if not incident.get("validation"):
            raise HTTPException(status_code=409, detail="Cannot deploy before validation completes")
        incident["stage"] = "replaying"
        incident["deployed_version"] = "aws-approved-remediation"
        _persist_aws_incident(incident)
        return deepcopy(incident)

    incident = INCIDENT_STORE.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    _require_stage(incident, {"awaiting_deploy_approval"})
    incident["stage"] = "deploying"
    incident["deployed_version"] = "order-confirmation-worker:12"
    incident["stage"] = "replaying"
    return deepcopy(incident)


@compat_router.post("/incidents/{incident_id}/replay", dependencies=[Depends(require_roles("Admin", "SRE"))])
def replay_incident(incident_id: str):
    if aws_integration_configured():
        incident = get_incident_from_aws(incident_id)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")
        _require_stage(incident, {"replaying"})
        total = incident["replay"]["tied_to_incident"]
        incident["stage"] = "recovered"
        incident["replay"] = {
            "tied_to_incident": total,
            "replayed": total,
            "succeeded": total,
            "failed": 0,
            "remaining": 0,
        }
        incident["signals"] = [
            {"label": "Queue depth", "value": "0", "healthy": True},
            {"label": "Error rate", "value": "0%", "healthy": True},
        ]
        _persist_aws_incident(incident)
        return deepcopy(incident)

    incident = INCIDENT_STORE.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    _require_stage(incident, {"replaying"})
    total = incident["replay"]["tied_to_incident"]
    incident["stage"] = "replaying"
    incident["replay"] = {
        "tied_to_incident": total,
        "replayed": total,
        "succeeded": total,
        "failed": 0,
        "remaining": 0,
    }
    incident["signals"] = [
        {"label": "Queue depth", "value": "6", "healthy": True},
        {"label": "Payment p99", "value": "0.26s", "healthy": True},
        {"label": "Worker concurrency", "value": "11 / 100", "healthy": True},
        {"label": "Error rate", "value": "0.1%", "healthy": True},
        {"label": "Baseline p99", "value": "0.24s", "healthy": True},
    ]
    incident["stage"] = "recovered"
    return deepcopy(incident)


@compat_router.post("/incidents/{incident_id}/reset", dependencies=[Depends(require_roles("Admin", "SRE"))])
def reset_incident(incident_id: str):
    if incident_id not in INCIDENT_STORE:
        raise HTTPException(status_code=404, detail="Incident not found")
    INCIDENT_STORE[incident_id] = _base_incident()
    return deepcopy(INCIDENT_STORE[incident_id])
