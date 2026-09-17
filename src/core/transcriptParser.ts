/**
 * Transcript parser (issue #1). Takes raw pasted text in common formats —
 * Teams copy-out, WebVTT export, Zoom, plain "Speaker: text" lines, or
 * unstructured notes — and produces a normalized transcript.
 *
 * Deterministic by design (brief §6): no LLM involvement. The parser never
 * guesses who the seller is; it exposes the speaker list so the app can ask
 * when it is ambiguous.
 *
 * The normalized `text` (canonical "Speaker: utterance" lines) is what gets
 * stored on Meeting.transcript and what evidence quotes are validated
 * against.
 */

export interface Utterance {
  speaker: string;
  text: string;
  /** Original timestamp string when the format carried one. */
  timestamp?: string;
}

export interface ParsedTranscript {
  format: "teams" | "vtt" | "zoom" | "labeled" | "unlabeled";
  utterances: Utterance[];
  /** Distinct speakers in order of first appearance. */
  speakers: string[];
  /** ISO 639-1 codes, dominant first. Currently detects da/en. */
  languages: string[];
  /** Non-fatal issues the app should surface (e.g. no speaker labels). */
  warnings: string[];
}

export const UNKNOWN_SPEAKER = "Unknown";

/* ---------------------------------- utils --------------------------------- */

const cleanLines = (raw: string): string[] =>
  raw.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());

/** Merge consecutive utterances from the same speaker. */
const coalesce = (utterances: Utterance[]): Utterance[] => {
  const out: Utterance[] = [];
  for (const u of utterances) {
    const prev = out[out.length - 1];
    if (prev && prev.speaker === u.speaker) {
      prev.text = `${prev.text} ${u.text}`.trim();
    } else {
      out.push({ ...u });
    }
  }
  return out.filter((u) => u.text.length > 0);
};

/* ----------------------------- format detectors ---------------------------- */

// WebVTT (Teams/Zoom transcript export): cue timing lines + optional <v Name>
const VTT_TIMING = /^\d{2}:\d{2}(:\d{2})?[.,]\d{3}\s+-->\s+\d{2}:\d{2}/;
// Zoom chat/transcript: "12:03:45 From Mads Jensen: text" or "12:03:45\tMads Jensen: text"
const ZOOM_LINE = /^(\d{2}:\d{2}:\d{2})\s+(?:From\s+)?([^:]{1,60}?)\s*:\s*(.*)$/;
// Teams copy-out: a line that is "Name  12:03" or "Name 12:03 PM" followed by text lines
const TEAMS_HEADER = /^(.{1,60}?)\s{1,}(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)$/i;
// Bracketed: "[12:03] Name: text"
const BRACKET_LINE = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]{1,60}?)\s*:\s*(.*)$/;
// Generic labeled: "Name: text" (name without digits, reasonably short)
const LABELED_LINE = /^([^\d:]{1,40}?)\s*:\s*(.+)$/;

const parseVtt = (lines: string[]): Utterance[] => {
  const out: Utterance[] = [];
  let timestamp: string | undefined;
  for (const line of lines) {
    if (line === "" || line === "WEBVTT" || /^\d+$/.test(line)) continue;
    if (VTT_TIMING.test(line)) {
      timestamp = line.split("-->")[0]?.trim();
      continue;
    }
    const voiced = line.match(/^<v\s+([^>]+)>(.*?)(<\/v>)?$/);
    if (voiced) {
      out.push({
        speaker: voiced[1]!.trim(),
        text: voiced[2]!.trim(),
        timestamp,
      });
    } else if (timestamp !== undefined) {
      // cue text without voice tag; try "Name: text", else unknown
      const labeled = line.match(LABELED_LINE);
      if (labeled) {
        out.push({ speaker: labeled[1]!.trim(), text: labeled[2]!.trim(), timestamp });
      } else {
        out.push({ speaker: UNKNOWN_SPEAKER, text: line, timestamp });
      }
    }
  }
  return out;
};

const parseZoom = (lines: string[]): Utterance[] =>
  lines
    .map((l) => l.match(ZOOM_LINE))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ timestamp: m[1]!, speaker: m[2]!.trim(), text: m[3]!.trim() }));

const parseTeams = (lines: string[]): Utterance[] => {
  const out: Utterance[] = [];
  let current: Utterance | null = null;
  for (const line of lines) {
    if (line === "") continue;
    const header = line.match(TEAMS_HEADER);
    if (header && !LABELED_LINE.test(line)) {
      if (current) out.push(current);
      current = { speaker: header[1]!.trim(), text: "", timestamp: header[2]! };
      continue;
    }
    if (current) {
      current.text = `${current.text} ${line}`.trim();
    }
  }
  if (current) out.push(current);
  return out;
};

