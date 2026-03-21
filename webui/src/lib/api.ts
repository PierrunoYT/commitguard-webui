/**
 * API client for CommitGuard Next.js API routes.
 */
async function post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "Request failed");
  }
  return data as T;
}

async function get<T>(endpoint: string): Promise<T> {
  const res = await fetch(endpoint);
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "Request failed");
  }
  return data as T;
}

async function del<T>(endpoint: string): Promise<T> {
  const res = await fetch(endpoint, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "Request failed");
  }
  return data as T;
}

export const api = {
  analyze: (body: Record<string, unknown>) =>
    post<{ result: string; diff: string; diff_truncated?: boolean; short_ref?: string; title?: string; author?: string; date?: string }>("/api/analyze", body),

  analyzeRange: (body: Record<string, unknown>) =>
    post<{ results: Array<{ ref: string; short_ref: string; title: string; author?: string; date?: string; result: string; diff: string; diff_truncated?: boolean }> }>(
      "/api/analyze-range",
      body
    ),

  commits: (body: { repo_path?: string; github_token?: string; search?: string; limit?: number }) =>
    post<{ commits: Array<{ ref: string; short_ref: string; title: string; author: string; date: string }> }>(
      "/api/commits",
      body
    ),

  prs: (body: { repo_path: string; github_token?: string; state?: string; limit?: number }) =>
    post<{
      prs: Array<{
        number: number;
        title: string;
        author: string;
        state: string;
        draft: boolean;
        base: string;
        head: string;
        updated_at: string;
      }>;
    }>("/api/github/prs", body),

  analyzePr: (body: Record<string, unknown>) =>
    post<{ result: string; diff: string; diff_truncated?: boolean; pr_title: string; pr_number: number }>(
      "/api/github/analyze-pr",
      body
    ),

  check: (body: Record<string, unknown>) =>
    post<{ result: string; diff: string; diff_truncated?: boolean }>("/api/check", body),

  models: (body: { api_key?: string }) =>
    post<{ models: Array<{ id: string; name?: string }> }>("/api/models", body),

  settingsKey: {
    get: () => get<{ configured: boolean }>("/api/settings/key"),
    save: (body: { api_key: string }) => post<{ ok: boolean }>("/api/settings/key", body),
    clear: () => del<{ ok: boolean }>("/api/settings/key"),
  },

  settingsGithubToken: {
    get: () => get<{ configured: boolean }>("/api/settings/github-token"),
    save: (body: { github_token: string }) => post<{ ok: boolean }>("/api/settings/github-token", body),
    clear: () => del<{ ok: boolean }>("/api/settings/github-token"),
  },
};
