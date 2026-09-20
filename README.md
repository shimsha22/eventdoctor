
# EventDoctor

EventDoctor is an incident-response dashboard that helps engineers investigate production failures.

It combines:

- Incident evidence
- Root-cause analysis
- Causal failure graphs
- SQS and DLQ signals
- Remediation proposals
- Validation and replay workflow
- AWS-backed incident storage

## Tech Stack

- Frontend: Next.js, React, TypeScript
- Backend: FastAPI, Python
- AWS: API Gateway, Lambda, Cognito, DynamoDB, S3, SQS, CloudWatch

## Run Locally

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

### Backend

```powershell
cd backend
.\venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Backend health check:

```text
http://localhost:8000/health
```

## Demo Mode

For a reliable local demonstration, the frontend can use built-in demo data.

In `frontend/.env.local`:

```env
NEXT_PUBLIC_USE_MOCK=true
NEXT_PUBLIC_API_URL=http://localhost:8000
```

This mode demonstrates:

1. Incident investigation
2. Evidence review
3. Root-cause analysis
4. Remediation approval
5. Validation
6. Deployment approval
7. Failed-event replay
8. Recovery

## AWS Mode

The frontend can also connect to the deployed AWS API:

```env
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_API_URL=https://your-api-gateway-url
NEXT_PUBLIC_COGNITO_USER_POOL_ID=your-user-pool-id
NEXT_PUBLIC_COGNITO_CLIENT_ID=your-app-client-id
NEXT_PUBLIC_COGNITO_REGION=ap-south-1
```

AWS mode requires:

- A valid Cognito login
- API Gateway JWT authorization
- API Gateway routes for incident listing and detail
- DynamoDB incident records
- S3 evidence packages

## Demo Flow

1. Open the incident console.
2. Select or sign in as an SRE.
3. Open an incident.
4. Review the evidence.
5. Inspect the causal graph.
6. Review the proposed remediation.
7. Approve the fix.
8. Run validation.
9. Approve deployment.
10. Replay the failed events.
11. Confirm the incident reaches the recovered state.

## Important Note

The local demo workflow uses simulated incident data and simulated deployment, validation, and replay actions.

The AWS integration uses real AWS services for incident storage, evidence storage, queues, authentication, and live signals.
