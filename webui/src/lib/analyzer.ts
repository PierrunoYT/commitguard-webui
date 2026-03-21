import fs from "fs";
import path from "path";
import simpleGit, { SimpleGit } from "simple-git";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MAX_DIFF_CHARS = 50_000;
const MAX_SYSTEM_PROMPT_CHARS = 20_000;
const DEFAULT_SYSTEM_PROMPT = `You are a code review assistant. Analyze Git commits for:
1. Potential bugs and logic errors
2. Security vulnerabilities
3. Code quality issues
4. Missing error handling or validation
5. Performance concerns

Respond in markdown. Be concise. If nothing concerning is found, say "No issues detected."
`;

export class GitAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitAnalysisError";
  }
}

export class AIAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIAnalysisError";
  }
}

export class DiffTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiffTooLargeError";
  }
}

function resolveMaxDiffChars(value: number | string | null | undefined): number {
  if (value == null) return DEFAULT_MAX_DIFF_CHARS;
  const parsed = parseInt(String(value), 10);
  if (isNaN(parsed) || parsed < 1) {
    throw new DiffTooLargeError("Invalid max diff size. Use a positive integer for max diff characters.");
  }
  return parsed;
}

function resolveSystemPrompt(prompt: string | null | undefined): string {
  if (!prompt?.trim()) return DEFAULT_SYSTEM_PROMPT;
  const normalized = prompt.trim();
  if (normalized.length > MAX_SYSTEM_PROMPT_CHARS) {
    throw new AIAnalysisError(
      `System prompt is too long (${normalized.length.toLocaleString()} chars). Max allowed is ${MAX_SYSTEM_PROMPT_CHARS.toLocaleString()}.`
    );
  }
  return normalized;
}

export function validateDiffSize(
  diff: string,
  context: string,
  maxDiffChars?: number | string | null
): void {
  const limit = resolveMaxDiffChars(maxDiffChars);
  if (diff.length > limit) {
    const estimated = Math.ceil(diff.length / 4);
    throw new DiffTooLargeError(
      `Diff for ${context} is too large to analyze safely (${diff.length.toLocaleString()} chars, ~${estimated.toLocaleString()} tokens). Limit is ${limit.toLocaleString()} chars. Try a smaller commit/range or increase COMMITGUARD_MAX_DIFF deliberately.`
    );
  }
}

