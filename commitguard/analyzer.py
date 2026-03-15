"""Commit analysis using AI via OpenRouter."""

import logging
import os

from git import Repo
from git.exc import GitCommandError
from openai import OpenAI

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MAX_DIFF_CHARS = 50_000
DEFAULT_WARN_DIFF_CHARS = 30_000
DEFAULT_CHARS_PER_TOKEN = 4
MAX_SYSTEM_PROMPT_CHARS = 20_000
logger = logging.getLogger(__name__)


class AnalysisError(Exception):
    """Base class for analysis failures."""


class GitAnalysisError(AnalysisError):
    """Raised when Git operations fail during analysis."""


class AIAnalysisError(AnalysisError):
    """Raised when AI provider operations fail during analysis."""


class DiffTooLargeError(AnalysisError):
    """Raised when a diff exceeds configured safe analysis limits."""


SYSTEM_PROMPT = """You are a code review assistant. Analyze Git commits for:
1. Potential bugs and logic errors
2. Security vulnerabilities
3. Code quality issues
4. Missing error handling or validation
5. Performance concerns

Respond in markdown. Be concise. If nothing concerning is found, say "No issues detected."
"""
DEFAULT_SYSTEM_PROMPT = SYSTEM_PROMPT


def _env_int(name: str, default: int, *, min_value: int = 1) -> int:
    """Read an integer environment variable with fallback and lower bound."""
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        logger.warning("Invalid %s value %r; using default %s", name, raw, default)
        return default
    return max(min_value, value)


MAX_DIFF_CHARS = _env_int("COMMITGUARD_MAX_DIFF", DEFAULT_MAX_DIFF_CHARS)
WARN_DIFF_CHARS = min(
    _env_int("COMMITGUARD_WARN_DIFF", DEFAULT_WARN_DIFF_CHARS),
    MAX_DIFF_CHARS,
)
CHARS_PER_TOKEN = _env_int("COMMITGUARD_CHARS_PER_TOKEN", DEFAULT_CHARS_PER_TOKEN)


def _estimate_tokens(char_count: int, *, chars_per_token: int = CHARS_PER_TOKEN) -> int:
    """Rough token estimate to help users understand request size."""
    safe_chars_per_token = max(1, int(chars_per_token))
    return max(1, (char_count + safe_chars_per_token - 1) // safe_chars_per_token)


def _resolve_max_diff_chars(value: int | str | None) -> int:
    """Resolve request-specific max diff chars with fallback to server default."""
    if value is None:
        return MAX_DIFF_CHARS
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise DiffTooLargeError(
            "Invalid max diff size. Use a positive integer for max diff characters."
        ) from None
    if parsed < 1:
        raise DiffTooLargeError("Max diff size must be at least 1 character.")
    return parsed


def _resolve_system_prompt(prompt: str | None) -> str:
    """Resolve request-specific system prompt with fallback to default."""
    if prompt is None:
        return DEFAULT_SYSTEM_PROMPT
    normalized = prompt.strip()
    if not normalized:
        return DEFAULT_SYSTEM_PROMPT
    if len(normalized) > MAX_SYSTEM_PROMPT_CHARS:
        raise AIAnalysisError(
            f"System prompt is too long ({len(normalized):,} chars). "
            f"Max allowed is {MAX_SYSTEM_PROMPT_CHARS:,}."
        )
    return normalized


def _validate_diff_size(
    diff: str,
    *,
    context: str,
    max_diff_chars: int | str | None = None,
) -> None:
    """Validate diff size and raise with actionable guidance if too large."""
    limit = _resolve_max_diff_chars(max_diff_chars)
    size = len(diff)
    if size > limit:
        estimated = _estimate_tokens(size)
        raise DiffTooLargeError(
            f"Diff for {context} is too large to analyze safely "
            f"({size:,} chars, ~{estimated:,} tokens). "
            f"Limit is {limit:,} chars. "
            "Try a smaller commit/range or increase COMMITGUARD_MAX_DIFF deliberately."
        )
    if size > WARN_DIFF_CHARS:
        estimated = _estimate_tokens(size)
        logger.warning(
            "Large diff for %s (%s chars, ~%s tokens). "
            "Consider splitting changes if analysis gets slow/expensive.",
            context,
            f"{size:,}",
            f"{estimated:,}",
        )


def _get_diff(repo: Repo, commit) -> str:
    """Get diff for a commit."""
    if commit.parents:
        diff = repo.git.diff(commit.parents[0], commit)
    else:
        diff = repo.git.show(commit, format="", no_patch=False)
    return diff


def _call_ai(
    diff: str,
    message: str,
    files: list[str],
    api_key: str,
    model: str,
    *,
    system_prompt: str | None = None,
) -> str:
    """Call OpenRouter API for analysis (supports multiple models)."""
    effective_system_prompt = _resolve_system_prompt(system_prompt)
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
            {"role": "system", "content": effective_system_prompt},
            {"role": "user", "content": user_content},
        ],
    )
    return response.choices[0].message.content or "No response."


def _collect_commit_files(commit) -> list[str]:
    """Collect changed file paths for a commit."""
    files = []
    for diff_item in commit.diff(
        commit.parents[0] if commit.parents else None,
        create_patch=False,
    ):
        path = diff_item.b_path or diff_item.a_path
        if path:
            files.append(path)
    return files


