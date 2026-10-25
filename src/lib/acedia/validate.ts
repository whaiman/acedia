import { validateObligationStructure } from "./validate-shared";

export type ValidateObligationsResult =
  | { ok: true; obligations: import("./types").Obligation[]; warnings: string[] }
  | { ok: false; error: string };

/**
 * Validates a client-provided obligations array (e.g., from mark-complete flow).
 * Unlike validateProposal, this does NOT verify sourceQuote against source text
 * (the client doesn't send source text). It validates structure, formats, and
 * internal consistency (unique IDs, valid deadlines, known deps, supported values).
 */
export function validateObligations(raw: unknown): ValidateObligationsResult {
  return validateObligationStructure(raw, { allowMissingSourceQuote: true });
}