# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Prevent crash when collecting changed file paths from commits that include adds/deletes/renames
- `analyze -n <count>` now correctly uses the provided commit reference (e.g. `<commit>~0`, `<commit>~1`, ...)
- `analyze` now exits with an error when one or more commit analyses fail (better CI/automation behavior)
- Validate `--count` to require a value of at least `1`

## [0.2.2] - 2025-03-15

### Added

- `-m` short option for `--model` (e.g. `commitguard analyze -m google/gemini-pro`)
- `OPENROUTER_MODEL` environment variable to set default model

### Changed

- Model option now reads from `OPENROUTER_MODEL` when not specified via CLI

## [0.2.1] - 2025-03-15

### Added

- Error handling with user-friendly messages for API failures
- Input validation for API key and model
- README Troubleshooting section with common errors and solutions

### Changed

- API errors are sanitized – keys and sensitive data are never exposed in error messages
- Graceful handling of 401/403 (auth), 404 (model not found), 429 (rate limit), 503 (unavailable)

## [0.2.0] - 2025-03-15

### Added

- OpenRouter integration for access to 100+ models (GPT-4, Claude, Gemini, etc.)
- `--model` option to choose any OpenRouter model (e.g. `anthropic/claude-3.5-sonnet`, `google/gemini-pro`)

### Changed

- **Breaking:** Switched from OpenAI API to OpenRouter
- **Breaking:** Environment variable is now `OPENROUTER_API_KEY` (was `OPENAI_API_KEY`)
- Default model: `openai/gpt-4o-mini`
- PyPI package name: `commitguard-ai`

## [0.1.0] - 2025-03-15

### Added

- Initial release
- CLI with `commitguard` command
- `analyze` – analyze commits for bugs, security issues, and code quality
- `check` – analyze staged changes before commit
- Support for single commit, multiple commits (`-n`), or commit by hash
- OpenAI integration
- `--repo` option for analyzing repos outside current directory
