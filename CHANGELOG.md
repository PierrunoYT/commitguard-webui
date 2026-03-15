# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
