import type { Obligation } from "./types";
import { nextObligationId } from "./ids";
import { validateObligationStructure, validDate } from "./validate-shared";

const DAY = 86_400_000;
const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const M = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\.?";
const PRE = "\\b(?:by|due(?:\\s+on)?)\\s+(?:the\\s+)?";
const RE_ISO = new RegExp(`${PRE}(\\d{4}-\\d{2}-\\d{2})\\b`, "i");
const RE_DM = new RegExp(`${PRE}(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${M}(?=\\W|$)`, "i");
const RE_MD = new RegExp(`${PRE}${M}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i");

function build(day: number, month: number, today: Date): string | undefined {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  let y = today.getUTCFullYear();
  if (Date.UTC(y, month - 1, day) < t - 180 * DAY) y += 1; // far in the past => next year; recent past stays (overdue)
  const iso = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return validDate(iso) ? iso : undefined;
}

function extractDeadline(sentence: string, today: Date): { deadline?: string; matched?: string } {
  let m = sentence.match(RE_ISO);
  if (m && validDate(m[1])) return { deadline: m[1], matched: m[0] };
  m = sentence.match(RE_DM);
  if (m) {
    const d = build(Number(m[1]), MONTHS[m[2].toLowerCase()], today);
    if (d) return { deadline: d, matched: m[0] };
  }
  m = sentence.match(RE_MD);
  if (m) {
    const d = build(Number(m[2]), MONTHS[m[1].toLowerCase()], today);
    if (d) return { deadline: d, matched: m[0] };
  }
  return {};
}

/**
 * No-model fallback. One obligation per line or sentence.
 * Understands "by 2026-10-30", "by 30 October", "by October 30" and "after X and Y".
 * It does NOT understand "Friday", "next week", or implicit dependencies: use a model for prose.
 */
export function parseText(text: string, today: Date): Obligation[] {
  const existingIds = new Set<string>();
  const items: Obligation[] = [];
  const deps: string[][] = [];
  const EFFORT_REGEX = /\b(?:effort|size)\s*[:=]\s*(tiny|small|medium|large)\b/i;
  const IRREVERSIBLE_REGEX = /\b(?:irreversible|permanent|final|cannot be undone|can't be undone)\b/i;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim().replace(/^([-*•]|\d+[.)])\s+/, "");
    if (!line) continue;
    for (const sentence of line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)) {
      const quote = sentence.trim().replace(/[\s]+$/, "");
      if (!quote) continue;
      const { deadline, matched } = extractDeadline(quote, today);
      let body = quote;
      if (matched) {
        body = body.replace(matched, "");
      }

      // Extract effort
      let effort: "tiny" | "small" | "medium" | "large" | undefined;
      const effortMatch = body.match(EFFORT_REGEX);
      if (effortMatch) {
        effort = effortMatch[1].toLowerCase() as "tiny" | "small" | "medium" | "large";
        body = body.replace(EFFORT_REGEX, "");
      }

      // Extract irreversible
      let irreversible = false;
      if (IRREVERSIBLE_REGEX.test(body)) {
        irreversible = true;
        body = body.replace(IRREVERSIBLE_REGEX, "");
      }

      let names: string[] = [];
      const a = body.match(/\b(?:after|needs|depends on)\s+(.+)$/i);
      if (a) {
        names = a[1].split(/,|\band\b/i).map((s) => s.replace(/[.!?]+$/, "").trim()).filter(Boolean);
        body = body.replace(a[0], "");
      }
      const title = body.replace(/[\s,;.!?]+$/, "").replace(/\s{2,}/g, " ").trim();
      if (!title) continue;
      const id = nextObligationId(existingIds);
      items.push({ id, title, deadline, dependsOn: [], sourceQuote: quote, effort, irreversible });
      deps.push(names);
    }
  }
  items.forEach((o, i) => {
    o.dependsOn = deps[i].map((n) => {
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      const hit = items.find((p) => p !== o && regex.test(p.title));
      return hit ? hit.id : `unresolved:${n}`;
    });
  });
  return items;
}

export type ValidationResult =
  | { ok: true; obligations: Obligation[]; warnings: string[] }
  | { ok: false; error: string };

export function validateProposal(raw: unknown, sourceText: string): ValidationResult {
  const result = validateObligationStructure(raw, { sourceText });
  if (!result.ok) return result;
  return result;
}
