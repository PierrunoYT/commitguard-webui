# CommitGuard Web UI

AI-powered web interface that analyzes Git commits for bugs, security issues, and code quality problems. Uses [OpenRouter](https://openrouter.ai/) for access to GPT-4, Claude, Gemini, and 100+ other models.

## Features

- **Analyze commits** – Detect bugs, security issues, and code quality problems
- **Analyze commit ranges** – Review a revision range like `HEAD~5..HEAD`
- **Analyze multiple refs** – Enter comma/newline-separated refs and analyze each
- **Commit picker with search** – Browse recent commits, filter, select, and analyze chosen commits
- **Tabbed results UI** – Each commit result opens in its own tab/panel
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

Get an API key at [openrouter.ai/keys](https://openrouter.ai/keys).

**Option 1 – Save in the UI:** Enter your key in the web UI and click **Save**. It is stored in your user config directory with restricted permissions:
- **Linux/macOS:** `~/.config/commitguard-webui/api_key`
- **Windows:** `%LOCALAPPDATA%\commitguard-webui\api_key`

**Option 2 – Environment variable:**

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

- **Analyze Commit** – Supports:
  - single ref: `HEAD`, `abc123`
  - range in same input: `HEAD~5..HEAD`
  - multiple refs: `abc123,def456` (comma or newline separated)
- **Analyze Range** – Use dedicated range input/button for range-only workflow
- **Recent Commits picker** – Search by message/hash/author, select one or more commits, then click **Analyze selected**
- **Check Staged** – Analyze staged changes before committing
- Set your OpenRouter API key (or save it for reuse) and repository path in the form
- Adjust **Max Diff Characters** in the UI for per-request diff safety limits (default `50000`)
- Edit **System Prompt** in the UI to customize review behavior for each run (pre-filled with CommitGuard defaults)
- Multi-commit analyses render one tab per commit result to avoid crowded output

## API Endpoints

- `POST /api/analyze`  
  Analyze one commit ref.
  Request supports optional overrides: `max_diff_chars`, `system_prompt`, `include_diff`.
  Returns:
  - `result` (markdown analysis)
  - `diff` (possibly redacted/truncated)
  - `diff_truncated` (boolean)

- `POST /api/analyze-range`  
  Analyze a commit range.
  Request includes `range` and optional: `max_commits`, `max_diff_chars`, `system_prompt`, `include_diff`.
  Returns:
  - `results[]` with `ref`, `short_ref`, `title`, `result`, `diff`, `diff_truncated`
  - `count`

- `POST /api/check`  
  Analyze staged changes.
  Request supports optional overrides: `max_diff_chars`, `system_prompt`, `include_diff`.
  Returns `result`, `diff`, `diff_truncated`.

- `POST /api/commits`  
  Load recent commits for the commit picker with optional search and limit. Returns:
  - `commits[]` with `ref`, `short_ref`, `title`, `author`, `date`
  - `count`

- `POST /api/models`  
  Loads available OpenRouter models for the model picker.

- `GET|POST|DELETE /api/settings/key`  
  Check key status, save key, or clear saved key.

## Limits and behavior notes

- Range analysis defaults to `max_commits=20`; server clamps `max_commits` to `1..50`.
- Commit picker requests up to 120 commits by default; API clamps `limit` to `1..200`.
- AI analysis input diff is validated before calling OpenRouter:
  - default hard limit: `COMMITGUARD_MAX_DIFF` (default `50000` chars)
  - warning threshold (server log only): `COMMITGUARD_WARN_DIFF` (default `30000` chars)
  - token estimate uses `COMMITGUARD_CHARS_PER_TOKEN` (default `4`) for messaging
- UI/API can override the hard limit per request using `max_diff_chars` (must be a positive integer).
- If a diff exceeds the hard limit, the API returns `413` with a clear message instead of sending the request upstream.
- System prompt defaults to CommitGuard's built-in prompt and can be overridden per request with `system_prompt`.
- UI diff payload is truncated to 150,000 chars (`UI_DIFF_CHAR_LIMIT`) and flagged by `diff_truncated`.
- API key resolution order: request key -> saved key -> `OPENROUTER_API_KEY`.

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
| Invalid or missing API key | Save your key in the UI or set `OPENROUTER_API_KEY`. Get a key at [openrouter.ai/keys](https://openrouter.ai/keys) |
| Model not found | Use the full model ID (e.g. `openai/gpt-4o-mini`). Check [openrouter.ai/models](https://openrouter.ai/models) |
| Rate limit exceeded | Wait and retry, or switch to a different model |
| Service unavailable | OpenRouter may be down; try again later |

**Security:** Never commit your API key. Use the UI save option (stored locally) or environment variables.

## Development

```bash
python app.py
```

## License

[MIT](LICENSE)
