import { describe, expect, it } from "vitest";
import rubricJson from "../rubric/healthy-pipeline.v1.json";
import { analyzeMeeting } from "./analyze.js";
import { MockProvider } from "../providers/mock.js";
import type { Meeting, MeetingAnalysis, Rubric } from "./types.js";

const rubric = rubricJson as Rubric;

const meeting: Meeting = {
  id: "m1",
  dealId: "d1",
  date: "2026-09-17",
  sequence: 1,
  languages: ["da"],
  sellerSpeaker: "Anna",
  transcript: "Mads: Vi taber to uger per projekt.\nAnna: Hvem ejer budgettet?",
};

const base: Omit<MeetingAnalysis, "dimensions"> = {
  meetingId: "m1",
  rubricId: rubric.id,
  rubricVersion: rubric.version,
  happyEars: [],
  missedSignals: [],
  verdict: "ok",
};

const withDims = (
  dims: Array<{ key: string; score: number; quote?: string }>,
): MeetingAnalysis => ({
  ...base,
  dimensions: dims.map((d) => ({
    dimensionKey: d.key,
    score: d.score,
    confidence: "customer_stated" as const,
    evidence: d.quote ? [{ speaker: "Mads", text: d.quote }] : [],
    reasoning: "r",
  })),
});

describe("analyzeMeeting pipeline", () => {
  it("passes through a valid analysis on the first attempt", async () => {
    const provider = new MockProvider([
      withDims([{ key: "pain", score: 8, quote: "Vi taber to uger per projekt." }]),
    ]);
    const result = await analyzeMeeting(provider, rubric, meeting);
    expect(result.degraded).toBeUndefined();
    expect(provider.calls).toHaveLength(1);
  });

  it("retries once with correction feedback when quotes fail validation", async () => {
    const provider = new MockProvider([
      withDims([{ key: "pain", score: 8, quote: "We lose two weeks per project." }]),
      withDims([{ key: "pain", score: 8, quote: "Vi taber to uger per projekt." }]),
    ]);
    const result = await analyzeMeeting(provider, rubric, meeting);
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]!.correctionFeedback).toContain("not found");
    expect(result.degraded).toBeUndefined();
    expect(result.dimensions[0]!.score).toBe(8);
  });

  it("caps unevidenced scores at 3 and marks degraded when retry also fails", async () => {
    const bad = withDims([{ key: "pain", score: 9, quote: "fabricated quote" }]);
    const provider = new MockProvider([bad, bad]);
    const result = await analyzeMeeting(provider, rubric, meeting);
    expect(result.degraded).toBe(true);
    expect(result.dimensions[0]!.score).toBe(3);
    expect(result.dimensions[0]!.evidence).toHaveLength(0);
  });

  it("keeps a high score if at least one cited quote survives validation", async () => {
    const mixed: MeetingAnalysis = {
      ...base,
      dimensions: [
        {
          dimensionKey: "pain",
          score: 8,
          confidence: "customer_stated",
          evidence: [
            { speaker: "Mads", text: "fabricated" },
            { speaker: "Mads", text: "Vi taber to uger per projekt." },
          ],
          reasoning: "r",
        },
      ],
    };
    const provider = new MockProvider([mixed, mixed]);
    const result = await analyzeMeeting(provider, rubric, meeting);
    expect(result.degraded).toBe(true);
    expect(result.dimensions[0]!.score).toBe(8);
    expect(result.dimensions[0]!.evidence).toHaveLength(1);
  });
});

describe("craft quote validation", async () => {
  const rubric2 = (await import("../rubric/healthy-pipeline.v2.json")).default as Rubric;
  const craftAnalysis = (missText: string): MeetingAnalysis => ({
    ...base, rubricVersion: rubric2.version,
    dimensions: [],
    craft: [{ metricKey: "curiosity", score: 8, reasoning: "r",
      evidence: [{ speaker: "Mads", text: "Vi taber to uger per projekt." }],
      misses: [{ statement: { speaker: "Mads", text: missText }, suggestedQuestion: "Hvor meget?" }] }],
  });

  it("retries when a miss statement is not verbatim, keeps the valid retry", async () => {
    const provider = new MockProvider([
      craftAnalysis("vi mister masser af tid"),            // fabricated paraphrase
      craftAnalysis("Vi taber to uger per projekt."),      // verbatim
    ]);
    const result = await analyzeMeeting(provider, rubric2, meeting);
    expect(provider.calls).toHaveLength(2);
    expect(result.degraded).toBeUndefined();
    expect(result.craft![0]!.misses).toHaveLength(1);
  });

  it("drops unverifiable misses (not the score) when retry also fails", async () => {
    const bad = craftAnalysis("fabricated statement");
    const provider = new MockProvider([bad, bad]);
    const result = await analyzeMeeting(provider, rubric2, meeting);
    expect(result.degraded).toBe(true);
    expect(result.craft![0]!.misses).toHaveLength(0);
    expect(result.craft![0]!.score).toBe(8); // evidence itself was verbatim
  });
});
