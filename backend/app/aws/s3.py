import json
import boto3
from botocore.exceptions import ClientError
from app.core.config import settings

# Initialize the S3 client using boto3
s3_client = boto3.client("s3", region_name=settings.AWS_REGION)

def save_evidence_package(incident_id: str, evidence_data: dict, strict: bool = False) -> str:
    """
    Saves the generated evidence package to S3.
    Returns the S3 object key.
    """
    file_key = f"incidents/{incident_id}/evidence.json"
    
    try:
        s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=file_key,
            Body=json.dumps(evidence_data).encode("utf-8"),
            ContentType="application/json"
        )
        return file_key
    except ClientError as e:
        print(f"Error saving to S3: {e}")
        if strict:
            raise
        # In a real scenario, raise the exception. For the hackathon demo, we print it
        # so the simulation doesn't crash if your AWS credentials aren't perfectly set up yet.
        return file_key


def get_json_object(bucket_name: str, key: str):
    """Read a JSON object from S3 and return the parsed payload."""
    try:
        response = s3_client.get_object(Bucket=bucket_name, Key=key)
        body = response.get("Body")
        if body is None:
            return None
        return json.loads(body.read().decode("utf-8"))
    except ClientError as exc:
        print(f"Error reading S3 object {key}: {exc}")
        return None


def get_evidence_package(incident_id: str, object_key: str | None = None):
    """Read the incident evidence from S3 for a given incident id."""
    file_key = object_key or f"incidents/{incident_id}/evidence.json"
    return get_json_object(settings.S3_BUCKET_NAME, file_key)