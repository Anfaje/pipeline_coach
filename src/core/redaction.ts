/**
 * Local pseudonymization (privacy Tier B, brief §6). Runs entirely on the
 * user's machine, deterministically — no LLM, no network. Person names,
 * company names, emails, phone numbers, and user-supplied terms are
 * replaced with stable placeholders (PERSON_1, COMPANY_1, ...) before a
 * transcript is sent to any analysis engine; placeholders in the engine's
 * response are mapped back locally before anything is shown to the user.
 *
 * Design properties:
 * - Deterministic: the same transcript + options always yields the same
 *   map, so retries stay consistent.
 * - Reversible: placeholders are unique tokens that survive verbatim
 *   copying by the model; reversal is plain string substitution. Danish
 *   genitives ("Annas") survive both directions ("PERSON_1s").
 * - Honest about limits: detection of unknown proper nouns is heuristic
 *   (mid-sentence capitalization, company legal suffixes). Sentence-initial
 *   names without other occurrences and short all-caps acronyms (CFO, KPI)
 *   are not auto-detected — the customTerms list exists to close such gaps,
 *   and callers should let users review the redacted text before sending.
 */

export type RedactionKind = "person" | "company" | "email" | "phone" | "term" | "name";

export interface RedactionEntry {
  original: string;
  placeholder: string;
  kind: RedactionKind;
}

export interface RedactionResult {
  text: string;
  map: RedactionEntry[];
}

