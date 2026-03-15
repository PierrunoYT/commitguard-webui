"""CommitGuard Web UI - Python server."""

import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from flask import Flask, jsonify, render_template, request

from commitguard.analyzer import analyze_commit, analyze_staged
from config_store import clear_api_key, has_saved_key, load_api_key, save_api_key

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"


def _resolve_api_key(provided: str | None) -> str | None:
    """Resolve API key: provided > saved config > env."""
    if provided and provided.strip():
        return provided.strip()
    key = load_api_key()
    if key:
        return key
    return os.environ.get("OPENROUTER_API_KEY") or None

app = Flask(__name__, static_folder="static", template_folder="templates")


def get_repo_path(path: str | None) -> Path:
    """Resolve repository path. Defaults to current directory."""
    repo_path = Path(path or ".").resolve()
    if not (repo_path / ".git").exists():
        raise ValueError(f"Not a Git repository: {repo_path}")
    return repo_path


@app.route("/")
def index():
    """Serve the web UI."""
    return render_template("index.html")


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    """Analyze a specific commit."""
    data = request.get_json() or {}
    repo_path = data.get("repo_path", ".")
    ref = data.get("ref", "HEAD")
    api_key = _resolve_api_key(data.get("api_key"))
    model = data.get("model", "openai/gpt-4o-mini")

    if not api_key:
        return jsonify({"error": "OpenRouter API key required"}), 400

    try:
        repo = get_repo_path(repo_path)
        result = analyze_commit(str(repo), ref, api_key=api_key, model=model)
        return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/models", methods=["POST"])
def api_models():
    """Fetch available models from OpenRouter (GET /api/v1/models)."""
    data = request.get_json() or {}
    api_key = _resolve_api_key(data.get("api_key"))

    if not api_key:
        return jsonify({"error": "OpenRouter API key required"}), 400

    try:
        req = Request(
            OPENROUTER_MODELS_URL,
            headers={"Authorization": f"Bearer {api_key}"},
        )
        with urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode())
        models = body.get("data", [])
        return jsonify({
            "models": [
                {"id": m.get("id"), "name": m.get("name") or m.get("id")}
                for m in models
                if m.get("id")
            ]
        })
    except HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        try:
            err_data = json.loads(err_body)
            msg = err_data.get("error", {}).get("message", err_body) or str(e)
        except Exception:
            msg = err_body or str(e)
        return jsonify({"error": msg}), 400
    except (URLError, json.JSONDecodeError) as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/settings/key", methods=["GET"])
def api_settings_key_status():
    """Check if API key is saved (never returns the key)."""
    return jsonify({"configured": has_saved_key()})


@app.route("/api/settings/key", methods=["POST"])
def api_settings_save_key():
    """Save API key to secure config file."""
    data = request.get_json() or {}
    api_key = (data.get("api_key") or "").strip()
    if not api_key:
        return jsonify({"error": "API key is required"}), 400
    try:
        save_api_key(api_key)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/settings/key", methods=["DELETE"])
def api_settings_clear_key():
    """Remove saved API key."""
    try:
        clear_api_key()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/check", methods=["POST"])
def api_check():
    """Analyze staged changes."""
    data = request.get_json() or {}
    repo_path = data.get("repo_path", ".")
    api_key = _resolve_api_key(data.get("api_key"))
    model = data.get("model", "openai/gpt-4o-mini")

    if not api_key:
        return jsonify({"error": "OpenRouter API key required"}), 400

    try:
        repo = get_repo_path(repo_path)
        result = analyze_staged(str(repo), api_key=api_key, model=model)
        return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
