# CommitGuard Web UI

AI-powered web interface that analyzes Git commits for bugs, security issues, and code quality problems. Uses [OpenRouter](https://openrouter.ai/) for access to GPT-4, Claude, Gemini, and 100+ other models.

## Features

- **Analyze commits** – Detect bugs, security issues, and code quality problems
- **Analyze commit ranges** – Review a revision range like `HEAD~5..HEAD`
- **Analyze multiple refs** – Enter comma/newline-separated refs and analyze each
- **Commit picker with search** – Browse recent commits, filter, select, and analyze chosen commits
- **Tabbed results UI** – Each commit result opens in its own tab/panel
- **Pre-commit check** – Review staged changes before committing
- **GitHub support** – Analyze commits and PRs from GitHub URLs (no local clone needed)
- **Multi-model** – Use any model on OpenRouter (GPT-4, Claude, Gemini, etc.)
- **Next.js** – Full-stack Next.js app (no separate backend)

## Requirements

- Node.js 18+
- [OpenRouter](https://openrouter.ai/) API key

## Installation

```bash
cd webui
npm install
```

## Usage

```bash
cd webui
npm run dev
```

Then open http://localhost:3000 in your browser.

For local repository analysis, the repository path is resolved relative to the server's working directory (the `webui` folder when running `npm run dev`). To analyze the parent project, use `..` as the repository path.

## Configuration

Get an API key at [openrouter.ai/keys](https://openrouter.ai/keys).

**Option 1 – Save in the UI:** Enter your key in the web UI and click **Save**. It is stored in your user config directory:
- **Linux/macOS:** `~/.config/commitguard-webui/api_key`
- **Windows:** `%LOCALAPPDATA%\commitguard-webui\api_key`

**Option 2 – Environment variable:**

```bash
export OPENROUTER_API_KEY=sk-or-...
```

## License

[MIT](LICENSE)