const PLACEHOLDER_PREFIX: Record<RedactionKind, string> = {
  person: "PERSON",
  company: "COMPANY",
  email: "EMAIL",
  phone: "PHONE",
  term: "TERM",
  name: "NAME",
};

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replace original (plus bare genitive-s form) with placeholder, keeping the suffix. */
const substitute = (text: string, original: string, placeholder: string): string =>
  text.replace(
    new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(original)}(s)?(?![\\p{L}\\p{N}_])`, "gu"),
    (_m, s) => placeholder + (s ?? ""),
  );

const EMAIL_RE = /[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[\p{L}]{2,}/gu;
// Conservative: international prefix, or Danish 2x4 grouping — plain integers
// (amounts, years) are never touched.
const PHONE_RE = /(?:\+\d{1,3}[ .-]?)\d{2}[ .-]\d{2}[ .-]\d{2}[ .-]\d{2}\b|\b\d{2} \d{2} \d{2} \d{2}\b|\b\d{4} \d{4}\b/g;
const COMPANY_SUFFIX = /(?:[A-ZÆØÅ][\p{L}0-9&.-]*\s){0,3}[A-ZÆØÅ][\p{L}0-9&.-]*\s(?:A\/S|ApS|AS|AB|Oy|GmbH|AG|Ltd\.?|Inc\.?|LLC|P\/S|I\/S|K\/S)(?![\p{L}])/gu;

// Words that are capitalized mid-sentence without being names.
const STOPWORDS = new Set(
  "I,I'm,I'll,I've,I'd,OK,Q,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday,January,February,March,April,May,June,July,August,September,October,November,December,God,Christmas,Easter,Teams,Zoom,Excel,PowerPoint".split(","),
);

export interface RedactionOptions {
  /** Speaker labels from the transcript — always treated as person names. */
  speakers?: string[];
  /** User-maintained list of terms to always redact (own company, products, clients). */
  customTerms?: string[];
  /** Skip redacting these exact strings (e.g. placeholder-safe words). */
  allowList?: string[];
}

interface Candidate {
  original: string;
  kind: RedactionKind;
}

/** Collect mid-sentence capitalized spans not explained by sentence position. */
const properNounCandidates = (text: string): string[] => {
  const found = new Set<string>();
  // Work line by line; inside each line, track whether we are at a sentence start.
  for (const line of text.split("\n")) {
    // strip a leading "Speaker: " label — the label itself is handled via speakers
    const body = line.replace(/^[^:]{1,40}:\s*/u, "");
    const tokens = body.split(/\s+/);
    let sentenceStart = true;
    let span: string[] = [];
    const flush = () => {
      if (span.length > 0) {
        const joined = span.join(" ");
        if (!STOPWORDS.has(joined)) found.add(joined);
        span = [];
      }
    };
    for (const rawTok of tokens) {
      const tok = rawTok.replace(/^[("'«]+|[)"'»,.;:!?]+$/gu, "");
      if (tok.length === 0) {
        flush();
        continue;
      }
      const capitalized = /^[A-ZÆØÅ][\p{Ll}\p{Lu}0-9&.-]*$/u.test(tok);
      const allCapsShort = /^[A-ZÆØÅ0-9]{1,4}$/.test(tok); // CFO, KPI, Q1 — keep
      if (capitalized && !allCapsShort && !sentenceStart && !STOPWORDS.has(tok)) {
        span.push(tok);
      } else {
        flush();
      }
      sentenceStart = /[.!?]$/.test(rawTok);
    }
    flush();
  }
  return [...found];
};

export function buildRedactionMap(
  text: string,
  opts: RedactionOptions = {},
): RedactionEntry[] {
  const allow = new Set((opts.allowList ?? []).map((s) => s.toLowerCase()));
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const push = (original: string, kind: RedactionKind) => {
    const key = original.toLowerCase();
    if (original.length < 2 || seen.has(key) || allow.has(key)) return;
    seen.add(key);
    candidates.push({ original, kind });
  };

  // 1. Custom terms — highest priority, exactly as given.
  for (const t of opts.customTerms ?? []) push(t.trim(), "term");

  // 2. Speakers: full label, then each name part (so "Mads" alone is caught).
  for (const s of opts.speakers ?? []) {
    const label = s.trim();
    push(label, "person");
    for (const part of label.split(/\s+/)) {
      if (part.length >= 3) push(part, "person");
    }
  }

  // 3. Emails and phone numbers.
  for (const m of text.match(EMAIL_RE) ?? []) push(m, "email");
  for (const m of text.match(PHONE_RE) ?? []) push(m.trim(), "phone");

  // 4. Companies by legal suffix.
  for (const m of text.match(COMPANY_SUFFIX) ?? []) push(m.trim(), "company");

  // 5. Remaining mid-sentence proper nouns. Overlaps with longer entries are
  // safe: substitution runs longest-first, so "Nordkap A/S" is replaced
  // before a standalone "Nordkap" elsewhere.
  for (const n of properNounCandidates(text)) push(n, "name");

  // Longest-first so "Mads Berg" is replaced before "Mads".
  candidates.sort((a, b) => b.original.length - a.original.length);

  const counters: Partial<Record<RedactionKind, number>> = {};
  return candidates.map(({ original, kind }) => {
    counters[kind] = (counters[kind] ?? 0) + 1;
    return { original, kind, placeholder: `${PLACEHOLDER_PREFIX[kind]}_${counters[kind]}` };
  });
}

/** Apply a map: real → placeholders. */
export function redactText(text: string, map: RedactionEntry[]): string {
  let out = text;
  for (const e of map) out = substitute(out, e.original, e.placeholder);
  return out;
}

/** Reverse a map: placeholders → real. Genitive suffixes survive (PERSON_1s → Annas). */
export function unredactText(text: string, map: RedactionEntry[]): string {
  let out = text;
  for (const e of map) {
    out = out.replace(
      new RegExp(
        `(?<![\\p{L}\\p{N}_])${escapeRegExp(e.placeholder)}(s)?(?![\\p{L}\\p{N}_])`,
        "gu",
      ),
      (_m, s) => e.original + (s ?? ""),
    );
  }
  return out;
}

export function redactTranscript(
  text: string,
  opts: RedactionOptions = {},
): RedactionResult {
  const map = buildRedactionMap(text, opts);
  return { text: redactText(text, map), map };
}
