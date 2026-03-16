import { NextRequest } from "next/server";
import {
  hasSavedKey,
  saveApiKey,
  clearApiKey,
} from "@/lib/config-store";

const MIN_KEY_LEN = 20;
const MAX_KEY_LEN = 512;

function validateApiKey(key: string): string | null {
  const k = key.trim();
  if (k.length < MIN_KEY_LEN) return `API key too short (min ${MIN_KEY_LEN} characters)`;
  if (k.length > MAX_KEY_LEN) return `API key too long (max ${MAX_KEY_LEN} characters)`;
  if (!/^[\x20-\x7E]*$/.test(k) || k.includes("\n") || k.includes("\r")) {
    return "API key contains invalid characters";
  }
  return null;
}

export async function GET() {
  return Response.json({ configured: hasSavedKey() });
}

export async function POST(req: NextRequest) {
  let data: Record<string, unknown>;
  try {
    data = (await req.json()) || {};
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = ((data.api_key as string) || "").trim();
  if (!apiKey) {
    return Response.json({ error: "API key is required" }, { status: 400 });
  }

  const err = validateApiKey(apiKey);
  if (err) {
    return Response.json({ error: err }, { status: 400 });
  }

  try {
    saveApiKey(apiKey);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not save API key" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    clearApiKey();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "An error occurred" }, { status: 500 });
  }
}
