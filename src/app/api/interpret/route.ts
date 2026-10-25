import { NextResponse } from "next/server";
import { interpretWithModel } from "../../../lib/acedia/llm";

/**
 * Server-side only: the API key and endpoint never reach the browser.
 * Configure with ACEDIA_LLM_BASE_URL, ACEDIA_LLM_MODEL and (optionally) ACEDIA_LLM_API_KEY.
 * If you deploy this publicly with a paid key, add rate limiting first.
 */
export async function POST(req: Request) {
  const baseUrl = process.env.ACEDIA_LLM_BASE_URL;
  const model = process.env.ACEDIA_LLM_MODEL;
  if (!baseUrl || !model) return NextResponse.json({ error: "not-configured" }, { status: 501 });

  let body: { text?: unknown; today?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : null;
  if (!text || text.length > 4000 || !today) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  const r = await interpretWithModel(text, { baseUrl, model, apiKey: process.env.ACEDIA_LLM_API_KEY }, today);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ obligations: r.obligations, warnings: r.warnings, model });
}
