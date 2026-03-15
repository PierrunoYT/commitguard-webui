# CommitGuard

AI-powered CLI that analyzes Git commits for bugs, security issues, and code quality problems.

**[GitHub](https://github.com/PierrunoYT/commitguard)**

## Requirements

- Python 3.9+
- [OpenRouter](https://openrouter.ai/) API key (supports GPT-4, Claude, Gemini, and more)

## Installation

From PyPI:

```bash
pip install commitguard-ai
```

From source (development):

```bash
pip install -e .
```

Or install dependencies only:

```bash
pip install -r requirements.txt
```

## Configuration

Get an API key at [openrouter.ai/keys](https://openrouter.ai/keys), then set it:

```bash
# Linux / macOS
export OPENROUTER_API_KEY=sk-or-...

# Windows (PowerShell)
$env:OPENROUTER_API_KEY = "sk-or-..."
```

Or pass it via `--api-key` when running commands.

## Usage

**Analyze the last commit (HEAD):**
```bash
commitguard analyze
```

**Analyze a specific commit:**
```bash
commitguard analyze abc123
```

**Analyze last 5 commits:**
```bash
commitguard analyze -n 5
```

**Analyze staged changes (before committing):**
```bash
commitguard check
```

### Options

| Option | Description |
|--------|-------------|
| `-r, --repo PATH` | Path to Git repository (default: current dir) |
| `--api-key KEY` | OpenRouter API key (or use `OPENROUTER_API_KEY` env) |
| `--model MODEL` | Model to use (default: `openai/gpt-4o-mini`). Examples: `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`, `google/gemini-pro` |

## Development

Run from source without installing:

```bash
python -m commitguard.cli analyze
```

## License

[MIT](LICENSE)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.
