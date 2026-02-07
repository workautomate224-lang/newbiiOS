from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt
from app.core.config import settings


def get_token(request: Request) -> str:
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    return auth[7:]


async def get_current_user(token: str = Depends(get_token)) -> dict:
    """Decode Supabase JWT and return user payload."""
    try:
        # Supabase JWTs use the anon key as the secret with HS256
        payload = jwt.decode(
            token,
            settings.supabase_anon_key,
            algorithms=["HS256"],
            audience="authenticated",
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return {"id": user_id, "email": payload.get("email"), "role": payload.get("role")}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
