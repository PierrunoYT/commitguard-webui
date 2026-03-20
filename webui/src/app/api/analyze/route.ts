import { NextRequest } from "next/server";
import {
  resolveApiKey,
  resolveGithubToken,
  truncateDiffForUi,
  resolveMaxDiffChars,
  resolveSystemPrompt,
  handleAnalysisError,
} from "../lib";
import { getRepoPath, analyzeCommit } from "@/lib/analyzer";
import {
  isGithubUrl,
  parseGithubUrl,
  analyzeGithubCommit,
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
  const ref = (data.ref as string) || "HEAD";
  const apiKey = resolveApiKey(data.api_key as string);
  const model = (data.model as string) || "anthropic/claude-sonnet-4-5-latest";
  const maxDiffChars = resolveMaxDiffChars(data.max_diff_chars);
  const systemPrompt = resolveSystemPrompt(data.system_prompt);
  const includeDiff = data.include_diff !== false;

  if (!apiKey) {
    return Response.json({ error: "OpenRouter API key required" }, { status: 400 });
  }

  try {
    let result: string;
    let diff: string;

    if (isGithubUrl(repoPath)) {
      const token = resolveGithubToken(data.github_token as string);
      const [owner, repo] = parseGithubUrl(repoPath);
      const out = await analyzeGithubCommit(
        owner,
        repo,
        ref,
        apiKey,
        model,
        token,
        maxDiffChars,
        systemPrompt
      );
      result = out.result;
      diff = out.diff;
    } else {
      const resolvedPath = getRepoPath(repoPath);
      const out = await analyzeCommit(
        resolvedPath,
        ref,
        apiKey,
        model,
        maxDiffChars,
        systemPrompt
      );
      result = out.result;
      diff = out.diff;
    }

    if (includeDiff) {
      diff = redactDiff(diff);
      const [truncated, truncatedFlag] = truncateDiffForUi(diff);
      return Response.json({
        result,
        diff: truncated,
        diff_truncated: truncatedFlag,
      });
    }
    return Response.json({ result, diff: "", diff_truncated: false });
  } catch (e) {
    return handleAnalysisError(e);
  }
}
