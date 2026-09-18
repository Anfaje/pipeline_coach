import { describe, expect, it } from "vitest";
import rubricJson from "../rubric/healthy-pipeline.v1.json";
import { analyzeMeeting } from "../core/analyze.js";
import type { Meeting, MeetingAnalysis, Rubric } from "../core/types.js";
import type { AnalysisProvider } from "./types.js";
import { RedactingProvider } from "./redacting.js";

const rubric = rubricJson as Rubric;

const meeting: Meeting = {
  id: "m1",
  dealId: "d1",
  date: "2026-09-18",
  sequence: 1,
  languages: ["da"],
  sellerSpeaker: "Anna Larsen",
  sellerGoal: "Få Mads Berg til at bekræfte budgettet",
  transcript: `Anna Larsen: Hvem ejer budgettet hos Nordkap A/S?
Mads Berg: Det gør jeg faktisk selv.`,
};

/** Inner engine that records what it was given and answers in redacted space. */
class SpyProvider implements AnalysisProvider {
  readonly id = "spy";
  seen: Array<{ transcript: string; sellerSpeaker: string; sellerGoal?: string; feedback?: string }> = [];

  async analyzeMeeting(input: {
    rubric: Rubric;
    meeting: Meeting;
    correctionFeedback?: string;
  }): Promise<MeetingAnalysis> {
    this.seen.push({
      transcript: input.meeting.transcript,
      sellerSpeaker: input.meeting.sellerSpeaker,
      sellerGoal: input.meeting.sellerGoal,
      feedback: input.correctionFeedback,
    });
    // Quote copied verbatim from the REDACTED transcript it received:
    const line = input.meeting.transcript.split("\n")[1]!; // "PERSON_x: Det gør jeg faktisk selv."
    const [speaker, ...rest] = line.split(": ");
    return {
      meetingId: input.meeting.id,
      rubricId: input.rubric.id,
      rubricVersion: input.rubric.version,
      dimensions: [
        {
          dimensionKey: "power",
          score: 8,
          confidence: "customer_stated",
          evidence: [{ speaker: speaker!, text: rest.join(": ") }],
          reasoning: `Budgettet ejes af ${speaker} selv.`,
        },
      ],
      happyEars: [],
      missedSignals: [],
      verdict: `${speaker} bekræftede ejerskab.`,
    };
  }
}

describe("RedactingProvider", () => {
  it("never lets real names/companies reach the inner engine", async () => {
    const spy = new SpyProvider();
    const provider = new RedactingProvider(spy);
    await provider.analyzeMeeting({ rubric, meeting });
    const sent = spy.seen[0]!;
    for (const secret of ["Anna", "Larsen", "Mads", "Berg", "Nordkap"]) {
      expect(sent.transcript).not.toContain(secret);
      expect(sent.sellerSpeaker).not.toContain(secret);
      expect(sent.sellerGoal ?? "").not.toContain(secret);
    }
  });

  it("de-redacts results so evidence validates against the ORIGINAL transcript end-to-end", async () => {
    const spy = new SpyProvider();
    const provider = new RedactingProvider(spy);
    const result = await analyzeMeeting(provider, rubric, meeting);
    expect(result.degraded).toBeUndefined(); // quote survived validation against original
    expect(result.dimensions[0]!.evidence[0]!.speaker).toBe("Mads Berg");
    expect(result.dimensions[0]!.reasoning).toContain("Mads Berg");
    expect(result.verdict).toContain("Mads Berg");
  });

  it("redacts correction feedback before it reaches the inner engine", async () => {
    const spy = new SpyProvider();
    const provider = new RedactingProvider(spy);
    await provider.analyzeMeeting({
      rubric,
      meeting,
      correctionFeedback: 'quote not found: "Mads Berg: Det gør jeg faktisk selv."',
    });
    expect(spy.seen[0]!.feedback).not.toContain("Mads");
    expect(spy.seen[0]!.feedback).toContain("PERSON_");
  });

  it("exposes the map so UIs can show exactly what was sent", async () => {
    const spy = new SpyProvider();
    const provider = new RedactingProvider(spy);
    await provider.analyzeMeeting({ rubric, meeting });
    expect(provider.lastMap.length).toBeGreaterThan(0);
    expect(provider.lastMap.some((e) => e.kind === "company")).toBe(true);
  });
});
