/**
 * Stable, unique ID generation for obligations.
 * Uses a Set to track existing IDs, no global state.
 */

export function nextObligationId(existing: Set<string>): string {
  let n = existing.size + 1;
  while (existing.has(`o${n}`)) n++;
  existing.add(`o${n}`);
  return `o${n}`;
}

/**
 * Ensure an obligation has a valid, unique ID.
 * If missing or duplicate, assign a fresh one.
 */
export function ensureUniqueId(
  id: string | undefined,
  existingIds: Set<string>,
  proposedId?: string
): string {
  const candidate = (proposedId ?? id ?? "").trim();
  if (candidate && !existingIds.has(candidate)) {
    existingIds.add(candidate);
    return candidate;
  }
  // Generate a fresh one
  return nextObligationId(existingIds);
}

/**
 * Sanitize a string for safe inclusion in an LLM prompt.
 * Removes control characters, limits length, and escapes backticks.
 */
export function sanitizeForPrompt(input: string, maxLength = 4000): string {
  // Remove control characters except newlines and tabs
  let out = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Limit length
  if (out.length > maxLength) {
    out = out.slice(0, maxLength) + "… [truncated]";
  }
  // Escape backticks to prevent breaking code fences
  out = out.replace(/`/g, "\\`");
  return out;
}