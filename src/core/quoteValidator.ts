import type { EvidenceQuote } from "./types.js";

/**
 * Deterministic guard against fabricated evidence: every quote the model
 * cites must actually appear in the transcript. From the brief (§4):
 * "No quote, no score above 3."
 *
 * Matching is whitespace- and case-insensitive and ignores surrounding
 * punctuation trimming, but requires the words themselves verbatim.
 * Transcripts are Danish/English/mixed, so no stemming or fuzzy matching:
 * a paraphrase is a fabrication, not a match.
 */

const normalize = (s: string): string =>
  s
    .toLowerCase()
    // unify curly quotes/apostrophes and dashes so a model's typographic
    // rendering of a straight-quoted transcript still matches verbatim text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

export interface QuoteValidationResult {
  valid: boolean;
  invalidQuotes: EvidenceQuote[];
}

export function validateQuotes(
  transcript: string,
  quotes: EvidenceQuote[],
): QuoteValidationResult {
  const haystack = normalize(transcript);
  const invalidQuotes = quotes.filter((q) => {
    const needle = normalize(q.text);
    if (needle.length === 0) return true;
    return !haystack.includes(needle);
  });
  return { valid: invalidQuotes.length === 0, invalidQuotes };
}
