"""Hash du mot de passe administrateur, jetons de session signés et anti-bruteforce.

Uniquement la bibliothèque standard : scrypt pour le hash, HMAC-SHA256 pour la session.
Le format du hash n'utilise ni « $ » ni espace, pour pouvoir être placé tel quel
dans un fichier `.env` lu par Docker Compose.
"""

import base64
import hashlib
import hmac
import json
import secrets
import threading
import time
from collections import deque
from pathlib import Path

SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    return f"scrypt:{SCRYPT_N}:{SCRYPT_R}:{SCRYPT_P}:{_b64e(salt)}:{_b64e(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, expected = stored.split(":")
        if algo != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(), salt=_b64d(salt), n=int(n), r=int(r), p=int(p), dklen=len(_b64d(expected))
        )
        return hmac.compare_digest(digest, _b64d(expected))
    except (ValueError, TypeError):
        return False


def load_or_create_secret(configured: str, data_dir: Path) -> str:
    """Utilise SECRET_KEY si fourni, sinon une clé générée et conservée dans le dossier data."""
    if configured:
        return configured
    data_dir.mkdir(parents=True, exist_ok=True)
    path = data_dir / "secret_key"
    if path.exists():
        return path.read_text().strip()
    key = secrets.token_urlsafe(48)
    path.write_text(key)
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return key


class SessionSigner:
    """Jeton `payload.signature`. La clé dépend aussi du hash du mot de passe :
    changer le mot de passe invalide toutes les sessions existantes."""

    def __init__(self, secret: str, password_hash: str, max_age_seconds: int):
        self._key = hashlib.sha256(f"{secret}|{password_hash}".encode()).digest()
        self.max_age = max_age_seconds

    def _sign(self, payload: str) -> str:
        return _b64e(hmac.new(self._key, payload.encode(), hashlib.sha256).digest())

    def issue(self) -> str:
        body = {"sub": "admin", "exp": int(time.time()) + self.max_age, "n": secrets.token_hex(8)}
        payload = _b64e(json.dumps(body, separators=(",", ":")).encode())
        return f"{payload}.{self._sign(payload)}"

    def verify(self, token: str | None) -> bool:
        if not token or "." not in token:
            return False
        payload, signature = token.rsplit(".", 1)
        if not hmac.compare_digest(signature, self._sign(payload)):
            return False
        try:
            body = json.loads(_b64d(payload))
        except ValueError:
            return False
        return body.get("sub") == "admin" and int(body.get("exp", 0)) > time.time()


class LoginRateLimiter:
    """Au-delà de `max_attempts` échecs dans la fenêtre, l'adresse est bloquée."""

    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window = window_seconds
        self._failures: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        q = self._failures.setdefault(key, deque())
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def retry_after(self, key: str) -> int:
        """0 si autorisé, sinon nombre de secondes à attendre."""
        now = time.monotonic()
        with self._lock:
            q = self._prune(key, now)
            if len(q) >= self.max_attempts:
                return max(1, int(self.window - (now - q[0])))
            return 0

    def failure(self, key: str) -> None:
        with self._lock:
            self._prune(key, time.monotonic()).append(time.monotonic())

    def success(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)
