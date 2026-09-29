/**
 * Resolve a user-supplied seller name against the transcript's speaker
 * labels. People type "Johan", transcripts say "Johan Broberg Binder" —
 * so: exact match first, then case-insensitive exact, then a unique
 * word-prefix/substring match. Ambiguity or no match returns null with
 * the candidates, so callers ask instead of guessing.
 */

export interface SpeakerResolution {
  speaker: string | null;
  /** Candidates that matched when resolution was ambiguous. */
  matches: string[];
}

export function resolveSpeaker(input: string, speakers: string[]): SpeakerResolution {
  const wanted = input.trim();
  if (!wanted) return { speaker: null, matches: [] };

  const exact = speakers.find((s) => s === wanted);
  if (exact) return { speaker: exact, matches: [exact] };

  const lower = wanted.toLowerCase();
  const ciExact = speakers.filter((s) => s.toLowerCase() === lower);
  if (ciExact.length === 1) return { speaker: ciExact[0]!, matches: ciExact };

  // Word-prefix match ("johan" -> "Johan Broberg Binder", "berg" !-> "Broberg")
  const prefix = speakers.filter((s) =>
    s.toLowerCase().split(/\s+/).some((w) => w.startsWith(lower)),
  );
  if (prefix.length === 1) return { speaker: prefix[0]!, matches: prefix };
  if (prefix.length > 1) return { speaker: null, matches: prefix };

  // Last resort: substring anywhere, still only if unique.
  const sub = speakers.filter((s) => s.toLowerCase().includes(lower));
  if (sub.length === 1) return { speaker: sub[0]!, matches: sub };
  return { speaker: null, matches: sub };
}
