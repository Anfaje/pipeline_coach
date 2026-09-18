import { describe, expect, it } from "vitest";
import {
  buildRedactionMap,
  redactText,
  redactTranscript,
  unredactText,
} from "./redaction.js";

const transcript = `Anna Larsen: Hvem hos Nordkap A/S skal godkende sådan en investering?
Mads Berg: Det skal vores CFO, Henrik. Skriv til henrik.b@nordkap.dk eller ring på 22 44 66 88.
Anna Larsen: Og hvad ville det betyde for Mads' team, hvis Annas forslag blev godkendt i Q1?`;

describe("redaction", () => {
  const opts = { speakers: ["Anna Larsen", "Mads Berg"] };

  it("pseudonymizes speakers, name parts, companies, emails and phones", () => {
    const { text } = redactTranscript(transcript, opts);
    for (const secret of ["Anna", "Mads", "Berg", "Larsen", "Nordkap", "Henrik", "henrik.b@nordkap.dk", "22 44 66 88"]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain("PERSON_1");
    expect(text).toContain("COMPANY_1");
    expect(text).toContain("EMAIL_1");
    expect(text).toContain("PHONE_1");
  });

  it("keeps roles, acronyms and quarters (CFO, Q1) — they are not identities", () => {
    const { text } = redactTranscript(transcript, opts);
    expect(text).toContain("CFO");
    expect(text).toContain("Q1");
  });

  it("is reversible, including Danish genitives (Annas -> PERSON_ns -> Annas)", () => {
    const { text, map } = redactTranscript(transcript, opts);
    expect(text).not.toContain("Annas");
    expect(unredactText(text, map)).toBe(transcript);
  });

  it("is deterministic: same input, same map", () => {
    const a = buildRedactionMap(transcript, opts);
    const b = buildRedactionMap(transcript, opts);
    expect(a).toEqual(b);
  });

  it("replaces longer names before their parts (Mads Berg before Mads)", () => {
    const map = buildRedactionMap(transcript, opts);
    const full = map.find((e) => e.original === "Mads Berg")!;
    const redacted = redactText("Mads Berg og Mads", map);
    expect(redacted).toContain(full.placeholder);
    expect(redacted).not.toContain("Mads");
  });

  it("honours custom terms and the allow list", () => {
    const r = redactTranscript("Vores produkt Fakturafix sælges gennem Partnerhuset.", {
      customTerms: ["Fakturafix"],
      allowList: ["Partnerhuset"],
    });
    expect(r.text).not.toContain("Fakturafix");
    expect(r.text).toContain("TERM_1");
    expect(r.text).toContain("Partnerhuset");
  });

  it("catches unknown mid-sentence proper nouns heuristically", () => {
    const r = redactTranscript("Mads: Vi bruger allerede noget fra Konkurrentfirmaet Vestergaard til det.", {
      speakers: ["Mads"],
    });
    expect(r.text).not.toContain("Vestergaard");
  });

  it("never touches money amounts or plain numbers", () => {
    const r = redactTranscript("Mads: Det koster os 500.000 kroner om året, måske 2 uger per projekt.", {
      speakers: ["Mads"],
    });
    expect(r.text).toContain("500.000 kroner");
    expect(r.text).toContain("2 uger");
  });
});
