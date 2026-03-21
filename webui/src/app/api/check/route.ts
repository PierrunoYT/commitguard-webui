import { NextRequest } from "next/server";
import {
  resolveApiKey,
  resolveModel,
  truncateDiffForUi,
  resolveMaxDiffChars,
  resolveSystemPrompt,
  handleAnalysisError,
} from "../lib";
import { getRepoPath, analyzeStaged } from "@/lib/analyzer";
import { isGithubUrl } from "@/lib/github-analyzer";
import { redactDiff } from "@/lib/diff-redactor";

export async function POST(req: NextRequest) {
  let data: Record<string, unknown>;
  try {
    data = (await req.json()) || {};
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const repoPath = (data.repo_path as string) || ".";
  const apiKey = resolveApiKey(data.api_key as string);
  const model = resolveModel(data.model);
  const maxDiffChars = resolveMaxDiffChars(data.max_diff_chars);
  const systemPrompt = resolveSystemPrompt(data.system_prompt);
  const includeDiff = data.include_diff !== false;

  if (!apiKey) {
    return Response.json({ error: "OpenRouter API key required" }, { status: 400 });
  }

  if (isGithubUrl(repoPath)) {
    return Response.json({
      error: "Pre-commit check is only available for local repositories",
    }, { status: 400 });
  }

  try {
    const resolvedPath = getRepoPath(repoPath);
    const { result, diff } = await analyzeStaged(
      resolvedPath,
      apiKey,
      model,
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
      });
    }
    return Response.json({ result, diff: "", diff_truncated: false });
  } catch (e) {
    return handleAnalysisError(e);
  }
}
