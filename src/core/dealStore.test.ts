import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listDeals, loadDeal, normalizeDeal, saveDeal, slugify, transcriptHash, upsertMeeting } from "./dealStore.js";
import type { MeetingAnalysis } from "./types.js";

const analysis: MeetingAnalysis = {
  meetingId: "m", rubricId: "healthy-pipeline", rubricVersion: "1.0.0",
  dimensions: [], happyEars: [], missedSignals: [], verdict: "v",
};
let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("dealStore", () => {
  it("creates, sequences, saves and reloads a deal", () => {
    dir = mkdtempSync(join(tmpdir(), "hpc-"));
    const deal = loadDeal(dir, "Dovista");
    const m1 = upsertMeeting(deal, { id: "a", date: "2026-09-17", transcriptHash: transcriptHash("A: x"), source: "a.txt", sellerSpeaker: "J", languages: ["da"], analysis }).stored;
    const m2 = upsertMeeting(deal, { id: "b", date: "2026-09-30", transcriptHash: transcriptHash("A: y"), source: "b.txt", sellerSpeaker: "J", languages: ["da"], analysis }).stored;
    expect([m1.sequence, m2.sequence]).toEqual([1, 2]);
    saveDeal(dir, deal);
    const reloaded = loadDeal(dir, "dovista"); // slug match, case-insensitive
    expect(reloaded.meetings).toHaveLength(2);
    expect(listDeals(dir)).toEqual(["dovista"]);
  });

  it("slugifies deal names incl. Danish letters", () => {
    expect(slugify("Dovista — Møde Q1!")).toBe("dovista-møde-q1");
  });
});

describe("duplicate handling (upsert + normalize)", () => {
  const an = (verdict: string) => ({ ...analysis, verdict });

  it("re-analyzing the same transcript replaces, never appends", () => {
    dir = mkdtempSync(join(tmpdir(), "hpc-"));
    const deal = loadDeal(dir, "d");
    const h = transcriptHash("Anna: Hej.\nMads:   Hej.");
    upsertMeeting(deal, { id: "a", date: "2026-09-17", transcriptHash: h, source: "x.txt", sellerSpeaker: "A", languages: ["da"], analysis: an("first") });
    const r = upsertMeeting(deal, { id: "b", date: "2026-09-17", transcriptHash: h, source: "x.txt", sellerSpeaker: "A", languages: ["da"], analysis: an("revised") });
    expect(r.replaced).toBe(true);
    expect(deal.meetings).toHaveLength(1);
    expect(deal.meetings[0]!.analysis.verdict).toBe("revised");
    expect(deal.meetings[0]!.id).toBe("a"); // identity preserved
  });

  it("hash is whitespace-insensitive, content-sensitive", () => {
    expect(transcriptHash("A: x  y\nB: z")).toBe(transcriptHash("A: x y\n B: z "));
    expect(transcriptHash("A: x")).not.toBe(transcriptHash("A: y"));
  });

  it("normalize collapses legacy duplicates (by source) keeping the latest, re-sorts by date, renumbers", () => {
    dir = mkdtempSync(join(tmpdir(), "hpc-"));
    const deal = loadDeal(dir, "d");
    deal.meetings = [
      { id: "1", date: "2026-09-17", sequence: 1, source: "a.txt", sellerSpeaker: "J", languages: ["da"], analysis: an("old a") },
      { id: "2", date: "2026-09-30", sequence: 2, source: "b.txt", sellerSpeaker: "J", languages: ["da"], analysis: an("old b") },
      { id: "3", date: "2026-09-17", sequence: 3, source: "a.txt", sellerSpeaker: "J", languages: ["da"], analysis: an("new a") },
      { id: "4", date: "2026-09-30", sequence: 4, source: "b.txt", sellerSpeaker: "J", languages: ["da"], analysis: an("new b") },
    ];
    expect(normalizeDeal(deal)).toBe(2);
    expect(deal.meetings.map((m) => [m.sequence, m.date, m.analysis.verdict])).toEqual([
      [1, "2026-09-17", "new a"],
      [2, "2026-09-30", "new b"],
    ]);
  });
});
