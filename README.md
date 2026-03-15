# CommitGuard Web UI

AI-powered web interface that analyzes Git commits for bugs, security issues, and code quality problems. Uses [OpenRouter](https://openrouter.ai/) for access to GPT-4, Claude, Gemini, and 100+ other models.

## Features

- **Analyze commits** – Detect bugs, security issues, and code quality problems
- **Pre-commit check** – Review staged changes before committing
- **Multi-model** – Use any model on OpenRouter (GPT-4, Claude, Gemini, etc.)
- **Web UI** – Browser-based interface with Python backend

## Requirements

- Python 3.9+
- [OpenRouter](https://openrouter.ai/) API key

## Installation

```bash
cd commitguard-webui
pip install -r requirements.txt
```

## Configuration

Get an API key at [openrouter.ai/keys](https://openrouter.ai/keys):

```bash
# Linux / macOS
export OPENROUTER_API_KEY=sk-or-...

# Windows (PowerShell)
$env:OPENROUTER_API_KEY = "sk-or-..."
```

Optional – default model (otherwise `openai/gpt-4o-mini`):

```bash
export OPENROUTER_MODEL=anthropic/claude-3.5-sonnet   # Linux/macOS
$env:OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet" # Windows
```

## Usage

```bash
# Start the web server
python app.py
```

Then open http://127.0.0.1:5000 in your browser.

- **Analyze Commit** – Enter a commit ref (e.g. `HEAD`, `abc123`) and click Analyze
- **Check Staged** – Analyze staged changes before committing
- Set your OpenRouter API key and repository path in the form

### Model examples

| Model | Use case |
|-------|----------|
| `openai/gpt-4o-mini` | Fast, cheap (default) |
| `openai/gpt-4o` | Higher quality |
| `anthropic/claude-3.5-sonnet` | Strong code analysis |
| `google/gemini-pro` | Alternative option |

See [OpenRouter models](https://openrouter.ai/models) for the full list.

## Troubleshooting

| Error | Solution |
|-------|----------|
| Invalid or missing API key | Set `OPENROUTER_API_KEY` or use `--api-key`. Get a key at [openrouter.ai/keys](https://openrouter.ai/keys) |
| Model not found | Use the full model ID (e.g. `openai/gpt-4o-mini`). Check [openrouter.ai/models](https://openrouter.ai/models) |
| Rate limit exceeded | Wait and retry, or switch to a different model |
| Service unavailable | OpenRouter may be down; try again later |

**Security:** Never commit your API key. Use environment variables or `--api-key` at runtime.

## Development

```bash
python app.py
```

## License

[MIT](LICENSE)
