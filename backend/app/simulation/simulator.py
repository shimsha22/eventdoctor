from datetime import datetime, timedelta
import uuid
from typing import Tuple
from app.models.schemas import EvidencePackage, LogEntry, MetricPoint


def generate_silent_degradation_incident() -> Tuple[EvidencePackage, str]:
    """Generates a realistic, passive degradation incident dataset.

    Scenario: A bad deploy reduces database connection pool size, causing
    slow connection acquisition, Lambda concurrency saturation, and
    eventual SQS DLQ failures.
    """
    incident_id = f"inc-{uuid.uuid4().hex[:8]}"
    base_time = datetime.utcnow() - timedelta(minutes=25)

    def ts(offset_minutes: int) -> str:
        return (base_time + timedelta(minutes=offset_minutes)).isoformat() + "Z"

    # 1. Subtle, passive log entries
    logs = [
        LogEntry(
            timestamp=ts(0),
            level="INFO",
            service="PaymentVerificationService",
            message="Deployment commit 8f9b2a1 applied: updated connection_pool_size=5 (previous=50), pool_timeout=5000ms.",
        ),
        LogEntry(
            timestamp=ts(5),
            level="INFO",
            service="OrderConfirmationWorker",
            message="Batch consumption cycle started for queue: order-events-prod.",
        ),
        LogEntry(
            timestamp=ts(8),
            level="WARN",
            service="OrderConfirmationWorker",
            message="Connection acquisition latency elevated: took 1420ms (p99 threshold: 1000ms). Active connections: 5/5.",
        ),
        LogEntry(
            timestamp=ts(12),
            level="WARN",
            service="AWS::Lambda",
            message="Account concurrency limit warning: order-confirmation-worker reached 920/1000 reserved units.",
        ),
        LogEntry(
            timestamp=ts(15),
            level="WARN",
            service="PaymentVerificationService",
            message="Client request queue limit reached. Dropping incoming socket handshakes.",
        ),
        LogEntry(
            timestamp=ts(18),
            level="ERROR",
            service="OrderConfirmationWorker",
            message="Task timed out after 30.00 seconds. Message returned to SQS visibility queue.",
        ),
        LogEntry(
            timestamp=ts(22),
            level="ERROR",
            service="AWS::SQS",
            message="Message ID msg-741c8e9b exceeded maxReceiveCount (3). Moved to Dead Letter Queue (order-events-dlq).",
        ),
    ]

    # 2. Correlating telemetry metrics
    metrics = [
        # Connection Pool Exhaustion
        MetricPoint(
            timestamp=ts(5),
            metric_name="ConnectionPoolUtilization",
            value=60.0,
            unit="Percent",
        ),
        MetricPoint(
            timestamp=ts(10),
            metric_name="ConnectionPoolUtilization",
            value=100.0,
            unit="Percent",
        ),
        MetricPoint(
            timestamp=ts(15),
            metric_name="ConnectionPoolUtilization",
            value=100.0,
            unit="Percent",
        ),
        # Dependency Latency Spike
        MetricPoint(
            timestamp=ts(5),
            metric_name="PaymentService_p99_Latency",
            value=180.0,
            unit="Milliseconds",
        ),
        MetricPoint(
            timestamp=ts(10),
            metric_name="PaymentService_p99_Latency",
            value=1450.0,
            unit="Milliseconds",
        ),
        MetricPoint(
            timestamp=ts(15),
            metric_name="PaymentService_p99_Latency",
            value=4950.0,
            unit="Milliseconds",
        ),
        # Worker Concurrency Saturation
        MetricPoint(
            timestamp=ts(5),
            metric_name="LambdaConcurrentExecutions",
            value=120.0,
            unit="Count",
        ),
        MetricPoint(
            timestamp=ts(12),
            metric_name="LambdaConcurrentExecutions",
            value=920.0,
            unit="Count",
        ),
        MetricPoint(
            timestamp=ts(20),
            metric_name="LambdaConcurrentExecutions",
            value=995.0,
            unit="Count",
        ),
        # SQS Queue Depth & DLQ Spike
        MetricPoint(
            timestamp=ts(5),
            metric_name="ApproximateNumberOfMessagesVisible",
            value=15.0,
            unit="Count",
        ),
        MetricPoint(
            timestamp=ts(15),
            metric_name="ApproximateNumberOfMessagesVisible",
            value=340.0,
            unit="Count",
        ),
        MetricPoint(
            timestamp=ts(22),
            metric_name="ApproximateNumberOfMessagesNotVisible",
            value=120.0,
            unit="Count",
        ),
    ]

    evidence_pkg = EvidencePackage(
        incident_id=incident_id,
        affected_services=[
            "OrderConfirmationWorker",
            "PaymentVerificationService",
            "order-events-queue",
        ],
        time_window_start=ts(0),
        time_window_end=ts(25),
        sqs_queue_depth=340,
        dlq_message_count=48,
        retry_counts=144,
        metrics=metrics,
        logs=logs,
        github_deploy_commit="8f9b2a1c4e7f3d",
        failed_event_samples=[
            {
                "message_id": "msg-741c8e9b",
                "order_id": "ord-883910",
                "attempt_count": 3,
                "error": "PaymentVerificationService connection timeout after 5000ms",
            },
            {
                "message_id": "msg-992a3f01",
                "order_id": "ord-883911",
                "attempt_count": 3,
                "error": "Client socket connection dropped by peer",
            },
        ],
    )

    return evidence_pkg, incident_id