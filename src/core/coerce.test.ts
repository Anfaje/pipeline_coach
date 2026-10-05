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

describe("seller craft (rubric v2)", async () => {
  const rubric2 = (await import("../rubric/healthy-pipeline.v2.json")).default as Rubric;
  const ids2 = { meetingId: "m1", rubric: rubric2 };

  it("coerces craft findings incl. misses and checkpoints, fills missing metrics", () => {
    const a = coerceMeetingAnalysis({
      dimensions: [],
      craft: [{
        metricKey: "curiosity", score: "7",
        evidence: [{ speaker: "J", text: "hvor meget tid taler vi om?" }],
        misses: [{ statement: { speaker: "M", text: "det koster os tid" }, suggestedQuestion: "Hvor meget tid om ugen?" }],
        reasoning: "r",
      }],
    }, ids2);
    expect(a.craft).toHaveLength(2);
    const cur = a.craft!.find((c) => c.metricKey === "curiosity")!;
    expect(cur.score).toBe(7);
    expect(cur.misses[0]!.suggestedQuestion).toContain("Hvor meget");
    expect(a.craft!.find((c) => c.metricKey === "framing")!.score).toBe(0);
  });

  it("coerces string-shaped misses and bad checkpoint names (drift)", () => {
    const a = coerceMeetingAnalysis({
      dimensions: [],
      craft: [{ metricKey: "framing", score: 8, reasoning: "r", evidence: [],
        checkpoints: [{ name: "start", present: "yes", note: { text: "framed clearly" } }] }],
    }, ids2);
    const fr = a.craft!.find((c) => c.metricKey === "framing")!;
    expect(fr.checkpoints![0]).toMatchObject({ name: "opening", present: true, note: "framed clearly" });
  });

  it("omits craft entirely for rubric v1 (no sellerCraft section)", () => {
    const a = coerceMeetingAnalysis({ dimensions: [], craft: [{ metricKey: "curiosity", score: 9 }] }, ids);
    expect(a.craft).toBeUndefined();
  });
});
