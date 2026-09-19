from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    AWS_REGION: str = "us-east-1"
    COGNITO_USER_POOL_ID: str = ""
    COGNITO_CLIENT_ID: str = ""
    DYNAMODB_TABLE_NAME: str = "eventdoctor-incidents"
    S3_BUCKET_NAME: str = "eventdoctor-evidence"
    SQS_QUEUE_URL: str = ""
    SQS_DLQ_URL: str = ""
    GITHUB_TOKEN: str = ""
    GITHUB_REPO: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
