const GITHUB_API_BASE = "https://api.github.com";

export class GitHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubError";
  }
}

export function isGithubUrl(url: string): boolean {
  if (!url?.trim()) return false;
  const u = url.trim();
  return /^https?:\/\/github\.com\/[\w.\-]+\/[\w.\-]+/.test(u) || /^git@github\.com:[\w.\-]+\/[\w.\-]+/.test(u);
}

export function parseGithubUrl(url: string): [string, string] {
  const u = url.trim().replace(/\/$/, "");
  let m = u.match(/^https?:\/\/github\.com\/([\w.\-]+)\/([\w.\-]+?)(?:\.git)?$/);
  if (m) return [m[1], m[2]];
  m = u.match(/^git@github\.com:([\w.\-]+)\/([\w.\-]+?)(?:\.git)?$/);
  if (m) return [m[1], m[2]];
  throw new Error(`Could not parse GitHub URL: ${url}`);
}

async function githubRequest(
  path: string,
  token?: string | null,
  accept = "application/vnd.github+json"
): Promise<Response> {
  const res = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: {
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CommitGuard/1.0",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    let msg = body;
    try {
      const data = JSON.parse(body);
      msg = data.message || body;
    } catch {}
    if (res.status === 401) throw new GitHubError(`GitHub authentication failed: ${msg}`);
    if (res.status === 403) throw new GitHubError(`GitHub access forbidden (rate limit or private repo): ${msg}`);
    if (res.status === 404) throw new GitHubError(`GitHub resource not found: ${msg}`);
    throw new GitHubError(`GitHub API error ${res.status}: ${msg}`);
  }
  return res;
}

export async function listGithubCommits(
  owner: string,
  repo: string,
  token?: string | null,
  search = "",
  limit = 80
): Promise<Array<{ ref: string; short_ref: string; title: string; author: string; date: string }>> {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const res = await githubRequest(`/repos/${owner}/${repo}/commits?per_page=${safeLimit}`, token);
  const commitsData = (await res.json()) as Array<{
    sha: string;
    commit: { message?: string; author?: { name?: string; date?: string } };
  }>;

  const term = search.trim().toLowerCase();
  const commits: Array<{ ref: string; short_ref: string; title: string; author: string; date: string }> = [];

  for (const item of commitsData) {
    const sha = item.sha || "";
    const message = (item.commit?.message || "").trim();
    const title = message ? message.split("\n")[0] : sha.slice(0, 8);
    const authorName = (item.commit?.author?.name || "").trim() || "Unknown author";
    const committedAt = item.commit?.author?.date || "";

    if (term) {
      const haystack = `${sha}\n${title}\n${authorName}\n${message}`.toLowerCase();
      if (!haystack.includes(term)) continue;
    }

    commits.push({
      ref: sha,
      short_ref: sha.slice(0, 8),
      title: title || sha.slice(0, 8),
      author: authorName,
      date: committedAt,
    });
    if (commits.length >= safeLimit) break;
  }
  return commits;
}

export async function fetchGithubCommitDiff(
  owner: string,
  repo: string,
  sha: string,
  token?: string | null
): Promise<[string, string, string[]]> {
  const res = await githubRequest(`/repos/${owner}/${repo}/commits/${sha}`, token);
  const data = (await res.json()) as { commit?: { message?: string }; files?: Array<{ filename?: string }> };
  const message = (data.commit?.message || "").trim() || sha.slice(0, 8);
  const files = (data.files || []).map((f) => f.filename || "").filter(Boolean);

  const diffRes = await githubRequest(
    `/repos/${owner}/${repo}/commits/${sha}`,
    token,
    "application/vnd.github.v3.diff"
  );
  const diffText = await diffRes.text();
  return [diffText, message, files];
}

export async function analyzeGithubCommit(
  owner: string,
  repo: string,
  sha: string,
  apiKey: string,
  model: string,
  token?: string | null,
  maxDiffChars?: number | string | null,
  systemPrompt?: string | null
): Promise<{ result: string; diff: string; short_ref: string; title: string; author: string; date: string }> {
  const { callAi, validateDiffSize } = await import("./analyzer");
  const [diff, message, files] = await fetchGithubCommitDiff(owner, repo, sha, token);
  validateDiffSize(diff, `commit ${sha.slice(0, 8)}`, maxDiffChars);
  const result = await callAi(diff, message, files, apiKey, model, systemPrompt);
  const title = message.split("\n")[0] || sha.slice(0, 8);
  return { result, diff, short_ref: sha.slice(0, 8), title, author: "", date: "" };
}

