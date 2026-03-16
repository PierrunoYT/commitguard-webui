"""CLI for CommitGuard."""

import os
from pathlib import Path

import click

from .analyzer import analyze_commit, analyze_staged
from .github_analyzer import (
    GitHubError,
    analyze_github_commit,
    analyze_github_pr,
    is_github_url,
    parse_github_url,
)
from . import __version__


def get_repo_path(path: str | None) -> Path:
    """Resolve local repository path. Defaults to current directory."""
    repo_path = Path(path or ".").resolve()
    if not (repo_path / ".git").exists():
        raise click.ClickException(f"Not a Git repository: {repo_path}")
    return repo_path


@click.group()
@click.version_option(version=__version__, prog_name="CommitGuard")
def main() -> None:
    """AI-powered tool to analyze Git commits for bugs and issues."""
    pass


@main.command()
@click.argument("commit", default="HEAD", required=False)
@click.option(
    "-r",
    "--repo",
    "repo_path",
    default=".",
    help="Local path to Git repo, or a GitHub URL (https://github.com/owner/repo).",
)
@click.option(
    "-n",
    "--count",
    type=int,
    default=1,
    help="Number of commits to analyze (local repos only, when using HEAD~n).",
)
@click.option(
    "--api-key",
    envvar="OPENROUTER_API_KEY",
    help="OpenRouter API key (or set OPENROUTER_API_KEY).",
)
@click.option(
    "--github-token",
    envvar="GITHUB_TOKEN",
    help="GitHub personal access token for private repos or higher rate limits (or set GITHUB_TOKEN).",
)
@click.option(
    "--model",
    "-m",
    envvar="OPENROUTER_MODEL",
    default="openai/gpt-4o-mini",
    help="Model to use (e.g. openai/gpt-4o, anthropic/claude-3.5-sonnet, google/gemini-pro). Set OPENROUTER_MODEL for default.",
)
def analyze(
    commit: str,
    repo_path: str,
    count: int,
    api_key: str | None,
    github_token: str | None,
    model: str,
) -> None:
    """Analyze one or more commits for bugs and issues.

    REPO can be a local path or a GitHub URL. For GitHub repos, COMMIT must be
    a full or abbreviated commit SHA.
    """
    key = api_key or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise click.ClickException(
            "OpenRouter API key required. Set OPENROUTER_API_KEY or use --api-key."
        )
    if count < 1:
        raise click.ClickException("--count must be at least 1.")

    if is_github_url(repo_path):
        gh_token = github_token or os.environ.get("GITHUB_TOKEN")
        try:
            owner, repo = parse_github_url(repo_path)
        except ValueError as e:
            raise click.ClickException(str(e))

        if count > 1:
            click.echo(
                click.style(
                    "Warning: --count is ignored for GitHub repos. Pass multiple SHAs instead.",
                    fg="yellow",
                )
            )
        try:
            result, _ = analyze_github_commit(
                owner, repo, commit, token=gh_token, api_key=key, model=model
            )
            click.echo()
            click.secho(f"Commit: {commit}", fg="cyan", bold=True)
            click.echo(f"Repository: {owner}/{repo}")
            click.echo(result)
            click.echo()
        except GitHubError as e:
            raise click.ClickException(str(e))
        except Exception as e:
            raise click.ClickException(f"Error analyzing commit: {e}")
        return

    repo = get_repo_path(repo_path)
    refs = [commit] if count == 1 else [f"{commit}~{i}" for i in range(count)]
    had_errors = False
    for ref in refs:
        try:
            result, _ = analyze_commit(str(repo), ref, api_key=key, model=model)
            click.echo()
            click.secho(f"Commit: {ref}", fg="cyan", bold=True)
            click.echo(result)
            click.echo()
        except Exception as e:
            click.echo(click.style(f"Error analyzing {ref}: {e}", fg="red"))
            had_errors = True
    if had_errors:
        raise click.ClickException("One or more commits failed to analyze.")


@main.command()
@click.option(
    "-r",
    "--repo",
    "repo_path",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=".",
    help="Path to Git repository.",
)
@click.option(
    "--api-key",
    envvar="OPENROUTER_API_KEY",
    help="OpenRouter API key (or set OPENROUTER_API_KEY).",
)
@click.option(
    "--model",
    "-m",
    envvar="OPENROUTER_MODEL",
    default="openai/gpt-4o-mini",
    help="Model to use (e.g. openai/gpt-4o, anthropic/claude-3.5-sonnet). Set OPENROUTER_MODEL for default.",
)
def check(
    repo_path: Path,
    api_key: str | None,
    model: str,
) -> None:
    """Analyze staged changes (before commit). Local repos only."""
    repo = get_repo_path(str(repo_path))
    key = api_key or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise click.ClickException(
            "OpenRouter API key required. Set OPENROUTER_API_KEY or use --api-key."
        )

    click.echo("Analyzing staged changes...")
    try:
        result, _ = analyze_staged(str(repo), api_key=key, model=model)
        click.echo(result)
    except Exception as e:
        raise click.ClickException(str(e))


@main.command("analyze-pr")
@click.argument("pr_number", type=int)
@click.option(
    "--repo",
    "-r",
    "repo_url",
    required=True,
    help="GitHub repository URL (e.g. https://github.com/owner/repo).",
)
@click.option(
    "--api-key",
    envvar="OPENROUTER_API_KEY",
    help="OpenRouter API key (or set OPENROUTER_API_KEY).",
)
@click.option(
    "--github-token",
    envvar="GITHUB_TOKEN",
    help="GitHub personal access token (or set GITHUB_TOKEN).",
)
@click.option(
    "--model",
    "-m",
    envvar="OPENROUTER_MODEL",
    default="openai/gpt-4o-mini",
    help="Model to use.",
)
def analyze_pr(
    pr_number: int,
    repo_url: str,
    api_key: str | None,
    github_token: str | None,
    model: str,
) -> None:
    """Analyze a GitHub pull request."""
    key = api_key or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise click.ClickException(
            "OpenRouter API key required. Set OPENROUTER_API_KEY or use --api-key."
        )
    if not is_github_url(repo_url):
        raise click.ClickException(
            f"Expected a GitHub URL, got: {repo_url!r}"
        )
    gh_token = github_token or os.environ.get("GITHUB_TOKEN")
    try:
        owner, repo = parse_github_url(repo_url)
    except ValueError as e:
        raise click.ClickException(str(e))

    click.echo(f"Analyzing PR #{pr_number} in {owner}/{repo}...")
    try:
        result, _, pr_title = analyze_github_pr(
            owner, repo, pr_number, token=gh_token, api_key=key, model=model
        )
        click.echo()
        click.secho(f"PR #{pr_number}: {pr_title}", fg="cyan", bold=True)
        click.echo(result)
        click.echo()
    except GitHubError as e:
        raise click.ClickException(str(e))
    except Exception as e:
        raise click.ClickException(f"Error analyzing PR: {e}")


if __name__ == "__main__":
    main()
