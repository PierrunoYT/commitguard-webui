"""GitHub API integration for remote repository analysis."""

import json
import logging
import re
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from .analyzer import (
    _call_ai,
    _validate_diff_size,
    AnalysisError,
    AIAnalysisError,
    DiffTooLargeError,
)

GITHUB_API_BASE = "https://api.github.com"
logger = logging.getLogger(__name__)


class GitHubError(AnalysisError):
    """Raised when GitHub API operations fail."""


def is_github_url(url: str) -> bool:
    """Return True if the string looks like a GitHub repository URL."""
    if not url:
        return False
    url = url.strip()
    return bool(
        re.match(r"^https?://github\.com/[\w.\-]+/[\w.\-]+", url)
        or re.match(r"^git@github\.com:[\w.\-]+/[\w.\-]+", url)
    )


def parse_github_url(url: str) -> tuple[str, str]:
    """
    Extract (owner, repo) from a GitHub URL.
    Raises ValueError if the URL cannot be parsed.
    """
    url = url.strip().rstrip("/")
    m = re.match(r"^https?://github\.com/([\w.\-]+)/([\w.\-]+?)(?:\.git)?$", url)
    if m:
        return m.group(1), m.group(2)
    m = re.match(r"^git@github\.com:([\w.\-]+)/([\w.\-]+?)(?:\.git)?$", url)
    if m:
        return m.group(1), m.group(2)
    raise ValueError(f"Could not parse GitHub URL: {url!r}")


