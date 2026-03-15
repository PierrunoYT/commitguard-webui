"""Commit analysis using AI via OpenRouter."""

from git import Repo
from git.exc import GitCommandError
from openai import OpenAI

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


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
    return diff


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


def _analyze_commit_object(repo: Repo, commit, *, api_key: str, model: str) -> tuple[str, str]:
    """Analyze a commit object and return (result, diff)."""
    diff = _get_diff(repo, commit)
    files = _collect_commit_files(commit)
    result = _call_ai(diff, commit.message, files, api_key, model)
    return (result, diff)


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
    except Exception as e:
        raise GitAnalysisError(f"Could not read commit '{ref}': {e}") from e

    try:
        return _analyze_commit_object(repo, commit, api_key=api_key, model=model)
    except Exception as e:
        raise AIAnalysisError(f"AI analysis failed: {e}") from e


def analyze_commit_range(
    repo_path: str,
    rev_range: str,
    *,
    api_key: str,
    model: str = "openai/gpt-4o-mini",
    max_commits: int = 20,
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
            result, diff = _analyze_commit_object(repo, commit, api_key=api_key, model=model)
            analyses.append(
                {
                    "ref": commit.hexsha,
                    "short_ref": commit.hexsha[:8],
                    "title": commit.summary or commit.hexsha[:8],
                    "result": result,
                    "diff": diff,
                }
            )
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
        result = _call_ai(diff, "(staged changes)", files, api_key, model)
        return (result, diff)
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
