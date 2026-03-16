import { NextRequest } from "next/server";
import { resolveGithubToken, handleAnalysisError } from "../lib";
import { getRepoPath, listCommits } from "@/lib/analyzer";
import {
  isGithubUrl,
  parseGithubUrl,
  listGithubCommits,
} from "@/lib/github-analyzer";

export async function POST(req: NextRequest) {
  let data: Record<string, unknown>;
  try {
    data = (await req.json()) || {};
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const repoPath = (data.repo_path as string) || ".";
  const search = ((data.search as string) || "").trim();
  const limit = Math.min(Math.max(Number(data.limit) || 80, 1), 200);

  try {
    let commits: Array<{ ref: string; short_ref: string; title: string; author: string; date: string }>;

    if (isGithubUrl(repoPath)) {
      const token = resolveGithubToken(data.github_token as string);
      const [owner, repo] = parseGithubUrl(repoPath);
      commits = await listGithubCommits(owner, repo, token, search, limit);
    } else {
      const resolvedPath = getRepoPath(repoPath);
      commits = await listCommits(resolvedPath, search, limit);
    }

    return Response.json({ commits, count: commits.length });
  } catch (e) {
    return handleAnalysisError(e);
  }
}
