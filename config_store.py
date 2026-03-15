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


def _ensure_config_dir() -> Path:
    """Create config directory with restricted permissions (0o700)."""
    _CONFIG_DIR.mkdir(parents=True, mode=0o700, exist_ok=True)
    return _CONFIG_DIR


def save_api_key(key: str) -> None:
    """Save API key to config file with restricted permissions (0o600)."""
    _ensure_config_dir()
    _API_KEY_FILE.write_text(key.strip(), encoding="utf-8")
    try:
        _API_KEY_FILE.chmod(0o600)
    except OSError:
        pass  # Windows may not support chmod


def load_api_key() -> str | None:
    """Load API key from config file. Returns None if not set."""
    if not _API_KEY_FILE.exists():
        return None
    key = _API_KEY_FILE.read_text(encoding="utf-8").strip()
    return key or None


def has_saved_key() -> bool:
    """Return True if an API key is saved."""
    return load_api_key() is not None


def clear_api_key() -> None:
    """Remove saved API key."""
    if _API_KEY_FILE.exists():
        _API_KEY_FILE.unlink()
