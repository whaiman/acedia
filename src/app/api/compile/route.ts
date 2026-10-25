import { NextResponse } from "next/server";
import { parseText } from "@/lib/acedia/parse";
import { interpretWithModel } from "@/lib/acedia/llm";
import { recommend } from "@/lib/acedia/engine";
import { validateObligations } from "@/lib/acedia/validate";
import { checkRateLimit } from "@/lib/acedia/rate-limit";
import type { Result, Obligation } from "@/lib/acedia/types";

function getLlmConfig() {
  const baseUrl = process.env.ACEDIA_LLM_BASE_URL;
  const model = process.env.ACEDIA_LLM_MODEL;
  const apiKey = process.env.ACEDIA_LLM_API_KEY || undefined;
  const timeoutMs = Number(process.env.ACEDIA_LLM_TIMEOUT_MS) || 120_000;
  if (!baseUrl || !model) return null;
  return { baseUrl, model, apiKey, timeoutMs };
}

// Rate limit: 30 requests per minute per IP (demo-friendly)
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function getClientIp(req: Request): string {
  // In production behind a proxy, use x-forwarded-for
  // For demo, fall back to a default
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export async function POST(req: Request) {
  // Rate limiting
  const ip = getClientIp(req);
  const { allowed, remaining, resetAt } = checkRateLimit(ip, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate-limited", message: "Too many requests. Please wait." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: { text?: unknown; obligations?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4000) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const llmCfg = getLlmConfig();
  let obligations: Obligation[];
  let warnings: string[] = [];
  let usedModel = false;
  let modelName: string | undefined;

  // If obligations are provided (e.g., from markDone), validate them strictly
  if (Array.isArray(body.obligations) && body.obligations.length > 0) {
    const validated = validateObligations(body.obligations);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    obligations = validated.obligations;
    warnings = validated.warnings;
  } else if (llmCfg) {
    modelName = llmCfg.model;
    const r = await interpretWithModel(text, llmCfg, todayIso);
    if (r.ok) {
      obligations = r.obligations;
      warnings = r.warnings ?? [];
      usedModel = true;
    } else {
      warnings.push(`Model failed: ${r.error}. Falling back to rule-based parser.`);
      obligations = parseText(text, today);
      modelName = undefined;
    }
  } else {
    obligations = parseText(text, today);
  }

  const result: Result = recommend(obligations, today);

  return NextResponse.json(
    {
      obligations,
      result,
      today: todayIso,
      usedModel,
      warnings,
      model: modelName,
    },
    {
      headers: {
        "X-RateLimit-Limit": String(RATE_LIMIT),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
      },
    }
  );
}