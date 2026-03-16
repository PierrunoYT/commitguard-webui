import { NextRequest } from "next/server";
import { resolveGithubToken, handleAnalysisError } from "../../lib";
import { isGithubUrl, parseGithubUrl, listGithubPrs } from "@/lib/github-analyzer";

export async function POST(req: NextRequest) {
  let data: Record<string, unknown>;
  try {
    data = (await req.json()) || {};
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const repoPath = (data.repo_path as string) || "";
  const state = (data.state as string) || "open";
  const limit = Math.min(Math.max(Number(data.limit) || 50, 1), 100);

  if (!repoPath || !isGithubUrl(repoPath)) {
    return Response.json({
      error: "A valid GitHub repository URL is required",
    }, { status: 400 });
  }

  if (!["open", "closed", "all"].includes(state)) {
    return Response.json({ error: "state must be open, closed, or all" }, { status: 400 });
  }

  try {
    const token = resolveGithubToken(data.github_token as string);
    const [owner, repo] = parseGithubUrl(repoPath);
    const prs = await listGithubPrs(owner, repo, token, state, limit);
    return Response.json({ prs, count: prs.length });
  } catch (e) {
    return handleAnalysisError(e);
  }
}
