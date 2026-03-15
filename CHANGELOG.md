# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-03-15

### Added

- CLI with `commitguard` command
- `analyze` command to analyze commits for bugs and issues
- `check` command to analyze staged changes before commit
- Support for analyzing single commit, multiple commits, or specific commit by hash
- OpenAI integration (gpt-4o-mini by default)
- Configurable model and API key via CLI or environment variable
- Repository path option for analyzing repos outside current directory
