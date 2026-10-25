import type { Effort, Obligation } from "./types";

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EFFORTS: Effort[] = ["tiny", "small", "medium", "large"];
const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const M = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\.?";
const PRE = "\\b(?:by|due(?:\\s+on)?|before|until)\\s+(?:the\\s+)?";
const RE_ISO = new RegExp(`${PRE}(\\d{4}-\\d{2}-\\d{2})\\b`, "i");
const RE_DM = new RegExp(`${PRE}(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${M}(?=\\W|$)`, "i");
const RE_MD = new RegExp(`${PRE}${M}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i");

const validDate = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

function build(day: number, month: number, today: Date): string | undefined {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let y = today.getUTCFullYear();
  if (Date.UTC(y, month - 1, day) < t - 180 * DAY) y += 1; // far in the past => next year; recent past stays (overdue)
  const iso = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return validDate(iso) ? iso : undefined;
}

function extractDeadline(sentence: string, today: Date): { deadline?: string; rest: string } {
  let m = sentence.match(RE_ISO);
  if (m && validDate(m[1])) return { deadline: m[1], rest: sentence.replace(m[0], "") };
  m = sentence.match(RE_DM);
  if (m) {
    const d = build(Number(m[1]), MONTHS[m[2].toLowerCase()], today);
    if (d) return { deadline: d, rest: sentence.replace(m[0], "") };
  }
  m = sentence.match(RE_MD);
  if (m) {
    const d = build(Number(m[2]), MONTHS[m[1].toLowerCase()], today);
    if (d) return { deadline: d, rest: sentence.replace(m[0], "") };
  }
  return { rest: sentence };
}

/**
 * No-model fallback. One obligation per line or sentence.
 * Understands "by 2026-10-30", "by 30 October", "by October 30" and "after X and Y".
 * It does NOT understand "Friday", "next week", or implicit dependencies: use a model for prose.
 */
export function parseText(text: string, today: Date): Obligation[] {
  const items: Obligation[] = [];
  const deps: string[][] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim().replace(/^([-*•]|\d+[.)])\s+/, "");
    if (!line) continue;
    for (const sentence of line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)) {
      const quote = sentence.trim().replace(/[\s]+$/, "");
      if (!quote) continue;
      const { deadline, rest } = extractDeadline(quote, today);
      let names: string[] = [];
      let body = rest;
      const a = body.match(/\b(?:after|needs|depends on)\s+(.+)$/i);
      if (a) {
        names = a[1].split(/,|\band\b/i).map((s) => s.replace(/[.!?]+$/, "").trim()).filter(Boolean);
        body = body.replace(a[0], "");
      }
      const title = body.replace(/[\s,;.!?]+$/, "").replace(/\s{2,}/g, " ").trim();
      if (!title) continue;
      items.push({ id: `o${items.length + 1}`, title, deadline, dependsOn: [], sourceQuote: quote });
      deps.push(names);
    }
  }
  items.forEach((o, i) => {
    o.dependsOn = deps[i].map((n) => {
      const hit = items.find((p) => p !== o && p.title.toLowerCase().includes(n.toLowerCase()));
      return hit ? hit.id : `unresolved:${n}`;
    });
  });
  return items;
}

export type ValidationResult =
  | { ok: true; obligations: Obligation[]; warnings: string[] }
  | { ok: false; error: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Validates untrusted (model) output against the user's original text.
 * Copies only known fields. Rejects malformed structure rather than repairing it.
 * A deadline survives only if its sourceQuote really occurs in the user's text.
 */
export function validateProposal(raw: unknown, sourceText: string): ValidationResult {
  const list = Array.isArray(raw) ? raw : (raw as { obligations?: unknown } | null)?.obligations;
  if (!Array.isArray(list)) return { ok: false, error: "Expected an array of obligations." };
  if (list.length === 0 || list.length > 30) return { ok: false, error: "Expected between 1 and 30 obligations." };
  const haystack = norm(sourceText);
  const warnings: string[] = [];
  const out: Obligation[] = [];
  for (const r of list) {
    if (typeof r !== "object" || r === null) return { ok: false, error: "Obligation is not an object." };
    const o = r as Record<string, unknown>;
    const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : undefined);
    const id = str(o.id, 40);
    const title = str(o.title);
    if (!id || !title) return { ok: false, error: "Each obligation needs a short id and title." };
    if (out.some((p) => p.id === id)) return { ok: false, error: `Duplicate id "${id}".` };

    let deadline: string | undefined;
    if (o.deadline != null) {
      if (typeof o.deadline !== "string" || !validDate(o.deadline)) return { ok: false, error: `Bad deadline on "${title}".` };
      deadline = o.deadline;
    }
    let sourceQuote = str(o.sourceQuote, 400);
    if (sourceQuote && !haystack.includes(norm(sourceQuote))) {
      warnings.push(`Dropped an unverifiable quote for "${title}".`);
      sourceQuote = undefined;
    }
    if (deadline && !sourceQuote) {
      warnings.push(`Dropped the deadline for "${title}": no verified quote supports it.`);
      deadline = undefined;
    }
    let effort: Effort | undefined;
    if (o.effort != null) {
      if (!EFFORTS.includes(o.effort as Effort)) return { ok: false, error: `Bad effort on "${title}".` };
      effort = o.effort as Effort;
    }
    const dependsOn = o.dependsOn ?? [];
    if (!Array.isArray(dependsOn) || dependsOn.some((d) => typeof d !== "string")) return { ok: false, error: `Bad dependsOn on "${title}".` };
    out.push({
      id, title, deadline, effort, sourceQuote,
      dependsOn: dependsOn as string[],
      irreversible: o.irreversible === true ? true : undefined,
      firstStep: str(o.firstStep),
      doneWhen: str(o.doneWhen),
    });
  }
  const ids = new Set(out.map((o) => o.id));
  for (const o of out) for (const d of o.dependsOn) if (!ids.has(d)) return { ok: false, error: `"${o.title}" depends on unknown id "${d}".` };
  return { ok: true, obligations: out, warnings };
}
