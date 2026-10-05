import { describe, expect, it } from "vitest";
import rubricJson from "../rubric/healthy-pipeline.v1.json";
import { coerceMeetingAnalysis } from "./coerce.js";
import type { Rubric } from "./types.js";

const rubric = rubricJson as Rubric;
const ids = { meetingId: "m1", rubric };

describe("coerceMeetingAnalysis", () => {
  it("coerces object-shaped missedSignals and string happyEars (the crash case)", () => {
    const a = coerceMeetingAnalysis({
      dimensions: [],
      missedSignals: [{ signal: "Kunden nævnte selv en deadline." }, "Budgettet blev nævnt i forbifarten."],
      happyEars: ["Antog at CFO'en er med på ideen."],
      verdict: { text: "Fin fremdrift." },
    }, ids);
    expect(a.missedSignals).toEqual(["Kunden nævnte selv en deadline.", "Budgettet blev nævnt i forbifarten."]);
    expect(a.happyEars[0]).toEqual({ assumption: "Antog at CFO'en er med på ideen.", reality: "" });
    expect(a.verdict).toBe("Fin fremdrift.");
  });

  it("clamps and parses scores, defaults confidence, drops empty evidence", () => {
    const a = coerceMeetingAnalysis({
      dimensions: [{ dimensionKey: "pain", score: "14", confidence: "very sure", evidence: [{}, { speaker: "M", text: "citat" }] }],
    }, ids);
    const pain = a.dimensions.find((d) => d.dimensionKey === "pain")!;
    expect(pain.score).toBe(10);
    expect(pain.confidence).toBe("seller_assumed");
    expect(pain.evidence).toEqual([{ speaker: "M", text: "citat" }]);
  });

  it("fills in missing rubric dimensions so UIs never render holes", () => {
    const a = coerceMeetingAnalysis({ dimensions: [{ dimensionKey: "pain", score: 5 }] }, ids);
    expect(a.dimensions.map((d) => d.dimensionKey).sort()).toEqual(["control", "pain", "power", "value", "vision"]);
    expect(a.dimensions.find((d) => d.dimensionKey === "power")!.score).toBe(0);
  });

  it("survives complete garbage", () => {
    const a = coerceMeetingAnalysis("not even json-shaped", ids);
    expect(a.dimensions).toHaveLength(5);
    expect(a.verdict).toBe("");
  });
});
