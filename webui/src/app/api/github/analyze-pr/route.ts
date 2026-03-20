import { NextRequest } from "next/server";
import {
  resolveApiKey,
  resolveGithubToken,
  truncateDiffForUi,
  resolveMaxDiffChars,
  resolveSystemPrompt,
  handleAnalysisError,
} from "../../lib";
import { parseGithubUrl, analyzeGithubPr, isGithubUrl } from "@/lib/github-analyzer";
import { redactDiff } from "@/lib/diff-redactor";

export async function POST(req: NextRequest) {
  let data: Record<string, unknown>;
  try {
    data = (await req.json()) || {};
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const repoPath = (data.repo_path as string) || "";
  const prNumberRaw = data.pr_number;
  const apiKey = resolveApiKey(data.api_key as string);
  const model = (data.model as string) || "anthropic/claude-sonnet-4-5-latest";
  const maxDiffChars = resolveMaxDiffChars(data.max_diff_chars);
  const systemPrompt = resolveSystemPrompt(data.system_prompt);
  const includeDiff = data.include_diff !== false;

  if (!apiKey) {
    return Response.json({ error: "OpenRouter API key required" }, { status: 400 });
  }
  if (!repoPath || !isGithubUrl(repoPath)) {
    return Response.json({
      error: "A valid GitHub repository URL is required",
    }, { status: 400 });
  }
  if (prNumberRaw == null) {
    return Response.json({ error: "pr_number is required" }, { status: 400 });
  }

  const prNumber = parseInt(String(prNumberRaw), 10);
  if (isNaN(prNumber) || prNumber < 1) {
    return Response.json({ error: "pr_number must be a positive integer" }, { status: 400 });
  }

  try {
    const token = resolveGithubToken(data.github_token as string);
    const [owner, repo] = parseGithubUrl(repoPath);
    const { result, diff, prTitle } = await analyzeGithubPr(
      owner,
      repo,
      prNumber,
      apiKey,
      model,
      token,
      maxDiffChars,
      systemPrompt
    );

    if (includeDiff) {
      const redacted = redactDiff(diff);
      const [truncated, truncatedFlag] = truncateDiffForUi(redacted);
      return Response.json({
        result,
        diff: truncated,
        diff_truncated: truncatedFlag,
        pr_title: prTitle,
        pr_number: prNumber,
      });
    }
    return Response.json({
      result,
      diff: "",
      diff_truncated: false,
      pr_title: prTitle,
      pr_number: prNumber,
    });
  } catch (e) {
    return handleAnalysisError(e);
  }
}
