# CommitGuard Web UI (Next.js)

Next.js frontend for CommitGuard, ported from the Flask/HTML template.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the **Flask backend** (from the project root):

```bash
cd ..
python -m flask --app app run
# or: python app.py
```

The Flask app runs on `http://localhost:5000` and provides the `/api/*` endpoints.

3. Start the Next.js dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). API requests are proxied to the Flask backend via `next.config.ts` rewrites.

## Configuration

- **NEXT_PUBLIC_API_URL**: When the Flask backend runs on a different URL, set this (e.g. `http://localhost:5000`). Defaults to `http://localhost:5000` for rewrites.

## Features

- OpenRouter API key and GitHub token management
- Local repo and GitHub URL support
- Commit browser with search and multi-select
- Analyze single commit, commit range, or selected commits
- Pull request browser (GitHub URLs only)
- Pre-commit check for staged changes (local repos only)
- Model selector with OpenRouter model list
- Markdown-rendered analysis results with diff display
