"""CommitGuard Web UI - Python server."""

import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from flask import Flask, jsonify, redirect, request

from commitguard.analyzer import (
    AIAnalysisError,
    DiffTooLargeError,
    GitAnalysisError,
    analyze_commit,
    analyze_commit_range,
    list_commits,
    analyze_staged,
)
from commitguard.github_analyzer import (
    GitHubError,
    analyze_github_commit,
    analyze_github_commit_range,
    analyze_github_pr,
    is_github_url,
    list_github_commits,
    list_github_prs,
    parse_github_url,
)
from config_store import (
    clear_api_key,
    clear_github_token,
    has_saved_key,
    has_saved_github_token,
    load_api_key,
    load_github_token,
    save_api_key,
    save_github_token,
)
from diff_redactor import redact_diff

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
UI_DIFF_CHAR_LIMIT = 150000

_MIN_KEY_LEN = 20
_MAX_KEY_LEN = 512

# GitHub tokens can be classic (ghp_...) or fine-grained (github_pat_...)
_MIN_GITHUB_TOKEN_LEN = 10
_MAX_GITHUB_TOKEN_LEN = 512


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


def _validate_github_token(token: str) -> str | None:
    """Validate GitHub token format. Returns None if valid, or an error message."""
    t = token.strip()
    if len(t) < _MIN_GITHUB_TOKEN_LEN:
        return f"GitHub token too short (min {_MIN_GITHUB_TOKEN_LEN} characters)"
    if len(t) > _MAX_GITHUB_TOKEN_LEN:
        return f"GitHub token too long (max {_MAX_GITHUB_TOKEN_LEN} characters)"
    if not t.isprintable() or "\n" in t or "\r" in t:
        return "GitHub token contains invalid characters"
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


def _resolve_github_token(provided: str | None) -> str | None:
    """
    Resolve GitHub token from: (1) provided value, (2) saved config file, (3) env var.
    Returns None if no token is available (anonymous access is still allowed).
    """
    if provided and provided.strip():
        return provided.strip()
    token = load_github_token()
    if token:
        return token
    return os.environ.get("GITHUB_TOKEN") or None


def _truncate_diff_for_ui(diff: str) -> tuple[str, bool]:
    """Cap diff size returned to the browser to avoid heavy payloads."""
    if len(diff) <= UI_DIFF_CHAR_LIMIT:
        return diff, False
    truncated = (
        diff[:UI_DIFF_CHAR_LIMIT]
        + "\n\n[Diff truncated for UI performance. Full patch omitted.]"
    )
    return truncated, True


def _resolve_max_diff_chars(value: object) -> int | None:
    """Parse optional max diff chars from request payload."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValueError("max_diff_chars must be a positive integer")
    if parsed < 1:
        raise ValueError("max_diff_chars must be a positive integer")
    return parsed


def _resolve_system_prompt(value: object) -> str | None:
    """Parse optional system prompt override from request payload."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("system_prompt must be a string")
    return value


app = Flask(__name__)


def get_repo_path(path: str | None) -> Path:
    """Resolve repository path. Defaults to current directory. Raises ValueError if not a Git repo."""
    repo_path = Path(path or ".").resolve()
    if not (repo_path / ".git").exists():
        raise ValueError(f"Not a Git repository: {repo_path}")
    return repo_path