export async function callAi(
  diff: string,
  message: string,
  files: string[],
  apiKey: string,
  model: string,
  systemPrompt?: string | null
): Promise<string> {
  const effectivePrompt = resolveSystemPrompt(systemPrompt);
  const userContent = `Analyze this commit:

**Message:** ${message}
**Files:** ${files.length ? files.join(", ") : "N/A"}

**Diff:**
\`\`\`
${diff || "(no diff)"}
\`\`\`
`;

  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new AIAnalysisError("OpenRouter API key is empty. Enter your key in the header and click Save, or set OPENROUTER_API_KEY.");
  }

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${trimmedKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: effectivePrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401) {
      throw new AIAnalysisError(
        "OpenRouter API key invalid or missing. Enter your key (sk-or-...) in the header, click Save, then try again. Get a key at https://openrouter.ai/keys"
      );
    }
    throw new AIAnalysisError(`OpenRouter API error: ${err}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || "No response.";
}

export function getRepoPath(repoPath: string | null | undefined): string {
  const resolved = path.resolve(repoPath || ".");
  const gitDir = path.join(resolved, ".git");
  if (!fs.existsSync(gitDir)) {
    throw new Error(`Not a Git repository: ${resolved}`);
  }
  return resolved;
}

export async function analyzeCommit(
  repoPath: string,
  ref: string,
  apiKey: string,
  model: string,
  maxDiffChars?: number | string | null,
  systemPrompt?: string | null
): Promise<{ result: string; diff: string; short_ref: string; title: string; author: string; date: string }> {
  const git: SimpleGit = simpleGit(repoPath);
  let hash: string;
  try {
    hash = (await git.revparse([ref])).trim();
  } catch (e) {
    throw new GitAnalysisError(`Could not read commit '${ref}': ${e}`);
  }

  let diff: string;
  try {
    diff = await git.raw(["show", hash, "--format=", "-p", "--no-color"]);
  } catch (e) {
    throw new GitAnalysisError(`Could not get diff for '${ref}': ${e}`);
  }

  validateDiffSize(diff, `commit ${hash.slice(0, 8)}`, maxDiffChars);

  const log = await git.log({ from: ref, maxCount: 1 });
  const message = log.latest?.message || hash.slice(0, 8);
  const title = message.split("\n")[0] || hash.slice(0, 8);
  const author = (log.latest?.author_name || "").trim() || "Unknown";
  const date = log.latest?.date || "";
  const files: string[] = [];
  try {
    const diffSummary = await git.diffSummary([`${hash}^`, hash]);
    for (const f of diffSummary.files) {
      if (f.file) files.push(f.file);
    }
  } catch {
    // Root commit or no parents - parse files from diff header
    const fileMatch = diff.match(/^diff --git a\/(.+?) b\//gm);
    if (fileMatch) {
      for (const m of fileMatch) {
        const name = m.replace(/^diff --git a\/(.+?) b\/.*/, "$1");
        if (name) files.push(name);
      }
    }
  }

  try {
    const result = await callAi(diff, message, files, apiKey, model, systemPrompt);
    return { result, diff, short_ref: hash.slice(0, 8), title, author, date };
  } catch (e) {
    if (e instanceof DiffTooLargeError) throw e;
    throw new AIAnalysisError(`AI analysis failed: ${e}`);
  }
}

export async function analyzeCommitRange(
  repoPath: string,
  revRange: string,
  apiKey: string,
  model: string,
  maxCommits: number,
  maxDiffChars?: number | string | null,
  systemPrompt?: string | null
): Promise<Array<{ ref: string; short_ref: string; title: string; author: string; date: string; result: string; diff: string }>> {
  const git: SimpleGit = simpleGit(repoPath);
  let commits: string[];
  try {
    // Use array syntax to pass the range directly to git log
    const log = await git.log([revRange, "--max-count", String(maxCommits)]);
    commits = log.all.map((c) => c.hash);
    if (!commits.length) {
      throw new GitAnalysisError(`No commits found in range '${revRange}'`);
    }
  } catch (e) {
    if (e instanceof GitAnalysisError) throw e;
    throw new GitAnalysisError(`Could not read commit range '${revRange}': ${e}`);
  }

  const analyses: Array<{ ref: string; short_ref: string; title: string; author: string; date: string; result: string; diff: string }> = [];
  for (const hash of commits) {
    try {
      const { result, diff, title, author, date } = await analyzeCommit(
        repoPath,
        hash,
        apiKey,
        model,
        maxDiffChars,
        systemPrompt
      );
      analyses.push({
        ref: hash,
        short_ref: hash.slice(0, 8),
        title,
        author,
        date,
        result,
        diff,
      });
    } catch (e) {
      if (e instanceof DiffTooLargeError) {
        throw new DiffTooLargeError(`Commit ${hash.slice(0, 8)} cannot be analyzed: ${e}`);
      }
      throw new AIAnalysisError(`AI analysis failed for commit ${hash.slice(0, 8)}: ${e}`);
    }
  }
  return analyses;
}

export async function analyzeStaged(
  repoPath: string,
  apiKey: string,
  model: string,
  maxDiffChars?: number | string | null,
  systemPrompt?: string | null
): Promise<{ result: string; diff: string }> {
  const git: SimpleGit = simpleGit(repoPath);
  let diff: string;
  let files: string[] = [];
  try {
    diff = await git.diff(["--cached"]);
    if (!diff.trim()) {
      return { result: "No staged changes to analyze.", diff: "" };
    }
    validateDiffSize(diff, "staged changes", maxDiffChars);

    const status = await git.status();
    files = [...(status.staged || [])];
  } catch (e) {
    throw new GitAnalysisError(`Could not read staged changes: ${e}`);
  }

  try {
    const result = await callAi(diff, "(staged changes)", files, apiKey, model, systemPrompt);
    return { result, diff };
  } catch (e) {
    if (e instanceof DiffTooLargeError) throw e;
    throw new AIAnalysisError(`AI analysis failed: ${e}`);
  }
}

export async function listCommits(
  repoPath: string,
  search: string,
  limit: number
): Promise<Array<{ ref: string; short_ref: string; title: string; author: string; date: string }>> {
  const git: SimpleGit = simpleGit(repoPath);
  const term = search.trim().toLowerCase();
  const safeLimit = Math.max(1, limit);
  const maxCount = term ? Math.max(200, safeLimit * 20) : safeLimit;

  const log = await git.log({ maxCount });
  const commits: Array<{ ref: string; short_ref: string; title: string; author: string; date: string }> = [];

  for (const c of log.all) {
    const title = c.message?.split("\n")[0] || c.hash.slice(0, 8);
    const author = (c.author_name || "").trim() || "Unknown author";
    const message = (c.message || "").trim();

    if (term) {
      const haystack = `${c.hash}\n${title}\n${author}\n${message}`.toLowerCase();
      if (!haystack.includes(term)) continue;
    }

    commits.push({
      ref: c.hash,
      short_ref: c.hash.slice(0, 8),
      title,
      author,
      date: c.date || "",
    });

    if (commits.length >= safeLimit) break;
  }

  return commits;
}
