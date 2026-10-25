import { validateProposal, type ValidationResult } from "./parse";

export interface LlmConfig {
  /** Any OpenAI-compatible base URL, e.g. http://127.0.0.1:8080/v1 (llama.cpp, LM Studio) or a hosted provider. */
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
}

const prompt = (today: string) => `Today is ${today}. Read the user's notes and list the separate obligations as JSON:
{"obligations":[{"id":"o1","title":"short imperative title","sourceQuote":"words copied exactly from the notes","deadline":"YYYY-MM-DD","dependsOn":["o2"],"effort":"tiny|small|medium|large","irreversible":true,"firstStep":"...","doneWhen":"..."}]}
Rules:
- sourceQuote must be copied exactly from the notes. Every obligation needs one.
- Include deadline only if the notes state a date. Resolve it relative to today. Never guess.
- Include dependsOn only if the notes say one thing must happen before another.
- Leave out irreversible, effort, firstStep and doneWhen unless the notes support them.
- Output JSON only.`;

export function extractJson(content: string): unknown {
  const t = content.trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch { /* fall through */ } }
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new Error("Model did not return JSON.");
}

/**
 * Optional interpreter over an OpenAI-compatible /chat/completions endpoint.
 * Output is only a PROPOSAL: it is validated against the user's text and never decides priorities.
 */
export async function interpretWithModel(
  text: string,
  cfg: LlmConfig,
  today: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ValidationResult> {
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const base = {
    model: cfg.model,
    temperature: 0,
    messages: [
      { role: "system", content: prompt(today) },
      { role: "user", content: text },
    ],
  };
  const call = (body: object) =>
    fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(cfg.timeoutMs ?? 60_000) });
  try {
    let res = await call({ ...base, response_format: { type: "json_object" } });
    if (res.status === 400 || res.status === 422) res = await call(base); // some models/providers reject response_format
    if (!res.ok) return { ok: false, error: `Model server returned ${res.status}.` };
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { ok: false, error: "Unexpected model response shape." };
    return validateProposal(extractJson(content), text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Model unavailable." };
  }
}