const parseLabeled = (lines: string[]): Utterance[] => {
  const out: Utterance[] = [];
  for (const line of lines) {
    if (line === "") continue;
    const bracket = line.match(BRACKET_LINE);
    if (bracket) {
      out.push({ timestamp: bracket[1]!, speaker: bracket[2]!.trim(), text: bracket[3]!.trim() });
      continue;
    }
    const labeled = line.match(LABELED_LINE);
    if (labeled) {
      out.push({ speaker: labeled[1]!.trim(), text: labeled[2]!.trim() });
    } else if (out.length > 0) {
      // continuation of the previous utterance
      out[out.length - 1]!.text += ` ${line}`;
    } else {
      out.push({ speaker: UNKNOWN_SPEAKER, text: line });
    }
  }
  return out;
};

/* ---------------------------- language detection --------------------------- */

const DA_MARKERS = new Set(
  "og,det,ikke,jeg,vi,er,at,en,til,på,med,som,der,de,har,kan,skal,os,jer,hvad,hvordan,hvorfor,når,også,meget,lidt,bare,noget,vores,jeres,ugen,kroner,tak".split(","),
);
// "i" and "have" are omitted: both are common Danish words ("i" = in) and
// would systematically inflate the English signal in Danish transcripts.
const EN_MARKERS = new Set(
  "the,and,not,we,is,are,to,a,of,with,that,they,can,shall,us,you,what,how,why,when,also,very,little,just,something,our,your,week,thanks".split(","),
);

export const detectLanguages = (text: string): string[] => {
  const words = text.toLowerCase().match(/[a-zæøåéü']+/g) ?? [];
  let da = 0;
  let en = 0;
  for (const w of words) {
    if (DA_MARKERS.has(w)) da++;
    if (EN_MARKERS.has(w)) en++;
  }
  if (/[æøå]/i.test(text)) da += Math.max(3, Math.round(words.length * 0.02));
  const total = da + en;
  if (total === 0) return [];
  const langs: Array<[string, number]> = [
    ["da", da],
    ["en", en],
  ];
  langs.sort((a, b) => b[1] - a[1]);
  // Report a language when it carries a meaningful share of the signal;
  // a couple of incidental loanword hits should not flag a mixed meeting.
  return langs.filter(([, n]) => n >= Math.max(3, total * 0.2)).map(([l]) => l);
};

/* --------------------------------- entrypoint ------------------------------ */

export function parseTranscript(raw: string): ParsedTranscript {
  const lines = cleanLines(raw);
  const warnings: string[] = [];

  let format: ParsedTranscript["format"];
  let utterances: Utterance[];

  if (lines.some((l) => l === "WEBVTT" || VTT_TIMING.test(l))) {
    format = "vtt";
    utterances = parseVtt(lines);
  } else if (
    lines.filter((l) => ZOOM_LINE.test(l)).length >= 2
  ) {
    format = "zoom";
    utterances = parseZoom(lines);
  } else if (
    lines.filter((l) => TEAMS_HEADER.test(l) && !LABELED_LINE.test(l)).length >= 2
  ) {
    format = "teams";
    utterances = parseTeams(lines);
  } else if (lines.filter((l) => LABELED_LINE.test(l) || BRACKET_LINE.test(l)).length >= 2) {
    format = "labeled";
    utterances = parseLabeled(lines);
  } else {
    format = "unlabeled";
    utterances = [
      { speaker: UNKNOWN_SPEAKER, text: lines.filter(Boolean).join(" ") },
    ];
    warnings.push(
      "No speaker labels detected. Scoring quality drops sharply without knowing who said what — paste a transcript with speakers if you have one.",
    );
  }

  utterances = coalesce(utterances);
  const speakers = [...new Set(utterances.map((u) => u.speaker))];
  if (speakers.length === 1 && speakers[0] !== UNKNOWN_SPEAKER) {
    warnings.push("Only one speaker detected; check that the paste included the whole conversation.");
  }

  const fullText = utterances.map((u) => u.text).join(" ");
  const languages = detectLanguages(fullText);

  return { format, utterances, speakers, languages, warnings };
}

/** Canonical transcript text: what Meeting.transcript stores and what
 *  evidence quotes are validated against. */
export const toCanonicalText = (parsed: ParsedTranscript): string =>
  parsed.utterances.map((u) => `${u.speaker}: ${u.text}`).join("\n");
