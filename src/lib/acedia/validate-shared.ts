import type { Obligation, Effort } from "./types";
import { ensureUniqueId } from "./ids";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EFFORTS: Effort[] = ["tiny", "small", "medium", "large"];

export const validDate = (s: string) =>
  ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export interface ValidationContext {
  /** If provided, verify sourceQuote against this text */
  sourceText?: string;
  /** If true, allow sourceQuote to be optional for deadlines */
  allowMissingSourceQuote?: boolean;
}

export type ValidationResult =
  | { ok: true; obligations: Obligation[]; warnings: string[] }
  | { ok: false; error: string };

/**
 * Shared validation logic for obligation structure.
 * Validates: ID, title, deadline format, effort values, dependsOn array, boolean coercion.
 * If sourceText is provided, also validates sourceQuote and drops unverified deadlines.
 */
export function validateObligationStructure(
  raw: unknown,
  context: ValidationContext = {}
): ValidationResult {
  const list = Array.isArray(raw) ? raw : (raw as { obligations?: unknown } | null)?.obligations;
  if (!Array.isArray(list)) return { ok: false, error: "Expected an array of obligations." };
  if (list.length === 0 || list.length > 30) return { ok: false, error: "Expected between 1 and 30 obligations." };

  const warnings: string[] = [];
  const out: Obligation[] = [];
  const seenIds = new Set<string>();

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const haystack = context.sourceText ? norm(context.sourceText) : "";

  const str = (v: unknown, max = 200) =>
    typeof v === "string" && v.trim() && v.length <= max ? v.trim() : undefined;

  for (const r of list) {
    if (typeof r !== "object" || r === null) return { ok: false, error: "Obligation is not an object." };
    const o = r as Record<string, unknown>;

    const proposedId = str(o.id, 40);
    const title = str(o.title);
    if (!title) return { ok: false, error: "Each obligation needs a title." };

    // Ensure unique ID - generate one if missing or duplicate
    const id = ensureUniqueId(proposedId, seenIds);
    if (proposedId && proposedId !== id) {
      warnings.push(`Renamed duplicate/missing id for "${title}" from "${proposedId}" to "${id}".`);
    }

    let deadline: string | undefined;
    if (o.deadline != null) {
      if (typeof o.deadline !== "string" || !validDate(o.deadline)) return { ok: false, error: `Bad deadline on "${title}".` };
      deadline = o.deadline;
    }

    let sourceQuote = str(o.sourceQuote, 400);
    if (context.sourceText) {
      if (sourceQuote && !haystack.includes(norm(sourceQuote))) {
        warnings.push(`Dropped an unverifiable quote for "${title}".`);
        sourceQuote = undefined;
      }
      if (deadline && !sourceQuote && !context.allowMissingSourceQuote) {
        warnings.push(`Dropped the deadline for "${title}": no verified quote supports it.`);
        deadline = undefined;
      }
    }

    let effort: Effort | undefined;
    if (o.effort != null) {
      if (!EFFORTS.includes(o.effort as Effort)) return { ok: false, error: `Bad effort on "${title}".` };
      effort = o.effort as Effort;
    }

    const dependsOn = o.dependsOn ?? [];
    if (!Array.isArray(dependsOn) || dependsOn.some((d) => typeof d !== "string")) return { ok: false, error: `Bad dependsOn on "${title}".` };

    const irreversible = o.irreversible === true ? true : undefined;
    const firstStep = str(o.firstStep);
    const doneWhen = str(o.doneWhen);
    const done = o.done === true;

    out.push({
      id,
      title,
      deadline,
      effort,
      sourceQuote,
      dependsOn: dependsOn as string[],
      irreversible,
      firstStep,
      doneWhen,
      done,
    });
  }

  // Validate all deps reference known IDs
  const ids = new Set(out.map((o) => o.id));
  for (const o of out) {
    for (const d of o.dependsOn) {
      if (!ids.has(d)) return { ok: false, error: `"${o.title}" depends on unknown id "${d}".` };
    }
  }

  return { ok: true, obligations: out, warnings };
}