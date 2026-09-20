from functools import lru_cache
from typing import Any

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, jwk

from app.core.config import settings

bearer = HTTPBearer(auto_error=False)


@lru_cache(maxsize=1)
def _jwks() -> dict[str, Any]:
    url = f"https://cognito-idp.{settings.AWS_REGION}.amazonaws.com/{settings.COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    response = requests.get(url, timeout=5)
    response.raise_for_status()
    return response.json()


def require_api_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict[str, Any]:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")

    token = credentials.credentials
    if settings.DEMO_MODE and token == "demo-token":
        return {"role": "SRE", "demo": True}

    if not settings.COGNITO_USER_POOL_ID or not settings.COGNITO_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Cognito is not configured")

    try:
        header = jwt.get_unverified_header(token)
        key_data = next(key for key in _jwks()["keys"] if key["kid"] == header["kid"])
        public_key = jwk.construct(key_data)
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=settings.COGNITO_CLIENT_ID,
            issuer=f"https://cognito-idp.{settings.AWS_REGION}.amazonaws.com/{settings.COGNITO_USER_POOL_ID}",
        )
        groups = claims.get("cognito:groups", [])
        roles = [role for role in ("Admin", "SRE", "Developer", "Viewer") if role in groups]
        return {"role": roles[0] if roles else "Viewer", "claims": claims}
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Cognito token") from exc


def require_roles(*allowed_roles: str):
    def dependency(user: dict[str, Any] = Depends(require_api_user)) -> dict[str, Any]:
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="Your role is not allowed to do that.")
        return user

    return dependency
