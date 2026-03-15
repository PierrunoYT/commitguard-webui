"""CommitGuard Web UI - Python server."""

import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from flask import Flask, jsonify, render_template, request

from commitguard.analyzer import (
    AIAnalysisError,
    DiffTooLargeError,
    GitAnalysisError,
    analyze_commit,
    analyze_commit_range,
    list_commits,
    analyze_staged,
)
from config_store import clear_api_key, has_saved_key, load_api_key, save_api_key
from diff_redactor import redact_diff

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
UI_DIFF_CHAR_LIMIT = 150000

# Min length for OpenRouter keys (sk-or-...); avoid storing junk
_MIN_KEY_LEN = 20
_MAX_KEY_LEN = 512


def _validate_api_key(key: str) -> str | None:
    """
    Validate API key format. Returns None if valid, or an error message.
    OpenRouter keys typically start with sk-or- and are 40+ chars.
    """
    k = key.strip()
    if len(k) < _MIN_KEY_LEN:
        return f"API key too short (min {_MIN_KEY_LEN} characters)"
    if len(k) > _MAX_KEY_LEN:
        return f"API key too long (max {_MAX_KEY_LEN} characters)"
    if not k.isprintable() or "\n" in k or "\r" in k:
        return "API key contains invalid characters"
    return None


def _resolve_api_key(provided: str | None) -> str | None:
    """
    Resolve API key from: (1) provided value, (2) saved config file, (3) env var.
    Returns None if no key is available.
    """
    if provided and provided.strip():
        return provided.strip()
    key = load_api_key()
    if key:
        return key
    return os.environ.get("OPENROUTER_API_KEY") or None


def _truncate_diff_for_ui(diff: str) -> tuple[str, bool]:
    """Cap diff size returned to the browser to avoid heavy payloads."""
    if len(diff) <= UI_DIFF_CHAR_LIMIT:
        return diff, False
    truncated = (
        diff[:UI_DIFF_CHAR_LIMIT]
        + "\n\n[Diff truncated for UI performance. Full patch omitted.]"
    )
    return truncated, True

app = Flask(__name__, static_folder="static", template_folder="templates")


def get_repo_path(path: str | None) -> Path:
    """Resolve repository path. Defaults to current directory. Raises ValueError if not a Git repo."""
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
        result, diff = analyze_commit(str(repo), ref, api_key=api_key, model=model)
        if data.get("include_diff", True):
            diff = redact_diff(diff)
            diff, diff_truncated = _truncate_diff_for_ui(diff)
        else:
            diff = ""
            diff_truncated = False
        return jsonify({"result": result, "diff": diff, "diff_truncated": diff_truncated})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except GitAnalysisError as e:
        return jsonify({"error": str(e)}), 400
    except DiffTooLargeError as e:
        return jsonify({"error": str(e)}), 413
    except AIAnalysisError as e:
        err = str(e) if app.debug else "AI analysis failed"
        return jsonify({"error": err}), 502
    except Exception as e:
        err = str(e) if app.debug else "Analysis failed"
        return jsonify({"error": err}), 400


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


@app.route("/api/analyze-range", methods=["POST"])
def api_analyze_range():
    """Analyze all commits in a range (e.g., HEAD~5..HEAD)."""
    data = request.get_json() or {}
    repo_path = data.get("repo_path", ".")
    rev_range = (data.get("range") or "").strip()
    api_key = _resolve_api_key(data.get("api_key"))
    model = data.get("model", "openai/gpt-4o-mini")
    max_commits = min(max(int(data.get("max_commits", 20)), 1), 50)

    if not api_key:
        return jsonify({"error": "OpenRouter API key required"}), 400
    if not rev_range:
        return jsonify({"error": "Commit range is required (example: HEAD~5..HEAD)"}), 400

    try:
        repo = get_repo_path(repo_path)
        analyses = analyze_commit_range(
            str(repo),
            rev_range,
            api_key=api_key,
            model=model,
            max_commits=max_commits,
        )
        if data.get("include_diff", True):
            for item in analyses:
                redacted = redact_diff(item.get("diff", ""))
                redacted, truncated = _truncate_diff_for_ui(redacted)
                item["diff"] = redacted
                item["diff_truncated"] = truncated
        else:
            for item in analyses:
                item["diff"] = ""
                item["diff_truncated"] = False
        return jsonify({"results": analyses, "count": len(analyses)})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except GitAnalysisError as e:
        return jsonify({"error": str(e)}), 400
    except DiffTooLargeError as e:
        return jsonify({"error": str(e)}), 413
    except AIAnalysisError as e:
        err = str(e) if app.debug else "AI analysis failed"
        return jsonify({"error": err}), 502
    except Exception as e:
        err = str(e) if app.debug else "Analysis failed"
        return jsonify({"error": err}), 400


@app.route("/api/commits", methods=["POST"])
def api_commits():
    """List recent commits for UI picker and search."""
    data = request.get_json() or {}
    repo_path = data.get("repo_path", ".")
    search = (data.get("search") or "").strip()
    try:
        limit = min(max(int(data.get("limit", 80)), 1), 200)
    except (TypeError, ValueError):
        return jsonify({"error": "limit must be an integer"}), 400

    try:
        repo = get_repo_path(repo_path)
        commits = list_commits(str(repo), search=search, limit=limit)
        return jsonify({"commits": commits, "count": len(commits)})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except GitAnalysisError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        err = str(e) if app.debug else "Could not load commits"
        return jsonify({"error": err}), 400


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
    err = _validate_api_key(api_key)
    if err:
        return jsonify({"error": err}), 400
    try:
        save_api_key(api_key)
        return jsonify({"ok": True})
    except OSError as e:
        return jsonify({"error": "Could not save API key"}), 500
    except Exception:
        return jsonify({"error": "An error occurred"}), 500


@app.route("/api/settings/key", methods=["DELETE"])
def api_settings_clear_key():
    """Remove saved API key."""
    try:
        clear_api_key()
        return jsonify({"ok": True})
    except Exception:
        return jsonify({"error": "An error occurred"}), 500


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
        result, diff = analyze_staged(str(repo), api_key=api_key, model=model)
        if data.get("include_diff", True):
            diff = redact_diff(diff)
            diff, diff_truncated = _truncate_diff_for_ui(diff)
        else:
            diff = ""
            diff_truncated = False
        return jsonify({"result": result, "diff": diff, "diff_truncated": diff_truncated})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except GitAnalysisError as e:
        return jsonify({"error": str(e)}), 400
    except DiffTooLargeError as e:
        return jsonify({"error": str(e)}), 413
    except AIAnalysisError as e:
        err = str(e) if app.debug else "AI analysis failed"
        return jsonify({"error": err}), 502
    except Exception as e:
        err = str(e) if app.debug else "Analysis failed"
        return jsonify({"error": err}), 400


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