def _github_request(
    path: str,
    token: str | None = None,
    *,
    accept: str = "application/vnd.github+json",
) -> bytes:
    """Make a GET request to the GitHub API and return the response body."""
    url = f"{GITHUB_API_BASE}{path}"
    headers = {
        "Accept": accept,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "CommitGuard/1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=30) as resp:
            return resp.read()
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        try:
            data = json.loads(body)
            msg = data.get("message", body) or str(e)
        except Exception:
            msg = body or str(e)
        status = e.code
        if status == 401:
            raise GitHubError(f"GitHub authentication failed: {msg}") from e
        if status == 403:
            raise GitHubError(
                f"GitHub access forbidden (rate limit or private repo): {msg}"
            ) from e
        if status == 404:
            raise GitHubError(f"GitHub resource not found: {msg}") from e
        raise GitHubError(f"GitHub API error {status}: {msg}") from e
    except URLError as e:
        raise GitHubError(f"Could not reach GitHub API: {e}") from e


def list_github_commits(
    owner: str,
    repo: str,
    *,
    token: str | None = None,
    search: str = "",
    limit: int = 80,
    branch: str = "",
) -> list[dict[str, str]]:
    """List recent commits from a GitHub repository."""
    safe_limit = min(max(1, limit), 100)
    params = f"per_page={safe_limit}"
    if branch:
        params += f"&sha={branch}"
    body = _github_request(f"/repos/{owner}/{repo}/commits?{params}", token)
    commits_data = json.loads(body)

    term = search.strip().lower()
    commits = []
    for item in commits_data:
        sha = item.get("sha", "")
        commit_info = item.get("commit", {})
        message = (commit_info.get("message", "") or "").strip()
        title = message.split("\n")[0] if message else sha[:8]
        author_info = commit_info.get("author", {}) or {}
        author_name = (author_info.get("name", "") or "").strip() or "Unknown author"
        committed_at = author_info.get("date", "")

        if term:
            haystack = f"{sha}\n{title}\n{author_name}\n{message}".lower()
            if term not in haystack:
                continue

        commits.append(
            {
                "ref": sha,
                "short_ref": sha[:8] if sha else "commit",
                "title": title or sha[:8],
                "author": author_name,
                "date": committed_at,
            }
        )

        if len(commits) >= safe_limit:
            break

    return commits


def fetch_github_commit_diff(
    owner: str,
    repo: str,
    sha: str,
    *,
    token: str | None = None,
) -> tuple[str, str, list[str]]:
    """
    Fetch a commit's diff, message, and changed files from GitHub.
    Returns (diff_text, commit_message, files).
    """
    body = _github_request(f"/repos/{owner}/{repo}/commits/{sha}", token)
    data = json.loads(body)
    commit_info = data.get("commit", {})
    message = (commit_info.get("message", "") or "").strip() or sha[:8]
    files_data = data.get("files", [])
    file_paths = [f.get("filename", "") for f in files_data if f.get("filename")]

    diff_body = _github_request(
        f"/repos/{owner}/{repo}/commits/{sha}",
        token,
        accept="application/vnd.github.v3.diff",
    )
    diff_text = diff_body.decode("utf-8", errors="replace")
    return diff_text, message, file_paths


def analyze_github_commit(
    owner: str,
    repo: str,
    sha: str,
    *,
    token: str | None = None,
    api_key: str,
    model: str = "openai/gpt-4o-mini",
    max_diff_chars=None,
    system_prompt: str | None = None,
) -> tuple[str, str]:
    """Analyze a GitHub commit. Returns (analysis_result, diff)."""
    try:
        diff, message, files = fetch_github_commit_diff(owner, repo, sha, token=token)
    except GitHubError:
        raise
    except Exception as e:
        raise GitHubError(f"Could not fetch commit {sha[:8]!r}: {e}") from e

    _validate_diff_size(diff, context=f"commit {sha[:8]}", max_diff_chars=max_diff_chars)

    try:
        result = _call_ai(
            diff, message, files, api_key, model, system_prompt=system_prompt
        )
    except DiffTooLargeError:
        raise
    except Exception as e:
        raise AIAnalysisError(f"AI analysis failed: {e}") from e

    return result, diff


def analyze_github_commit_range(
    owner: str,
    repo: str,
    base: str,
    head: str,
    *,
    token: str | None = None,
    api_key: str,
    model: str = "openai/gpt-4o-mini",
    max_commits: int = 20,
    max_diff_chars=None,
    system_prompt: str | None = None,
) -> list[dict[str, str]]:
    """
    Analyze commits in a range on GitHub (base..head).
    Returns list of analysis results, newest-first.
    """
    try:
        body = _github_request(
            f"/repos/{owner}/{repo}/compare/{base}...{head}", token
        )
        data = json.loads(body)
        commits = data.get("commits", [])
        if not commits:
            raise GitHubError(f"No commits found between {base!r} and {head!r}")
        commits = list(reversed(commits[:max_commits]))
    except GitHubError:
        raise
    except Exception as e:
        raise GitHubError(f"Could not fetch commit range: {e}") from e

    analyses = []
    for item in commits:
        sha = item.get("sha", "")
        commit_info = item.get("commit", {})
        title = (commit_info.get("message", "") or "").split("\n")[0] or sha[:8]
        try:
            result, diff = analyze_github_commit(
                owner,
                repo,
                sha,
                token=token,
                api_key=api_key,
                model=model,
                max_diff_chars=max_diff_chars,
                system_prompt=system_prompt,
            )
            analyses.append(
                {
                    "ref": sha,
                    "short_ref": sha[:8],
                    "title": title,
                    "result": result,
                    "diff": diff,
                }
            )
        except DiffTooLargeError as e:
            raise DiffTooLargeError(
                f"Commit {sha[:8]} cannot be analyzed: {e}"
            ) from e
        except Exception as e:
            raise AIAnalysisError(
                f"AI analysis failed for commit {sha[:8]}: {e}"
            ) from e

    return analyses


def list_github_prs(
    owner: str,
    repo: str,
    *,
    token: str | None = None,
    state: str = "open",
    limit: int = 50,
) -> list[dict]:
    """List pull requests from a GitHub repository."""
    safe_limit = min(max(1, limit), 100)
    body = _github_request(
        f"/repos/{owner}/{repo}/pulls?state={state}&per_page={safe_limit}&sort=updated&direction=desc",
        token,
    )
    prs_data = json.loads(body)
    return [
        {
            "number": pr.get("number"),
            "title": (pr.get("title") or "").strip(),
            "author": (pr.get("user", {}) or {}).get("login", ""),
            "state": pr.get("state", ""),
            "draft": pr.get("draft", False),
            "base": (pr.get("base", {}) or {}).get("ref", ""),
            "head": (pr.get("head", {}) or {}).get("ref", ""),
            "created_at": pr.get("created_at", ""),
            "updated_at": pr.get("updated_at", ""),
            "url": pr.get("html_url", ""),
        }
        for pr in prs_data
    ]


def analyze_github_pr(
    owner: str,
    repo: str,
    pr_number: int,
    *,
    token: str | None = None,
    api_key: str,
    model: str = "openai/gpt-4o-mini",
    max_diff_chars=None,
    system_prompt: str | None = None,
) -> tuple[str, str, str]:
    """
    Analyze a GitHub pull request. Returns (analysis_result, diff, pr_title).
    """
    try:
        body = _github_request(f"/repos/{owner}/{repo}/pulls/{pr_number}", token)
        pr_data = json.loads(body)
        pr_title = (pr_data.get("title") or "").strip() or f"PR #{pr_number}"
    except GitHubError:
        raise
    except Exception as e:
        raise GitHubError(f"Could not fetch PR #{pr_number}: {e}") from e

    try:
        diff_body = _github_request(
            f"/repos/{owner}/{repo}/pulls/{pr_number}",
            token,
            accept="application/vnd.github.v3.diff",
        )
        diff = diff_body.decode("utf-8", errors="replace")
    except GitHubError:
        raise
    except Exception as e:
        raise GitHubError(f"Could not fetch diff for PR #{pr_number}: {e}") from e

    try:
        files_body = _github_request(
            f"/repos/{owner}/{repo}/pulls/{pr_number}/files?per_page=100", token
        )
        files_data = json.loads(files_body)
        files = [f.get("filename", "") for f in files_data if f.get("filename")]
    except Exception:
        files = []

    _validate_diff_size(diff, context=f"PR #{pr_number}", max_diff_chars=max_diff_chars)

    try:
        result = _call_ai(
            diff,
            f"PR #{pr_number}: {pr_title}",
            files,
            api_key,
            model,
            system_prompt=system_prompt,
        )
    except DiffTooLargeError:
        raise
    except Exception as e:
        raise AIAnalysisError(f"AI analysis failed: {e}") from e

    return result, diff, pr_title
