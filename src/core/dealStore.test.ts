import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addMeeting, listDeals, loadDeal, saveDeal, slugify } from "./dealStore.js";
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
    const m1 = addMeeting(deal, { id: "a", date: "2026-09-17", source: "a.txt", sellerSpeaker: "J", languages: ["da"], analysis });
    const m2 = addMeeting(deal, { id: "b", date: "2026-09-30", source: "b.txt", sellerSpeaker: "J", languages: ["da"], analysis });
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
