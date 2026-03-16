import { NextRequest } from "next/server";
import {
  resolveApiKey,
  resolveGithubToken,
  truncateDiffForUi,
  resolveMaxDiffChars,
  resolveSystemPrompt,
  handleAnalysisError,
} from "../lib";
import { getRepoPath, analyzeCommitRange } from "@/lib/analyzer";
import {
  isGithubUrl,
  parseGithubUrl,
  analyzeGithubCommitRange,
} from "@/lib/github-analyzer";
import { redactDiff } from "@/lib/diff-redactor";

export async function POST(req: NextRequest) {
  let data: Record<string, unknown>;
  try {
    data = (await req.json()) || {};
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const repoPath = (data.repo_path as string) || ".";
  const revRange = ((data.range as string) || "").trim();
  const apiKey = resolveApiKey(data.api_key as string);
  const model = (data.model as string) || "openai/gpt-4o-mini";
  const maxCommits = Math.min(Math.max(Number(data.max_commits) || 20, 1), 50);
  const maxDiffChars = resolveMaxDiffChars(data.max_diff_chars);
  const systemPrompt = resolveSystemPrompt(data.system_prompt);
  const includeDiff = data.include_diff !== false;

  if (!apiKey) {
    return Response.json({ error: "OpenRouter API key required" }, { status: 400 });
  }
  if (!revRange) {
    return Response.json({
      error: "Commit range is required (example: HEAD~5..HEAD or base..head)",
    }, { status: 400 });
  }

  try {
    let analyses: Array<{ ref: string; short_ref: string; title: string; result: string; diff: string }>;

    if (isGithubUrl(repoPath)) {
      const token = resolveGithubToken(data.github_token as string);
      if (!revRange.includes("..")) {
        return Response.json({
          error: "For GitHub repos, range must be base..head (e.g. main..feature-branch)",
        }, { status: 400 });
      }
      const [base, head] = revRange.split("..", 2).map((s) => s.trim());
      if (!base || !head) {
        return Response.json({
          error: "Range must have both base and head (e.g. main..feature-branch)",
        }, { status: 400 });
      }
      const [owner, repo] = parseGithubUrl(repoPath);
      analyses = await analyzeGithubCommitRange(
        owner,
        repo,
        base,
        head,
        apiKey,
        model,
        token,
        maxCommits,
        maxDiffChars,
        systemPrompt
      );
    } else {
      const resolvedPath = getRepoPath(repoPath);
      analyses = await analyzeCommitRange(
        resolvedPath,
        revRange,
        apiKey,
        model,
        maxCommits,
        maxDiffChars,
        systemPrompt
      );
    }

    if (includeDiff) {
      for (const item of analyses) {
        const redacted = redactDiff(item.diff);
        const [truncated, truncatedFlag] = truncateDiffForUi(redacted);
        item.diff = truncated;
        (item as Record<string, unknown>).diff_truncated = truncatedFlag;
      }
    } else {
      for (const item of analyses) {
        item.diff = "";
        (item as Record<string, unknown>).diff_truncated = false;
      }
    }

    return Response.json({ results: analyses, count: analyses.length });
  } catch (e) {
    return handleAnalysisError(e);
  }
}
