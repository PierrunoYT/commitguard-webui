# CommitGuard Web UI

Next.js full-stack app for AI-powered Git commit analysis.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm start
```

## Features

- OpenRouter API key and GitHub token management
- Local repo and GitHub URL support
- Commit browser with search and multi-select
- Analyze single commit, commit range, or selected commits
- Pull request browser (GitHub URLs only)
- Pre-commit check for staged changes (local repos only)
- Model selector with OpenRouter model list
- Markdown-rendered analysis results with diff display
