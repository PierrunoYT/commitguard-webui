# CommitGuard

AI-powered CLI that analyzes Git commits for bugs, security issues, and code quality problems. Uses [OpenRouter](https://openrouter.ai/) for access to GPT-4, Claude, Gemini, and 100+ other models.

[GitHub](https://github.com/PierrunoYT/commitguard) · [PyPI](https://pypi.org/project/commitguard-ai/)

## Features

- **Analyze commits** – Detect bugs, security issues, and code quality problems
- **Pre-commit check** – Review staged changes before committing
- **Multi-model** – Use any model on OpenRouter (GPT-4, Claude, Gemini, etc.)
- **Simple CLI** – One command, clear output

## Requirements

- Python 3.9+
- [OpenRouter](https://openrouter.ai/) API key

## Installation

```bash
pip install commitguard-ai
```

From source:

```bash
git clone https://github.com/PierrunoYT/commitguard.git
cd commitguard
pip install -e .
```

## Configuration

Get an API key at [openrouter.ai/keys](https://openrouter.ai/keys):

```bash
# Linux / macOS
export OPENROUTER_API_KEY=sk-or-...

# Windows (PowerShell)
$env:OPENROUTER_API_KEY = "sk-or-..."
```

## Usage

```bash
# Analyze last commit
commitguard analyze

# Analyze specific commit
commitguard analyze abc123

# Analyze last 5 commits
commitguard analyze -n 5

# Analyze staged changes (before commit)
commitguard check

# Use a different model
commitguard analyze --model anthropic/claude-3.5-sonnet
commitguard analyze --model google/gemini-pro
```

### Options

| Option | Description |
|--------|-------------|
| `-r, --repo PATH` | Path to Git repository (default: current dir) |
| `--api-key KEY` | OpenRouter API key (or `OPENROUTER_API_KEY` env) |
| `--model MODEL` | Model to use (default: `openai/gpt-4o-mini`) |

### Model examples

| Model | Use case |
|-------|----------|
| `openai/gpt-4o-mini` | Fast, cheap (default) |
| `openai/gpt-4o` | Higher quality |
| `anthropic/claude-3.5-sonnet` | Strong code analysis |
| `google/gemini-pro` | Alternative option |

See [OpenRouter models](https://openrouter.ai/models) for the full list.

## Development

```bash
python -m commitguard.cli analyze
```

## License

[MIT](LICENSE)

## Changelog

[CHANGELOG.md](CHANGELOG.md)
