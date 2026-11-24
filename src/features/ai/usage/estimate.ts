/**
 * Coarse token estimation, used only for a clearly-labelled dashboard hint.
 *
 * Estimates never populate stored provider-reported counts. The heuristic is
 * deliberately simple and approximate: ~4 characters per token for Latin text.
 */

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  const clean = text.trim();
  if (!clean) return 0;
  return Math.max(1, Math.ceil(clean.length / CHARS_PER_TOKEN));
}

/** Rough prompt-size estimate including instructions and prior turns. */
export function estimateRequestTokens(parts: Array<string | undefined>): number {
  return parts.reduce((total, part) => total + estimateTokens(part ?? ""), 0);
}
