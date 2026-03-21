import { NextResponse } from "next/server";
import {
  loadApiKey,
  loadGithubToken,
} from "@/lib/config-store";
import {
  GitAnalysisError,
  AIAnalysisError,
  DiffTooLargeError,
} from "@/lib/analyzer";
import { GitHubError } from "@/lib/github-analyzer";
import { redactDiff } from "@/lib/diff-redactor";

const UI_DIFF_CHAR_LIMIT = 150_000;

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

// Legacy model IDs that need to be migrated
const LEGACY_MODEL_MAPPING: Record<string, string> = {
  "anthropic/claude-sonnet-4-5-latest": "anthropic/claude-sonnet-4.5",
  "anthropic/claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
};

export function resolveModel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return DEFAULT_MODEL;
  }
  
  const trimmed = value.trim();
  
  // Check if it's a legacy model ID and migrate it
  if (LEGACY_MODEL_MAPPING[trimmed]) {
    console.log(`[Model Migration] Converting "${trimmed}" to "${LEGACY_MODEL_MAPPING[trimmed]}"`);
    return LEGACY_MODEL_MAPPING[trimmed];
  }
  
  return trimmed;
}

export function resolveApiKey(provided?: string | null): string | null {
  const fromProvided = provided?.trim();
  if (fromProvided) return fromProvided;
  const key = loadApiKey();
  if (key?.trim()) return key.trim();
  const envKey = process.env.OPENROUTER_API_KEY?.trim();
  return envKey || null;
}

export function resolveGithubToken(provided?: string | null): string | null {
  if (provided?.trim()) return provided.trim();
  const token = loadGithubToken();
  if (token) return token;
  return process.env.GITHUB_TOKEN || null;
}

export function truncateDiffForUi(diff: string): [string, boolean] {
  if (diff.length <= UI_DIFF_CHAR_LIMIT) return [diff, false];
  return [
    diff.slice(0, UI_DIFF_CHAR_LIMIT) +
      "\n\n[Diff truncated for UI performance. Full patch omitted.]",
    true,
  ];
}

export function resolveMaxDiffChars(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string") {
    value = value.trim();
    if (!value) return null;
  }
  const parsed = parseInt(String(value), 10);
  if (isNaN(parsed) || parsed < 1) return null;
  return parsed;
}

export function resolveSystemPrompt(value: unknown): string | null {
  if (value == null || typeof value !== "string") return null;
  return value;
}

export function apiError(err: unknown, status: number): NextResponse {
  const message = err instanceof Error ? err.message : "Request failed";
  return NextResponse.json({ error: message }, { status });
}

export function handleAnalysisError(err: unknown): NextResponse {
  if (err instanceof GitAnalysisError || err instanceof GitHubError) {
    return apiError(err, 400);
  }
  if (err instanceof DiffTooLargeError) {
    return apiError(err, 413);
  }
  if (err instanceof AIAnalysisError) {
    return apiError(err, 502);
  }
  return apiError(err, 400);
}
