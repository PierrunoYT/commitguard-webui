# CommitGuard

AI-powered CLI that analyzes Git commits for bugs, security issues, and code quality problems.

**[GitHub](https://github.com/PierrunoYT/commitguard)**

## Requirements

- Python 3.9+
- OpenAI API key

## Installation

From PyPI:

```bash
pip install commitguard
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

Set your OpenAI API key:

```bash
# Linux / macOS
export OPENAI_API_KEY=sk-...

# Windows (PowerShell)
$env:OPENAI_API_KEY = "sk-..."
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
| `--api-key KEY` | OpenAI API key (or use `OPENAI_API_KEY` env) |
| `--model MODEL` | Model to use (default: `gpt-4o-mini`) |

## Development

Run from source without installing:

```bash
python -m commitguard.cli analyze
```

## License

[MIT](LICENSE)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.
