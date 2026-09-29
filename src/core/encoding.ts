/**
 * Transcript file decoding. Real-world exports are not always UTF-8:
 * Danish Windows tools produce windows-1252 and older Mac tools produce
 * Mac Roman (where å/Ø become Œ/¯ if misread). Strategy: strict UTF-8
 * first; otherwise decode with each legacy candidate and score by Danish
 * letter frequency minus mojibake indicators.
 *
 * Works in Node and browsers (WHATWG TextDecoder labels).
 */

const DANISH = /[æøåÆØÅ]/g;
const MOJIBAKE = /[ŒœŠš¯¿ŽžÃ¢�]/g;

export interface DecodedTranscript {
  text: string;
  encoding: string;
}

export function decodeTranscript(bytes: Uint8Array): DecodedTranscript {
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
    };
  } catch {
    /* not UTF-8; try legacy encodings */
  }
  let best: { text: string; encoding: string; score: number } | null = null;
  for (const encoding of ["windows-1252", "macintosh", "iso-8859-1"]) {
    let text: string;
    try {
      text = new TextDecoder(encoding).decode(bytes);
    } catch {
      continue; // label unsupported in this runtime
    }
    const score =
      (text.match(DANISH)?.length ?? 0) - 2 * (text.match(MOJIBAKE)?.length ?? 0);
    if (!best || score > best.score) best = { text, encoding, score };
  }
  if (best) return { text: best.text, encoding: best.encoding };
  return {
    text: new TextDecoder("utf-8").decode(bytes),
    encoding: "utf-8 (lossy)",
  };
}
