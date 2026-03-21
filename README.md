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
- **Analysis history** – Persist analysis results to file system (Chrome/Edge/Opera) or browser storage
- **Export results** – Export history to JSON for backup or sharing
- **Custom prompts** – Configure system prompts for different analysis styles
- **Masked API keys** – Secure input fields with visual feedback when keys are saved
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

### OpenRouter API Key (Required)

Get an API key at [openrouter.ai/keys](https://openrouter.ai/keys).

**Option 1 – Save in the UI (Recommended):**
1. Open the web UI at http://localhost:3000
2. Enter your API key in the "API Key" field at the top
3. Click **Save**

The key is stored securely in your user config directory:
- **Linux/macOS:** `~/.config/commitguard-webui/api_key`
- **Windows:** `%LOCALAPPDATA%\commitguard-webui\api_key`

The field will show `********` when the key is saved. Click the field to enter a new key.

**Option 2 – Environment variable:**

```bash
export OPENROUTER_API_KEY=sk-or-...
```

### GitHub Token (Optional)

For analyzing private GitHub repositories or accessing PR data:
1. Create a token at [github.com/settings/tokens](https://github.com/settings/tokens) (select `repo` scope)
2. Enter the token in the "GitHub" field at the top of the UI
3. Click **Save**

The token is stored in the same config directory as the API key:
- **Linux/macOS:** `~/.config/commitguard-webui/github_token`
- **Windows:** `%LOCALAPPDATA%\commitguard-webui\github_token`

### Analysis History Storage

Analysis results can be saved for later review. Click the **History** button in the header.

**Storage Options:**
- **File System** (Chrome/Edge/Opera): Choose a folder on your computer. Data persists even if browser data is cleared. 
- **Browser Storage** (All browsers): Data stored in IndexedDB. Will be lost if you clear browser data.

You can change storage location anytime by clicking the **Change** button next to the storage badge in the History modal.

### Browser Compatibility

**File System Storage** (for analysis history): Chrome, Edge, Opera  
**Browser Storage** (fallback): All modern browsers (Firefox, Safari, Chrome, Edge)

## License

[MIT](LICENSE)
