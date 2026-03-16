import { NextRequest } from "next/server";
import {
  hasSavedGithubToken,
  saveGithubToken,
  clearGithubToken,
} from "@/lib/config-store";

const MIN_TOKEN_LEN = 10;
const MAX_TOKEN_LEN = 512;

function validateGithubToken(token: string): string | null {
  const t = token.trim();
  if (t.length < MIN_TOKEN_LEN) return `GitHub token too short (min ${MIN_TOKEN_LEN} characters)`;
  if (t.length > MAX_TOKEN_LEN) return `GitHub token too long (max ${MAX_TOKEN_LEN} characters)`;
  if (!/^[\x20-\x7E]*$/.test(t) || t.includes("\n") || t.includes("\r")) {
    return "GitHub token contains invalid characters";
  }
  return null;
}

export async function GET() {
  return Response.json({ configured: hasSavedGithubToken() });
}

export async function POST(req: NextRequest) {
  let data: Record<string, unknown>;
  try {
    data = (await req.json()) || {};
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = ((data.github_token as string) || "").trim();
  if (!token) {
    return Response.json({ error: "GitHub token is required" }, { status: 400 });
  }

  const err = validateGithubToken(token);
  if (err) {
    return Response.json({ error: err }, { status: 400 });
  }

  try {
    saveGithubToken(token);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not save GitHub token" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    clearGithubToken();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "An error occurred" }, { status: 500 });
  }
}
