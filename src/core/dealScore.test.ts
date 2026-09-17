import { describe, expect, it } from "vitest";
import rubricJson from "../rubric/healthy-pipeline.v1.json";
import { mergeDealScores, type SequencedAnalysis } from "./dealScore.js";
import type { DimensionAnalysis, MeetingAnalysis, Rubric } from "./types.js";

const rubric = rubricJson as Rubric;

const dim = (key: string, score: number): DimensionAnalysis => ({
  dimensionKey: key,
  score,
  confidence: "customer_stated",
  evidence: score > 3 ? [{ speaker: "C", text: "quote" }] : [],
  reasoning: "",
});

const analysis = (
  meetingId: string,
  scores: Record<string, number>,
): MeetingAnalysis => ({
  meetingId,
  rubricId: rubric.id,
  rubricVersion: rubric.version,
  dimensions: Object.entries(scores).map(([k, s]) => dim(k, s)),
  happyEars: [],
  missedSignals: [],
  verdict: "",
});

const seq = (
  sequence: number,
  meetingId: string,
  scores: Record<string, number>,
): SequencedAnalysis => ({ sequence, meetingId, analysis: analysis(meetingId, scores) });

describe("mergeDealScores", () => {
  it("carries the best evidence to date per dimension", () => {
    const merged = mergeDealScores(rubric, [
      seq(1, "m1", { pain: 8, power: 2 }),
      seq(2, "m2", { pain: 5, power: 7 }),
    ]);
    const pain = merged.find((d) => d.dimensionKey === "pain")!;
    const power = merged.find((d) => d.dimensionKey === "power")!;
    expect(pain.score).toBe(8);
    expect(pain.sourceMeetingId).toBe("m1");
    expect(power.score).toBe(7);
    expect(power.sourceMeetingId).toBe("m2");
  });

  it("decays evidence older than the staleness threshold by one band", () => {
    // pain=8 confirmed in meeting 1; meetings 2,3,4 never reconfirm.
    // 3 meetings since evidence > threshold of 2 → drops from band 7-8 to max of band 4-6.
    const merged = mergeDealScores(rubric, [
      seq(1, "m1", { pain: 8 }),
      seq(2, "m2", { pain: 2 }),
      seq(3, "m3", { pain: 2 }),
      seq(4, "m4", { pain: 2 }),
    ]);
    const pain = merged.find((d) => d.dimensionKey === "pain")!;
    expect(pain.stale).toBe(true);
    expect(pain.rawScore).toBe(8);
    expect(pain.score).toBe(6);
    expect(pain.meetingsSinceEvidence).toBe(3);
  });

  it("does not decay within the threshold", () => {
    const merged = mergeDealScores(rubric, [
      seq(1, "m1", { pain: 8 }),
      seq(2, "m2", { pain: 3 }),
      seq(3, "m3", { pain: 3 }),
    ]);
    const pain = merged.find((d) => d.dimensionKey === "pain")!;
    expect(pain.stale).toBe(false);
    expect(pain.score).toBe(8);
  });

  it("ties go to the most recent meeting", () => {
    const merged = mergeDealScores(rubric, [
      seq(1, "m1", { vision: 7 }),
      seq(2, "m2", { vision: 7 }),
    ]);
    const vision = merged.find((d) => d.dimensionKey === "vision")!;
    expect(vision.sourceMeetingId).toBe("m2");
    expect(vision.meetingsSinceEvidence).toBe(0);
  });

  it("returns zeroed dimensions for a deal with no analyses of that dimension", () => {
    const merged = mergeDealScores(rubric, [seq(1, "m1", { pain: 5 })]);
    const control = merged.find((d) => d.dimensionKey === "control")!;
    expect(control.score).toBe(0);
    expect(control.sourceMeetingId).toBe("");
  });

  it("never decays scores already in the lowest band", () => {
    const merged = mergeDealScores(rubric, [
      seq(1, "m1", { value: 2 }),
      seq(2, "m2", {}),
      seq(3, "m3", {}),
      seq(4, "m4", {}),
    ]);
    const value = merged.find((d) => d.dimensionKey === "value")!;
    expect(value.stale).toBe(false);
    expect(value.score).toBe(2);
  });
});
