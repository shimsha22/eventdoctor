from datetime import datetime
import boto3
from botocore.exceptions import ClientError
from app.core.config import settings

# Initialize the DynamoDB resource
dynamodb = boto3.resource("dynamodb", region_name=settings.AWS_REGION)
table = dynamodb.Table(settings.DYNAMODB_TABLE_NAME)


def create_incident_record(
    incident_id: str, affected_services: list, s3_evidence_key: str
):
    """Creates the initial incident state record in DynamoDB."""
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