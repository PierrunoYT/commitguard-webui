"""Secure storage for API key and settings."""

import os
from pathlib import Path

# Config dir: ~/.config/commitguard-webui (Linux/Mac) or %LOCALAPPDATA%\commitguard-webui (Windows)
if os.name == "nt":
    base = os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))
    _CONFIG_DIR = Path(base) / "commitguard-webui"
else:
    _CONFIG_DIR = Path.home() / ".config" / "commitguard-webui"

_API_KEY_FILE = _CONFIG_DIR / "api_key"
_GITHUB_TOKEN_FILE = _CONFIG_DIR / "github_token"
_CACHE_NOT_LOADED = object()
_KEY_CACHE: str | None = _CACHE_NOT_LOADED
_GITHUB_TOKEN_CACHE: str | None = _CACHE_NOT_LOADED


def _ensure_config_dir() -> Path:
    """Create config directory with restricted permissions (0o700)."""
    _CONFIG_DIR.mkdir(parents=True, mode=0o700, exist_ok=True)
    return _CONFIG_DIR


def _write_secret_file(path: Path, value: str) -> None:
    """Write a secret to a file with restricted permissions (0o600)."""
    _ensure_config_dir()
    path.write_text(value.strip(), encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass  # Windows may not support chmod


def _read_secret_file(path: Path) -> str | None:
    """Read a secret from a file. Returns None if not present or empty."""
    if not path.exists():
        return None
    value = path.read_text(encoding="utf-8").strip()
    return value if value else None


def _invalidate_key_cache() -> None:
    """Invalidate the in-memory OpenRouter key cache after save/clear."""
    global _KEY_CACHE
    _KEY_CACHE = _CACHE_NOT_LOADED


def _invalidate_github_token_cache() -> None:
    """Invalidate the in-memory GitHub token cache after save/clear."""
    global _GITHUB_TOKEN_CACHE
    _GITHUB_TOKEN_CACHE = _CACHE_NOT_LOADED


def save_api_key(key: str) -> None:
    """
    Save API key to config file with restricted permissions (0o600).
    Invalidates the in-memory cache.
    """
    _write_secret_file(_API_KEY_FILE, key)
    _invalidate_key_cache()


def load_api_key() -> str | None:
    """
    Load API key from config file. Returns None if not set.
    Uses in-memory cache to avoid repeated file reads.
    """
    global _KEY_CACHE
    if _KEY_CACHE is not _CACHE_NOT_LOADED:
        return _KEY_CACHE
    _KEY_CACHE = _read_secret_file(_API_KEY_FILE)
    return _KEY_CACHE


def has_saved_key() -> bool:
    """Return True if an API key is saved."""
    return load_api_key() is not None


def clear_api_key() -> None:
    """Remove saved API key. No-op if file does not exist."""
    if _API_KEY_FILE.exists():
        _API_KEY_FILE.unlink()
    _invalidate_key_cache()


# GitHub token management


def save_github_token(token: str) -> None:
    """Save GitHub personal access token with restricted permissions (0o600)."""
    _write_secret_file(_GITHUB_TOKEN_FILE, token)
    _invalidate_github_token_cache()


def load_github_token() -> str | None:
    """
    Load GitHub token from config file. Returns None if not set.
    Uses in-memory cache to avoid repeated file reads.
    """
    global _GITHUB_TOKEN_CACHE
    if _GITHUB_TOKEN_CACHE is not _CACHE_NOT_LOADED:
        return _GITHUB_TOKEN_CACHE
    _GITHUB_TOKEN_CACHE = _read_secret_file(_GITHUB_TOKEN_FILE)
    return _GITHUB_TOKEN_CACHE


def has_saved_github_token() -> bool:
    """Return True if a GitHub token is saved."""
    return load_github_token() is not None


def clear_github_token() -> None:
    """Remove saved GitHub token. No-op if file does not exist."""
    if _GITHUB_TOKEN_FILE.exists():
        _GITHUB_TOKEN_FILE.unlink()
    _invalidate_github_token_cache()