def _analyze_commit_object(
    repo: Repo,
    commit,
    *,
    api_key: str,
    model: str,
    max_diff_chars: int | str | None = None,
    system_prompt: str | None = None,
) -> tuple[str, str]:
    """Analyze a commit object and return (result, diff)."""
    diff = _get_diff(repo, commit)
    _validate_diff_size(
        diff,
        context=f"commit {commit.hexsha[:8]}",
        max_diff_chars=max_diff_chars,
    )
    files = _collect_commit_files(commit)
    result = _call_ai(
        diff,
        commit.message,
        files,
        api_key,
        model,
        system_prompt=system_prompt,
    )
    return (result, diff)


def analyze_commit(
    repo_path: str,
    ref: str = "HEAD",
    *,
    api_key: str,
    model: str = "openai/gpt-4o-mini",
    max_diff_chars: int | str | None = None,
    system_prompt: str | None = None,
) -> tuple[str, str]:
    """Analyze a specific commit. Returns (analysis_result, diff)."""
    try:
        repo = Repo(repo_path)
        commit = repo.commit(ref)
    except Exception as e:
        raise GitAnalysisError(f"Could not read commit '{ref}': {e}") from e

    try:
        return _analyze_commit_object(
            repo,
            commit,
            api_key=api_key,
            model=model,
            max_diff_chars=max_diff_chars,
            system_prompt=system_prompt,
        )
    except DiffTooLargeError:
        raise
    except Exception as e:
        raise AIAnalysisError(f"AI analysis failed: {e}") from e


def analyze_commit_range(
    repo_path: str,
    rev_range: str,
    *,
    api_key: str,
    model: str = "openai/gpt-4o-mini",
    max_commits: int = 20,
    max_diff_chars: int | str | None = None,
    system_prompt: str | None = None,
) -> list[dict[str, str]]:
    """Analyze a commit range (e.g., HEAD~5..HEAD). Returns newest-first results."""
    try:
        repo = Repo(repo_path)
        commits = list(repo.iter_commits(rev_range, max_count=max(1, max_commits)))
        if not commits:
            raise GitAnalysisError(f"No commits found in range '{rev_range}'")
    except GitAnalysisError:
        raise
    except Exception as e:
        raise GitAnalysisError(f"Could not read commit range '{rev_range}': {e}") from e

    analyses = []
    for commit in commits:
        try:
            result, diff = _analyze_commit_object(
                repo,
                commit,
                api_key=api_key,
                model=model,
                max_diff_chars=max_diff_chars,
                system_prompt=system_prompt,
            )
            analyses.append(
                {
                    "ref": commit.hexsha,
                    "short_ref": commit.hexsha[:8],
                    "title": commit.summary or commit.hexsha[:8],
                    "result": result,
                    "diff": diff,
                }
            )
        except DiffTooLargeError as e:
            raise DiffTooLargeError(
                f"Commit {commit.hexsha[:8]} cannot be analyzed: {e}"
            ) from e
        except Exception as e:
            raise AIAnalysisError(
                f"AI analysis failed for commit {commit.hexsha[:8]}: {e}"
            ) from e
    return analyses


def analyze_staged(
    repo_path: str,
    *,
    api_key: str,
    model: str = "openai/gpt-4o-mini",
    max_diff_chars: int | str | None = None,
    system_prompt: str | None = None,
) -> tuple[str, str]:
    """Analyze staged changes. Returns (analysis_result, diff)."""
    try:
        repo = Repo(repo_path)
        diff = repo.git.diff("--cached")
        if not diff.strip():
            return ("No staged changes to analyze.", "")
        _validate_diff_size(diff, context="staged changes", max_diff_chars=max_diff_chars)

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
        result = _call_ai(
            diff,
            "(staged changes)",
            files,
            api_key,
            model,
            system_prompt=system_prompt,
        )
        return (result, diff)
    except DiffTooLargeError:
        raise
    except Exception as e:
        raise AIAnalysisError(f"AI analysis failed: {e}") from e


def list_commits(
    repo_path: str,
    *,
    search: str = "",
    limit: int = 80,
) -> list[dict[str, str]]:
    """
    List recent commits from HEAD for commit picker UI.
    If search is provided, scan more history and return up to `limit` matches.
    """
    try:
        repo = Repo(repo_path)
    except Exception as e:
        raise GitAnalysisError(f"Could not open repository '{repo_path}': {e}") from e

    safe_limit = max(1, limit)
    term = search.strip().lower()
    commits: list[dict[str, str]] = []

    if not term:
        iterable = repo.iter_commits("HEAD", max_count=safe_limit)
        scan_limit = safe_limit
    else:
        iterable = repo.iter_commits("HEAD")
        scan_limit = max(200, safe_limit * 20)

    for idx, commit in enumerate(iterable):
        if idx >= scan_limit:
            break

        title = commit.summary or commit.hexsha[:8]
        author = (commit.author.name or "").strip() or "Unknown author"
        message = (commit.message or "").strip()

        if term:
            haystack = f"{commit.hexsha}\n{title}\n{author}\n{message}".lower()
            if term not in haystack:
                continue

        committed_at = ""
        if commit.committed_datetime:
            committed_at = commit.committed_datetime.isoformat()

        commits.append(
            {
                "ref": commit.hexsha,
                "short_ref": commit.hexsha[:8],
                "title": title,
                "author": author,
                "date": committed_at,
            }
        )

        if len(commits) >= safe_limit:
            break

    return commits
