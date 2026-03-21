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
  const model = (data.model as string) || "anthropic/claude-sonnet-4.5";
  const maxDiffChars = resolveMaxDiffChars(data.max_diff_chars);
  const systemPrompt = resolveSystemPrompt(data.system_prompt);
  const includeDiff = data.include_diff !== false;

  if (!apiKey) {
    return Response.json({ error: "OpenRouter API key required" }, { status: 400 });
  }

  try {
    let out: { result: string; diff: string; short_ref: string; title: string; author: string; date: string };

    if (isGithubUrl(repoPath)) {
      const token = resolveGithubToken(data.github_token as string);
      const [owner, repo] = parseGithubUrl(repoPath);
      const ghOut = await analyzeGithubCommit(
        owner,
        repo,
        ref,
        apiKey,
        model,
        token,
        maxDiffChars,
        systemPrompt
      );
      out = {
        result: ghOut.result,
        diff: ghOut.diff,
        short_ref: ghOut.short_ref || ref.slice(0, 8),
        title: ghOut.title || "",
        author: ghOut.author || "",
        date: ghOut.date || "",
      };
    } else {
      const resolvedPath = getRepoPath(repoPath);
      out = await analyzeCommit(
        resolvedPath,
        ref,
        apiKey,
        model,
        maxDiffChars,
        systemPrompt
      );
    }

    const meta = { short_ref: out.short_ref, title: out.title, author: out.author, date: out.date };

    if (includeDiff) {
      const redacted = redactDiff(out.diff);
      const [truncated, truncatedFlag] = truncateDiffForUi(redacted);
      return Response.json({ result: out.result, diff: truncated, diff_truncated: truncatedFlag, ...meta });
    }
    return Response.json({ result: out.result, diff: "", diff_truncated: false, ...meta });
  } catch (e) {
    return handleAnalysisError(e);
  }
}
