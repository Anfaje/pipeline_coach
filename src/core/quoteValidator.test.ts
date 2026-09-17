import { describe, expect, it } from "vitest";
import { validateQuotes } from "./quoteValidator.js";

const transcript = `Mads: Vi taber cirka to uger per projekt på omarbejde.
Anna: That's interesting — how does that affect your Q1 targets?
Mads: Det koster os nemt en halv million kroner om året.`;

describe("validateQuotes", () => {
  it("accepts verbatim quotes", () => {
    const r = validateQuotes(transcript, [
      { speaker: "Mads", text: "Vi taber cirka to uger per projekt på omarbejde." },
    ]);
    expect(r.valid).toBe(true);
  });

  it("accepts quotes despite whitespace and case differences", () => {
    const r = validateQuotes(transcript, [
      { speaker: "Anna", text: "how   does that affect your q1 targets?" },
    ]);
    expect(r.valid).toBe(true);
  });

  it("accepts quotes despite curly-quote and dash differences", () => {
    const r = validateQuotes(transcript, [
      { speaker: "Anna", text: "That\u2019s interesting \u2013 how does that affect your Q1 targets?" },
    ]);
    expect(r.valid).toBe(true);
  });

  it("rejects paraphrases and fabrications", () => {
    const r = validateQuotes(transcript, [
      { speaker: "Mads", text: "We lose about two weeks per project" },
      { speaker: "Mads", text: "Det koster os nemt en halv million kroner om året." },
    ]);
    expect(r.valid).toBe(false);
    expect(r.invalidQuotes).toHaveLength(1);
    expect(r.invalidQuotes[0]!.text).toContain("two weeks");
  });

  it("rejects empty quotes", () => {
    const r = validateQuotes(transcript, [{ speaker: "Mads", text: "  " }]);
    expect(r.valid).toBe(false);
  });
});
