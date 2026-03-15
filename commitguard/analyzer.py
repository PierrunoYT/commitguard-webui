"""Commit analysis using AI via OpenRouter."""

from git import Repo
from git.exc import GitCommandError
from openai import OpenAI

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
AI_DIFF_CHAR_LIMIT = 12000


class AnalysisError(Exception):
    """Base class for analysis failures."""


class GitAnalysisError(AnalysisError):
    """Raised when Git operations fail during analysis."""


class AIAnalysisError(AnalysisError):
    """Raised when AI provider operations fail during analysis."""

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
    return diff[:AI_DIFF_CHAR_LIMIT]  # Limit context size


def _call_ai(diff: str, message: str, files: list[str], api_key: str, model: str) -> str:
    """Call OpenRouter API for analysis (supports multiple models)."""
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
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    )
    return response.choices[0].message.content or "No response."


def analyze_commit(
    repo_path: str,
    ref: str = "HEAD",
    *,
    api_key: str,
    model: str = "openai/gpt-4o-mini",
) -> tuple[str, str]:
    """Analyze a specific commit. Returns (analysis_result, diff)."""
    try:
        repo = Repo(repo_path)
        commit = repo.commit(ref)
        diff = _get_diff(repo, commit)
        files = []
        for diff_item in commit.diff(
            commit.parents[0] if commit.parents else None,
            create_patch=False,
        ):
            path = diff_item.b_path or diff_item.a_path
            if path:
                files.append(path)
    except Exception as e:
        raise GitAnalysisError(f"Could not read commit '{ref}': {e}") from e

    try:
        result = _call_ai(diff, commit.message, files, api_key, model)
        return (result, diff)
    except Exception as e:
        raise AIAnalysisError(f"AI analysis failed: {e}") from e


def analyze_staged(
    repo_path: str,
    *,
    api_key: str,
    model: str = "openai/gpt-4o-mini",
) -> tuple[str, str]:
    """Analyze staged changes. Returns (analysis_result, diff)."""
    try:
        repo = Repo(repo_path)
        diff = repo.git.diff("--cached")
        if not diff.strip():
            return ("No staged changes to analyze.", "")

        try:
            diff_obj = repo.index.diff("HEAD")
        except GitCommandError:
            # Unborn branch / initial commit: compare index against empty tree.
            diff_obj = repo.index.diff(None)
        files = sorted(
            {
                (item.b_path or item.a_path)
                for item in diff_obj
                if (item.b_path or item.a_path)
            }
        )
    except Exception as e:
        raise GitAnalysisError(f"Could not read staged changes: {e}") from e

    try:
        result = _call_ai(diff[:AI_DIFF_CHAR_LIMIT], "(staged changes)", files, api_key, model)
        return (result, diff)
    except Exception as e:
        raise AIAnalysisError(f"AI analysis failed: {e}") from e