@app.route("/")
def index():
    """Redirect to the Next.js web UI."""
    ui_url = os.environ.get("COMMITGUARD_UI_URL", "http://localhost:3000")
    return redirect(ui_url)


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    """Analyze a specific commit (local path or GitHub URL)."""
    data = request.get_json() or {}
    repo_path = data.get("repo_path", ".")
    ref = data.get("ref", "HEAD")
    api_key = _resolve_api_key(data.get("api_key"))
    model = data.get("model", "openai/gpt-4o-mini")
    max_diff_chars = _resolve_max_diff_chars(data.get("max_diff_chars"))
    system_prompt = _resolve_system_prompt(data.get("system_prompt"))

    if not api_key:
        return jsonify({"error": "OpenRouter API key required"}), 400

    if is_github_url(repo_path):
        github_token = _resolve_github_token(data.get("github_token"))
        try:
            owner, repo = parse_github_url(repo_path)
            result, diff = analyze_github_commit(
                owner,
                repo,
                ref,
                token=github_token,
                api_key=api_key,
                model=model,
                max_diff_chars=max_diff_chars,
                system_prompt=system_prompt,
            )
            if data.get("include_diff", True):
                diff = redact_diff(diff)
                diff, diff_truncated = _truncate_diff_for_ui(diff)
            else:
                diff = ""
                diff_truncated = False
            return jsonify({"result": result, "diff": diff, "diff_truncated": diff_truncated})
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except GitHubError as e:
            return jsonify({"error": str(e)}), 400
        except DiffTooLargeError as e:
            return jsonify({"error": str(e)}), 413
        except AIAnalysisError as e:
            err = str(e) if app.debug else "AI analysis failed"
            return jsonify({"error": err}), 502
        except Exception as e:
            err = str(e) if app.debug else "Analysis failed"
            return jsonify({"error": err}), 400

    try:
        repo = get_repo_path(repo_path)
        result, diff = analyze_commit(
            str(repo),
            ref,
            api_key=api_key,
            model=model,
            max_diff_chars=max_diff_chars,
            system_prompt=system_prompt,
        )
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
    """Analyze all commits in a range (local path or GitHub URL)."""
    data = request.get_json() or {}
    repo_path = data.get("repo_path", ".")
    rev_range = (data.get("range") or "").strip()
    api_key = _resolve_api_key(data.get("api_key"))
    model = data.get("model", "openai/gpt-4o-mini")
    max_commits = min(max(int(data.get("max_commits", 20)), 1), 50)
    max_diff_chars = _resolve_max_diff_chars(data.get("max_diff_chars"))
    system_prompt = _resolve_system_prompt(data.get("system_prompt"))

    if not api_key:
        return jsonify({"error": "OpenRouter API key required"}), 400
    if not rev_range:
        return jsonify({"error": "Commit range is required (example: HEAD~5..HEAD or base..head)"}), 400

    if is_github_url(repo_path):
        github_token = _resolve_github_token(data.get("github_token"))
        # Parse range: must be "base..head"
        if ".." not in rev_range:
            return jsonify({"error": "For GitHub repos, range must be base..head (e.g. main..feature-branch)"}), 400
        base, head = rev_range.split("..", 1)
        base, head = base.strip(), head.strip()
        if not base or not head:
            return jsonify({"error": "Range must have both base and head (e.g. main..feature-branch)"}), 400
        try:
            owner, repo = parse_github_url(repo_path)
            analyses = analyze_github_commit_range(
                owner,
                repo,
                base,
                head,
                token=github_token,
                api_key=api_key,
                model=model,
                max_commits=max_commits,
                max_diff_chars=max_diff_chars,
                system_prompt=system_prompt,
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
        except GitHubError as e:
            return jsonify({"error": str(e)}), 400
        except DiffTooLargeError as e:
            return jsonify({"error": str(e)}), 413
        except AIAnalysisError as e:
            err = str(e) if app.debug else "AI analysis failed"
            return jsonify({"error": err}), 502
        except Exception as e:
            err = str(e) if app.debug else "Analysis failed"
            return jsonify({"error": err}), 400

    try:
        repo = get_repo_path(repo_path)
        analyses = analyze_commit_range(
            str(repo),
            rev_range,
            api_key=api_key,
            model=model,
            max_commits=max_commits,
            max_diff_chars=max_diff_chars,
            system_prompt=system_prompt,
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
    """List recent commits for UI picker and search (local path or GitHub URL)."""
    data = request.get_json() or {}
    repo_path = data.get("repo_path", ".")
    search = (data.get("search") or "").strip()
    try:
        limit = min(max(int(data.get("limit", 80)), 1), 200)
    except (TypeError, ValueError):
        return jsonify({"error": "limit must be an integer"}), 400

    if is_github_url(repo_path):
        github_token = _resolve_github_token(data.get("github_token"))
        try:
            owner, repo = parse_github_url(repo_path)
            commits = list_github_commits(
                owner,
                repo,
                token=github_token,
                search=search,
                limit=limit,
            )
            return jsonify({"commits": commits, "count": len(commits)})
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except GitHubError as e:
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            err = str(e) if app.debug else "Could not load commits"
            return jsonify({"error": err}), 400

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


@app.route("/api/github/prs", methods=["POST"])
def api_github_prs():
    """List pull requests for a GitHub repository."""
    data = request.get_json() or {}
    repo_path = data.get("repo_path", "")
    state = data.get("state", "open")
    try:
        limit = min(max(int(data.get("limit", 50)), 1), 100)
    except (TypeError, ValueError):
        return jsonify({"error": "limit must be an integer"}), 400

    if not repo_path or not is_github_url(repo_path):
        return jsonify({"error": "A valid GitHub repository URL is required"}), 400

    if state not in ("open", "closed", "all"):
        return jsonify({"error": "state must be open, closed, or all"}), 400

    github_token = _resolve_github_token(data.get("github_token"))
    try:
        owner, repo = parse_github_url(repo_path)
        prs = list_github_prs(owner, repo, token=github_token, state=state, limit=limit)
        return jsonify({"prs": prs, "count": len(prs)})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except GitHubError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        err = str(e) if app.debug else "Could not load pull requests"
        return jsonify({"error": err}), 400


@app.route("/api/github/analyze-pr", methods=["POST"])
def api_github_analyze_pr():
    """Analyze a GitHub pull request."""
    data = request.get_json() or {}
    repo_path = data.get("repo_path", "")
    pr_number_raw = data.get("pr_number")
    api_key = _resolve_api_key(data.get("api_key"))
    model = data.get("model", "openai/gpt-4o-mini")
    max_diff_chars = _resolve_max_diff_chars(data.get("max_diff_chars"))
    system_prompt = _resolve_system_prompt(data.get("system_prompt"))

    if not api_key:
        return jsonify({"error": "OpenRouter API key required"}), 400
    if not repo_path or not is_github_url(repo_path):
        return jsonify({"error": "A valid GitHub repository URL is required"}), 400
    if pr_number_raw is None:
        return jsonify({"error": "pr_number is required"}), 400

    try:
        pr_number = int(pr_number_raw)
        if pr_number < 1:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "pr_number must be a positive integer"}), 400

    github_token = _resolve_github_token(data.get("github_token"))
    try:
        owner, repo = parse_github_url(repo_path)
        result, diff, pr_title = analyze_github_pr(
            owner,
            repo,
            pr_number,
            token=github_token,
            api_key=api_key,
            model=model,
            max_diff_chars=max_diff_chars,
            system_prompt=system_prompt,
        )
        if data.get("include_diff", True):
            diff = redact_diff(diff)
            diff, diff_truncated = _truncate_diff_for_ui(diff)
        else:
            diff = ""
            diff_truncated = False
        return jsonify({
            "result": result,
            "diff": diff,
            "diff_truncated": diff_truncated,
            "pr_title": pr_title,
            "pr_number": pr_number,
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except GitHubError as e:
        return jsonify({"error": str(e)}), 400
    except DiffTooLargeError as e:
        return jsonify({"error": str(e)}), 413
    except AIAnalysisError as e:
        err = str(e) if app.debug else "AI analysis failed"
        return jsonify({"error": err}), 502
    except Exception as e:
        err = str(e) if app.debug else "Analysis failed"
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
    except OSError:
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


@app.route("/api/settings/github-token", methods=["GET"])
def api_settings_github_token_status():
    """Check if GitHub token is saved (never returns the token)."""
    return jsonify({"configured": has_saved_github_token()})


@app.route("/api/settings/github-token", methods=["POST"])
def api_settings_save_github_token():
    """Save GitHub personal access token to secure config file."""
    data = request.get_json() or {}
    token = (data.get("github_token") or "").strip()
    if not token:
        return jsonify({"error": "GitHub token is required"}), 400
    err = _validate_github_token(token)
    if err:
        return jsonify({"error": err}), 400
    try:
        save_github_token(token)
        return jsonify({"ok": True})
    except OSError:
        return jsonify({"error": "Could not save GitHub token"}), 500
    except Exception:
        return jsonify({"error": "An error occurred"}), 500


@app.route("/api/settings/github-token", methods=["DELETE"])
def api_settings_clear_github_token():
    """Remove saved GitHub token."""
    try:
        clear_github_token()
        return jsonify({"ok": True})
    except Exception:
        return jsonify({"error": "An error occurred"}), 500


@app.route("/api/check", methods=["POST"])
def api_check():
    """Analyze staged changes (local repos only)."""
    data = request.get_json() or {}
    repo_path = data.get("repo_path", ".")
    api_key = _resolve_api_key(data.get("api_key"))
    model = data.get("model", "openai/gpt-4o-mini")
    max_diff_chars = _resolve_max_diff_chars(data.get("max_diff_chars"))
    system_prompt = _resolve_system_prompt(data.get("system_prompt"))

    if not api_key:
        return jsonify({"error": "OpenRouter API key required"}), 400

    if is_github_url(repo_path):
        return jsonify({"error": "Pre-commit check is only available for local repositories"}), 400

    try:
        repo = get_repo_path(repo_path)
        result, diff = analyze_staged(
            str(repo),
            api_key=api_key,
            model=model,
            max_diff_chars=max_diff_chars,
            system_prompt=system_prompt,
        )
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
