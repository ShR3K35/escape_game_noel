import logging

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.api.deps import SESSION_COOKIE, client_ip, is_admin
from app.core.security import verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
log = logging.getLogger("noel2026.auth")


class LoginBody(BaseModel):
    password: str = Field(min_length=1, max_length=200)


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    limiter = request.app.state.login_limiter
    ip = client_ip(request)
    wait = limiter.retry_after(ip)
    if wait:
        log.warning("login bloqué", extra={"ip": ip})
        raise HTTPException(status_code=429, detail=f"trop de tentatives, réessayez dans {wait} s",
                            headers={"Retry-After": str(wait)})
    if not verify_password(body.password, request.app.state.password_hash):
        limiter.failure(ip)
        log.warning("login refusé", extra={"ip": ip})
        raise HTTPException(status_code=401, detail="mot de passe incorrect")
    limiter.success(ip)
    settings = request.app.state.settings
    response.set_cookie(SESSION_COOKIE, request.app.state.signer.issue(), max_age=settings.session_hours * 3600,
                        httponly=True, samesite="strict", secure=settings.cookie_secure, path="/")
    log.info("login admin", extra={"ip": ip})
    return {"authenticated": True}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"authenticated": False}


@router.get("/me")
async def me(request: Request):
    return {"authenticated": is_admin(request)}
