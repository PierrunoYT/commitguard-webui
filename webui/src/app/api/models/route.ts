import { NextRequest } from "next/server";
import { resolveApiKey } from "../lib";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export async function POST(req: NextRequest) {
  let data: Record<string, unknown>;
  try {
    data = (await req.json()) || {};
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = resolveApiKey(data.api_key as string);

  if (!apiKey) {
    return Response.json({ error: "OpenRouter API key required" }, { status: 400 });
  }

  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const err = await res.text();
      let msg = err;
      try {
        const parsed = JSON.parse(err);
        msg = parsed.error?.message || err;
      } catch {}
      return Response.json({ error: msg }, { status: 400 });
    }

    const body = (await res.json()) as { data?: Array<{ id?: string; name?: string }> };
    const models = (body.data || [])
      .filter((m) => m.id)
      .map((m) => ({ id: m.id, name: m.name || m.id }));

    return Response.json({ models });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to fetch models" },
      { status: 400 }
    );
  }
}
