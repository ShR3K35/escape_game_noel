"""Authentification admin."""

import pytest

from app.core.security import SessionSigner, hash_password, verify_password
from tests.conftest import PASSWORD


def test_hash_roundtrip_and_format():
    h = hash_password("bonjour-noel")
    assert h.startswith("scrypt:") and "$" not in h
    assert verify_password("bonjour-noel", h)
    assert not verify_password("autre", h)
    assert not verify_password("x", "n'importe quoi")


def test_admin_routes_require_session(client):
    assert client.get("/api/admin/state").status_code == 401
    assert client.post("/api/admin/game/start").status_code == 401
    assert client.get("/api/auth/me").json() == {"authenticated": False}


def test_login_sets_secure_cookie(client):
    r = client.post("/api/auth/login", json={"password": PASSWORD})
    assert r.status_code == 200
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert client.get("/api/auth/me").json() == {"authenticated": True}
    assert client.get("/api/admin/state").status_code == 200


def test_wrong_password_and_logout(client):
    assert client.post("/api/auth/login", json={"password": "faux"}).status_code == 401
    client.post("/api/auth/login", json={"password": PASSWORD})
    client.post("/api/auth/logout")
    assert client.get("/api/admin/state").status_code == 401


def test_rate_limiting(client):
    for _ in range(5):
        assert client.post("/api/auth/login", json={"password": "faux"}).status_code == 401
    r = client.post("/api/auth/login", json={"password": PASSWORD})
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) > 0


def test_forged_or_expired_token_rejected():
    signer = SessionSigner("k", "h", 3600)
    token = signer.issue()
    assert signer.verify(token)
    assert not signer.verify(token[:-2] + "xx")
    assert not SessionSigner("k", "autre-hash", 3600).verify(token)  # mot de passe changé
    assert not SessionSigner("k", "h", -10).verify(SessionSigner("k", "h", -10).issue())
    assert not signer.verify(None) and not signer.verify("sans-point")


def test_production_requires_password_hash(settings):
    from app.main import create_app

    with pytest.raises(RuntimeError):
        create_app(settings.model_copy(update={"app_env": "production", "admin_password_hash": ""}))


def test_input_validation(admin):
    r = admin.post("/api/admin/game/phase", json={"phase": "N_IMPORTE"})
    assert r.status_code == 422
    assert admin.post("/api/admin/tv/message", json={"text": "x" * 601}).status_code == 422
    assert admin.post("/api/admin/tv/play", json={"video_id": "relance"},
                      headers={"Idempotency-Key": "x"}).status_code == 422
