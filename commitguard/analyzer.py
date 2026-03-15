"""Commit analysis using AI via OpenRouter."""

from git import Repo
from openai import OpenAI

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
APP_REFERER = "https://github.com/PierrunoYT/commitguard"
APP_TITLE = "CommitGuard"

SYSTEM_PROMPT = """You are a code review assistant. Analyze Git commits for:
1. Potential bugs and logic errors
2. Security vulnerabilities
3. Code quality issues
4. Missing error handling or validation
5. Performance concerns

Respond in markdown. Be concise. If nothing concerning is found, say "No issues detected."
"""


def _get_diff(repo: Repo, commit) -> str:
    """Get diff for a commit."""
    if commit.parents:
        diff = repo.git.diff(commit.parents[0], commit)
    else:
        diff = repo.git.show(commit, format="", no_patch=False)
    return diff[:12000]  # Limit context size


def _sanitize_error(err: Exception) -> str:
    """Return a safe error message that never exposes API keys."""
    msg = str(err).lower()
    if "api" in msg and ("key" in msg or "auth" in msg or "401" in msg or "403" in msg):
        return "Invalid or missing API key. Check OPENROUTER_API_KEY or --api-key."
    if "402" in msg or "payment" in msg or "credits" in msg:
        return "Insufficient credits. Add credits at https://openrouter.ai/credits"
    if "404" in msg or "not found" in msg:
        return "Model not found. Check the model name at https://openrouter.ai/models"
    if "408" in msg or "timeout" in msg:
        return "Request timed out. Try again."
    if "rate" in msg or "429" in msg:
        return "Rate limit exceeded. Try again later."
    if "502" in msg or "bad gateway" in msg:
        return "Model temporarily unavailable. Try again later."
    if "503" in msg or "unavailable" in msg:
        return "OpenRouter service temporarily unavailable. Try again later."
    return str(err)[:200]  # Truncate to avoid leaking sensitive data


def _call_ai(diff: str, message: str, files: list[str], api_key: str, model: str) -> str:
    """Call OpenRouter API for analysis (supports multiple models)."""
    if not api_key or not api_key.strip():
        raise ValueError("API key is required")
    if not model or not model.strip():
        raise ValueError("Model name is required")

    client = OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=api_key,
    )
    user_content = f"""Analyze this commit:

**Message:** {message}
**Files:** {', '.join(files) if files else 'N/A'}

**Diff:**
```
{diff or '(no diff)'}
```
"""
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            extra_headers={
                "HTTP-Referer": APP_REFERER,
                "X-Title": APP_TITLE,
            },
        )
    except Exception as e:
        raise RuntimeError(_sanitize_error(e)) from e

    if not response.choices:
        return "No response from model."
    return response.choices[0].message.content or "No response."


def analyze_commit(
    repo_path: str,
    ref: str = "HEAD",
    *,
    api_key: str,
    model: str = "openai/gpt-4o-mini",
) -> str:
    """Analyze a specific commit."""
    repo = Repo(repo_path)
    commit = repo.commit(ref)
    diff = _get_diff(repo, commit)
    files = [d.a_path for d in commit.diff(commit.parents[0] if commit.parents else None, create_patch=False)]
    return _call_ai(diff, commit.message, files, api_key, model)


def analyze_staged(
    repo_path: str,
    *,
    api_key: str,
    model: str = "openai/gpt-4o-mini",
) -> str:
    """Analyze staged changes."""
    repo = Repo(repo_path)
    diff = repo.git.diff("--cached")
    if not diff.strip():
        return "No staged changes to analyze."
    files = repo.git.diff("--cached", "--name-only").splitlines()
    return _call_ai(diff, "(staged changes)", files, api_key, model)
