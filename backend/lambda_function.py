import base64
import json
import os
import uuid
from datetime import datetime, timezone

import boto3


table = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "ap-south-1")).Table(
    os.environ.get("DYNAMODB_TABLE_NAME", "EventDoctorIncidents")
)
sqs = boto3.client("sqs", region_name=os.environ.get("AWS_REGION", "ap-south-1"))
QUEUE_URL = os.environ.get(
    "SQS_QUEUE_URL",
    "https://sqs.ap-south-1.amazonaws.com/554631439775/EventDoctorQueue",
)


def response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "http://localhost:3000",
            "Access-Control-Allow-Headers": "Authorization,Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(payload, default=str),
    }


def ui_stage(item):
    value = str(item.get("stage") or item.get("status") or "collecting_evidence").lower()
    return {
        "open": "collecting_evidence",
        "evidence_collected": "analysing",
        "analyzed": "awaiting_engineer_review",
        "analyzing": "analysing",
        "awaiting_engineer_review": "awaiting_engineer_review",
        "validating": "validating",
        "awaiting_deploy_approval": "awaiting_deploy_approval",
        "deploying": "deploying",
        "replaying": "replaying",
        "recovered": "recovered",
    }.get(value, "collecting_evidence")


def request_path(event):
    return event.get("rawPath") or event.get("path") or "/"


def request_method(event):
    return (event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod") or "GET").upper()


def body_from_event(event):
    body = event.get("body")
    if body is None:
        return {}
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    if isinstance(body, str):
        return json.loads(body) if body else {}
    return body


def summary(item):
    return {
        "id": item.get("incidentId"),
        "title": item.get("title") or item.get("description") or f"Incident {item.get('incidentId')}",
        "service": item.get("service", "unknown"),
        "severity": item.get("severity", "medium"),
        "opened_at": item.get("opened_at") or item.get("createdAt"),
        "stage": ui_stage(item),
        "dlq_count": int(item.get("dlq_count", 0)),
        "headline": item.get("headline"),
    }


def full_incident(item):
    incident_id = item.get("incidentId")
    return {
        **summary(item),
        "window": item.get("window", "N/A"),
        "services_touched": int(item.get("services_touched", 1)),
        "signals": item.get("signals", []),
        "replay": item.get("replay", {
            "tied_to_incident": int(item.get("dlq_count", 0)),
            "replayed": 0,
            "succeeded": 0,
            "failed": 0,
            "remaining": int(item.get("dlq_count", 0)),
        }),
        "evidence": item.get("evidence", []),
        "rca": item.get("rca"),
        "proposal": item.get("proposal"),
        "validation": item.get("validation"),
        "failed_event_samples": item.get("failed_event_samples", []),
        "deployed_version": item.get("deployed_version"),
        "review_note": item.get("review_note"),
        "source": "dynamodb",
        "incident_id": incident_id,
    }


def lambda_handler(event, context):
    method = request_method(event)
    path = request_path(event)

    if method == "OPTIONS":
        return response(204, {})

    if method == "GET" and path.rstrip("/") == "/incidents":
        items = []
        scan_kwargs = {}
        while True:
            result = table.scan(**scan_kwargs)
            items.extend(result.get("Items", []))
            last_key = result.get("LastEvaluatedKey")
            if not last_key:
                break
            scan_kwargs["ExclusiveStartKey"] = last_key
        return response(200, [summary(item) for item in items])

    if method == "GET" and (path.startswith("/incidents/") or event.get("pathParameters", {}).get("incident_id")):
        incident_id = event.get("pathParameters", {}).get("incident_id") or path.rstrip("/").split("/")[-1]
        result = table.get_item(Key={"incidentId": incident_id})
        item = result.get("Item")
        if not item:
            return response(404, {"detail": "Incident not found"})
        return response(200, full_incident(item))

    if method == "POST" and path.rstrip("/") == "/incidents":
        body = body_from_event(event)
        incident_id = str(uuid.uuid4())
        incident = {
            "incidentId": incident_id,
            "status": "OPEN",
            "service": body.get("service", "unknown"),
            "severity": body.get("severity", "medium"),
            "description": body.get("description", "No description provided"),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        table.put_item(Item=incident)
        sqs.send_message(QueueUrl=QUEUE_URL, MessageBody=json.dumps(incident))
        return response(201, {"message": "Incident created successfully", "incident": incident})

    return response(404, {"message": "Not Found"})