export async function analyzeGithubCommitRange(
  owner: string,
  repo: string,
  base: string,
  head: string,
  apiKey: string,
  model: string,
  token?: string | null,
  maxCommits = 20,
  maxDiffChars?: number | string | null,
  systemPrompt?: string | null
): Promise<Array<{ ref: string; short_ref: string; title: string; author: string; date: string; result: string; diff: string }>> {
  const { callAi, AIAnalysisError, DiffTooLargeError } = await import("./analyzer");
  const res = await githubRequest(`/repos/${owner}/${repo}/compare/${base}...${head}`, token);
  const data = (await res.json()) as { commits?: Array<{ sha?: string; commit?: { message?: string; author?: { date?: string; name?: string } }; author?: { login?: string } }> };
  const commits = (data.commits || []).slice(0, maxCommits).reverse();
  if (!commits.length) throw new GitHubError(`No commits found between '${base}' and '${head}'`);

  const analyses: Array<{ ref: string; short_ref: string; title: string; author: string; date: string; result: string; diff: string }> = [];
  for (const item of commits) {
    const sha = item.sha || "";
    const title = (item.commit?.message || "").split("\n")[0] || sha.slice(0, 8);
    const author = item.commit?.author?.name || item.author?.login || "";
    const date = item.commit?.author?.date || "";
    try {
      const { result, diff } = await analyzeGithubCommit(
        owner,
        repo,
        sha,
        apiKey,
        model,
        token,
        maxDiffChars,
        systemPrompt
      );
      analyses.push({ ref: sha, short_ref: sha.slice(0, 8), title, author, date, result, diff });
    } catch (e) {
      if (e instanceof DiffTooLargeError) {
        throw new DiffTooLargeError(`Commit ${sha.slice(0, 8)} cannot be analyzed: ${e}`);
      }
      throw new AIAnalysisError(`AI analysis failed for commit ${sha.slice(0, 8)}: ${e}`);
    }
  }
  return analyses;
}

export async function analyzeGithubPr(
  owner: string,
  repo: string,
  prNumber: number,
  apiKey: string,
  model: string,
  token?: string | null,
  maxDiffChars?: number | string | null,
  systemPrompt?: string | null
): Promise<{ result: string; diff: string; prTitle: string }> {
  const { callAi, validateDiffSize } = await import("./analyzer");
  const res = await githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}`, token);
  const prData = (await res.json()) as { title?: string };
  const prTitle = (prData.title || "").trim() || `PR #${prNumber}`;

  const diffRes = await githubRequest(
    `/repos/${owner}/${repo}/pulls/${prNumber}`,
    token,
    "application/vnd.github.v3.diff"
  );
  const diff = await diffRes.text();

  let files: string[] = [];
  try {
    const filesRes = await githubRequest(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
      token
    );
    const filesData = (await filesRes.json()) as Array<{ filename?: string }>;
    files = filesData.map((f) => f.filename || "").filter(Boolean);
  } catch {
    // ignore
  }

  validateDiffSize(diff, `PR #${prNumber}`, maxDiffChars);
  const result = await callAi(diff, `PR #${prNumber}: ${prTitle}`, files, apiKey, model, systemPrompt);
  return { result, diff, prTitle };
}

export async function listGithubPrs(
  owner: string,
  repo: string,
  token?: string | null,
  state = "open",
  limit = 50
): Promise<
  Array<{
    number: number;
    title: string;
    author: string;
    state: string;
    draft: boolean;
    base: string;
    head: string;
    updated_at: string;
  }>
> {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const res = await githubRequest(
    `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${safeLimit}&sort=updated&direction=desc`,
    token
  );
  const prsData = (await res.json()) as Array<{
    number: number;
    title?: string;
    user?: { login?: string };
    state?: string;
    draft?: boolean;
    base?: { ref?: string };
    head?: { ref?: string };
    updated_at?: string;
  }>;

  return prsData.map((pr) => ({
    number: pr.number,
    title: (pr.title || "").trim(),
    author: (pr.user?.login || "").trim(),
    state: pr.state || "",
    draft: pr.draft || false,
    base: (pr.base?.ref || "").trim(),
    head: (pr.head?.ref || "").trim(),
    updated_at: pr.updated_at || "",
  }));
}
