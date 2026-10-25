import { NextResponse } from "next/server";
import { interpretWithModel } from "../../../lib/acedia/llm";
import { checkRateLimit, getClientIp } from "@/lib/acedia/rate-limit";

/**
 * Server-side only: the API key and endpoint never reach the browser.
 * Configure with ACEDIA_LLM_BASE_URL, ACEDIA_LLM_MODEL and (optionally) ACEDIA_LLM_API_KEY.
 * If you deploy this publicly with a paid key, add rate limiting first.
 */
export async function POST(req: Request) {
  // Rate limiting: 10 requests per minute per IP (stricter for debug endpoint)
  const RATE_LIMIT = 10;
  const RATE_WINDOW_MS = 60_000;
  const ip = getClientIp(req);
  const { allowed, remaining, resetAt } = checkRateLimit(ip, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate-limited", message: "Too many requests. Please wait." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) } }
    );
  }

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
  return NextResponse.json(
    { obligations: r.obligations, warnings: r.warnings, model },
    { headers: { "X-RateLimit-Limit": String(RATE_LIMIT), "X-RateLimit-Remaining": String(remaining), "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)) } }
  );
}
