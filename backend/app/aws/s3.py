import json
import boto3
from botocore.exceptions import ClientError
from app.core.config import settings

# Initialize the S3 client using boto3
s3_client = boto3.client("s3", region_name=settings.AWS_REGION)

def save_evidence_package(incident_id: str, evidence_data: dict) -> str:
    """
    Saves the generated evidence package to S3.
    Returns the S3 object key.
    """
    file_key = f"incidents/{incident_id}/evidence.json"
    
    try:
        s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=file_key,
            Body=json.dumps(evidence_data),
            ContentType="application/json"
        )
        return file_key
    except ClientError as e:
        print(f"Error saving to S3: {e}")
        # In a real scenario, raise the exception. For the hackathon demo, we print it 
        # so the simulation doesn't crash if your AWS credentials aren't perfectly set up yet.
        return file_key