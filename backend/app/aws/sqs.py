from datetime import datetime, timezone
import json
from typing import Any, Dict, List

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings


sqs_client = boto3.client("sqs", region_name=settings.AWS_REGION)


def get_queue_attributes(queue_url: str) -> Dict[str, int]:
    """Read the current visible, in-flight, and delayed message counts."""
    if not queue_url:
        return {"visible": 0, "in_flight": 0, "delayed": 0}
    try:
        response = sqs_client.get_queue_attributes(
            QueueUrl=queue_url,
            AttributeNames=[
                "ApproximateNumberOfMessages",
                "ApproximateNumberOfMessagesNotVisible",
                "ApproximateNumberOfMessagesDelayed",
            ],
        )
        attributes = response.get("Attributes", {})
        return {
            "visible": int(attributes.get("ApproximateNumberOfMessages", 0)),
            "in_flight": int(attributes.get("ApproximateNumberOfMessagesNotVisible", 0)),
            "delayed": int(attributes.get("ApproximateNumberOfMessagesDelayed", 0)),
        }
    except ClientError as exc:
        raise RuntimeError(f"Unable to read SQS queue attributes: {exc}") from exc


def get_live_signal_values() -> List[Dict[str, Any]]:
    """Return the current queue and DLQ measurements for the console."""
    queue = get_queue_attributes(settings.SQS_QUEUE_URL)
    dlq = get_queue_attributes(settings.SQS_DLQ_URL)
    return [
        {"label": "Queue depth", "value": f"{queue['visible']:,}", "healthy": queue["visible"] == 0},
        {"label": "Messages in flight", "value": f"{queue['in_flight']:,}", "healthy": queue["in_flight"] < 100},
        {"label": "Delayed messages", "value": f"{queue['delayed']:,}", "healthy": queue["delayed"] == 0},
        {"label": "DLQ depth", "value": f"{dlq['visible']:,}", "healthy": dlq["visible"] == 0},
    ]


def receive_messages(queue_url: str, max_number: int = 10) -> List[Dict[str, Any]]:
    """Receive a bounded batch of messages without deleting them."""
    if not queue_url:
        return []
    try:
        response = sqs_client.receive_message(
            QueueUrl=queue_url,
            MaxNumberOfMessages=min(max_number, 10),
            WaitTimeSeconds=1,
            AttributeNames=["All"],
            MessageAttributeNames=["All"],
        )
        return response.get("Messages", [])
    except ClientError as exc:
        raise RuntimeError(f"Unable to receive SQS messages: {exc}") from exc


def delete_message(queue_url: str, receipt_handle: str) -> None:
    """Delete a message only after its evidence has been persisted successfully."""
    try:
        sqs_client.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt_handle)
    except ClientError as exc:
        raise RuntimeError(f"Unable to delete processed SQS message: {exc}") from exc


def _parse_body(message: Dict[str, Any]) -> Dict[str, Any]:
    body = message.get("Body", "")
    if not body:
        return {}
    try:
        parsed = json.loads(body)
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except json.JSONDecodeError:
        return {"message": body}


def build_evidence_from_messages(
    incident_id: str,
    messages: List[Dict[str, Any]],
    queue_attributes: Dict[str, int],
    dlq_attributes: Dict[str, int],
) -> Dict[str, Any]:
    """Build evidence from observed SQS state and the actual received message bodies."""
    now = datetime.now(timezone.utc).isoformat()
    logs = []
    failed_samples = []
    for message in messages:
        parsed = _parse_body(message)
        message_id = message.get("MessageId", "unknown")
        text = parsed.get("message") or parsed.get("error") or json.dumps(parsed, default=str)
        logs.append({
            "timestamp": now,
            "level": "INFO",
            "service": "AWS::SQS",
            "message": f"Received message {message_id}: {text}",
        })
        failed_samples.append({
            "message_id": message_id,
            "receipt_handle_present": bool(message.get("ReceiptHandle")),
            "body": parsed,
            "attributes": message.get("Attributes", {}),
        })

    return {
        "incident_id": incident_id,
        "timestamp": now,
        "affected_services": ["AWS::SQS"],
        "time_window_start": now,
        "time_window_end": now,
        "sqs_queue_depth": queue_attributes["visible"],
        "dlq_message_count": dlq_attributes["visible"],
        "retry_counts": sum(
            int(message.get("Attributes", {}).get("ApproximateReceiveCount", 1)) - 1
            for message in messages
        ),
        "metrics": [
            {
                "timestamp": now,
                "metric_name": "ApproximateNumberOfMessages",
                "value": queue_attributes["visible"],
                "unit": "Count",
            },
            {
                "timestamp": now,
                "metric_name": "ApproximateNumberOfMessagesNotVisible",
                "value": queue_attributes["in_flight"],
                "unit": "Count",
            },
            {
                "timestamp": now,
                "metric_name": "ApproximateNumberOfMessagesDelayed",
                "value": queue_attributes["delayed"],
                "unit": "Count",
            },
        ],
        "logs": logs,
        "github_deploy_commit": None,
        "failed_event_samples": failed_samples,
        "source": "aws_sqs",
        "queue_url": settings.SQS_QUEUE_URL,
        "dlq_url": settings.SQS_DLQ_URL,
        "message_count": len(messages),
    }
