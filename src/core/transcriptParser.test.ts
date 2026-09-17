import { describe, expect, it } from "vitest";
import {
  detectLanguages,
  parseTranscript,
  toCanonicalText,
  UNKNOWN_SPEAKER,
} from "./transcriptParser.js";

describe("parseTranscript formats", () => {
  it("parses generic 'Speaker: text' transcripts and coalesces runs", () => {
    const raw = `Anna: Hvad er den største udfordring i jeres projekter lige nu?
Mads: Vi taber cirka to uger per projekt på omarbejde.
Mads: Og det koster os nemt en halv million kroner om året.
Anna: Hvem ejer budgettet for at løse det?`;
    const p = parseTranscript(raw);
    expect(p.format).toBe("labeled");
    expect(p.speakers).toEqual(["Anna", "Mads"]);
    expect(p.utterances).toHaveLength(3); // Mads' two lines coalesced
    expect(p.utterances[1]!.text).toContain("halv million");
    expect(p.languages).toEqual(["da"]);
  });

  it("parses bracketed timestamps", () => {
    const raw = `[12:03] Anna: How do you handle rework today?
[12:04] Mads: Honestly, we mostly don't. It piles up at the end.`;
    const p = parseTranscript(raw);
    expect(p.format).toBe("labeled");
    expect(p.utterances[0]!.timestamp).toBe("12:03");
    expect(p.languages).toEqual(["en"]);
  });

  it("parses WebVTT with voice tags (Teams/Zoom export)", () => {
    const raw = `WEBVTT

00:00:03.120 --> 00:00:06.000
<v Anna Larsen>Hvem skal godkende sådan en investering hos jer?</v>

00:00:06.500 --> 00:00:09.000
<v Mads Berg>Det skal vores CFO. Jeg kan tage det med til ham.</v>`;
    const p = parseTranscript(raw);
    expect(p.format).toBe("vtt");
    expect(p.speakers).toEqual(["Anna Larsen", "Mads Berg"]);
    expect(p.utterances[0]!.timestamp).toBe("00:00:03.120");
  });

  it("parses Zoom 'HH:MM:SS From Name:' lines", () => {
    const raw = `10:02:11 From Anna Larsen: What would solving this be worth per year?
10:02:45 From Mads Berg: Rough guess, half a million kroner.
10:03:01 From Mads Berg: Maybe more.`;
    const p = parseTranscript(raw);
    expect(p.format).toBe("zoom");
    expect(p.speakers).toEqual(["Anna Larsen", "Mads Berg"]);
    expect(p.utterances).toHaveLength(2); // coalesced
  });

  it("parses Teams copy-out (name + time header, text below)", () => {
    const raw = `Anna Larsen  12:03
Hvad ville det betyde for jer, hvis fejlene blev fanget hver mandag?

Mads Berg  12:04
Så kunne mit team omfordele folk samme uge.
Det ville være en kæmpe forskel.`;
    const p = parseTranscript(raw);
    expect(p.format).toBe("teams");
    expect(p.speakers).toEqual(["Anna Larsen", "Mads Berg"]);
    expect(p.utterances[1]!.text).toContain("kæmpe forskel");
  });

  it("falls back to unlabeled with a warning", () => {
    const raw = `Talked to Mads about the rework problem. He thinks it costs them half a million a year. Follow up with CFO.`;
    const p = parseTranscript(raw);
    expect(p.format).toBe("unlabeled");
    expect(p.speakers).toEqual([UNKNOWN_SPEAKER]);
    expect(p.warnings.length).toBeGreaterThan(0);
  });

  it("produces canonical text that quote validation runs against", () => {
    const raw = `Anna: Hvem ejer budgettet?
Mads: Det gør jeg faktisk selv.`;
    const canonical = toCanonicalText(parseTranscript(raw));
    expect(canonical).toBe("Anna: Hvem ejer budgettet?\nMads: Det gør jeg faktisk selv.");
  });
});

describe("detectLanguages", () => {
  it("detects Danish", () => {
    expect(
      detectLanguages("Vi skal have styr på det her, og det skal være i denne uge."),
    ).toEqual(["da"]);
  });
  it("detects English", () => {
    expect(
      detectLanguages("We need to sort this out, and it has to be this week."),
    ).toEqual(["en"]);
  });
  it("detects mixed-language meetings with the dominant language first", () => {
    const mixed = `Vi taber to uger per projekt, og det er ikke holdbart.
To be fair, the tooling is part of the problem.
Men det er også et spørgsmål om, hvem der ejer processen, ikke?`;
    const langs = detectLanguages(mixed);
    expect(langs[0]).toBe("da");
    expect(langs).toContain("en");
  });
});
