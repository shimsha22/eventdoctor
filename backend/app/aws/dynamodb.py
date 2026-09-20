from datetime import datetime
import boto3
from botocore.exceptions import ClientError
from app.core.config import settings

# Initialize the DynamoDB resource


def _get_table():
    try:
        dynamodb = boto3.resource("dynamodb", region_name=settings.AWS_REGION)
        return dynamodb.Table(settings.DYNAMODB_TABLE_NAME)
    except Exception as exc:  # pragma: no cover - defensive fallback for local/demo runs
        print(f"Unable to initialize DynamoDB table {settings.DYNAMODB_TABLE_NAME}: {exc}")
        return None


def _require_table():
    table = _get_table()
    if table is None:
        raise RuntimeError(f"DynamoDB table {settings.DYNAMODB_TABLE_NAME} is unavailable")
    return table


def list_incident_records():
    """List all incidents from DynamoDB when real AWS data is available."""
    table = _require_table()
    try:
        response = table.scan()
        return response.get("Items", [])
    except Exception as exc:
        raise RuntimeError(f"Error scanning DynamoDB: {exc}") from exc


def get_incident_record(incident_id: str):
    """Fetch a single incident record from DynamoDB by incident id."""
    table = _require_table()
    try:
        response = table.get_item(Key={"incidentId": incident_id})
        return response.get("Item")
    except Exception as exc:
        raise RuntimeError(f"Error fetching incident {incident_id} from DynamoDB: {exc}") from exc


def create_incident_record(
    incident_id: str, affected_services: list, s3_evidence_key: str, strict: bool = False
):
    """Creates the initial incident state record in DynamoDB."""
    table = _get_table()
    if table is None:
        if strict:
            raise RuntimeError(f"DynamoDB table {settings.DYNAMODB_TABLE_NAME} is unavailable")
        return
    try:
        table.put_item(
            Item={
                "incidentId": incident_id,  
                "status": "EVIDENCE_COLLECTED",
                "affected_services": affected_services,
                "s3_evidence_key": s3_evidence_key,
                "created_at": datetime.utcnow().isoformat() + "Z",
                "updated_at": datetime.utcnow().isoformat() + "Z",
            }
        )
        print(f"Successfully saved incident {incident_id} to DynamoDB!")
    except ClientError as e:
        print(f"Error saving to DynamoDB: {e}")
        if strict:
            raise


def save_incident_state(incident: dict):
    """Persist the UI workflow state alongside the incident's AWS metadata."""
    table = _require_table()
    item = {
        "incidentId": incident["id"],
        "status": incident.get("stage", "awaiting_engineer_review").upper(),
        "affected_services": incident.get("affected_services") or [incident.get("service", "unknown-service")],
        "s3_evidence_key": incident.get("s3_evidence_key", f"incidents/{incident['id']}/evidence.json"),
        "created_at": incident.get("opened_at") or datetime.utcnow().isoformat() + "Z",
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "stage": incident.get("stage"),
        "title": incident.get("title"),
        "service": incident.get("service"),
        "severity": incident.get("severity"),
        "window": incident.get("window"),
        "services_touched": incident.get("services_touched"),
        "dlq_count": incident.get("dlq_count"),
        "signals": incident.get("signals"),
        "replay": incident.get("replay"),
        "rca": incident.get("rca"),
        "proposal": incident.get("proposal"),
        "validation": incident.get("validation"),
        "deployed_version": incident.get("deployed_version"),
        "review_note": incident.get("review_note"),
    }
    table.put_item(Item={key: value for key, value in item.items() if value is not None})