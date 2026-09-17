import type { AnalysisProvider } from "../providers/types.js";
import type { Meeting, MeetingAnalysis, Rubric } from "./types.js";
import { validateQuotes } from "./quoteValidator.js";

/**
 * Analysis pipeline (brief §6): (2) provider call → (3) validate that every
 * cited quote appears in the transcript; reject and retry once with the
 * failed quotes as feedback; if still invalid, cap the affected dimension
 * scores at the top of the lowest band and mark the analysis degraded.
 */

const UNEVIDENCED_CAP = 3; // "No quote, no score above 3."

function findInvalid(meeting: Meeting, analysis: MeetingAnalysis): string[] {
  const failures: string[] = [];
  for (const dim of analysis.dimensions) {
    if (dim.score > UNEVIDENCED_CAP) {
      if (dim.evidence.length === 0) {
        failures.push(`${dim.dimensionKey}: score ${dim.score} with no evidence quotes`);
        continue;
      }
      const result = validateQuotes(meeting.transcript, dim.evidence);
      for (const q of result.invalidQuotes) {
        failures.push(
          `${dim.dimensionKey}: quote not found in transcript: "${q.text}"`,
        );
      }
    }
  }
  return failures;
}

function capUnevidenced(
  meeting: Meeting,
  analysis: MeetingAnalysis,
): MeetingAnalysis {
  const dimensions = analysis.dimensions.map((dim) => {
    if (dim.score <= UNEVIDENCED_CAP) return dim;
    const { invalidQuotes } = validateQuotes(meeting.transcript, dim.evidence);
    const validEvidence = dim.evidence.filter(
      (q) => !invalidQuotes.includes(q),
    );
    if (validEvidence.length > 0) return { ...dim, evidence: validEvidence };
    return {
      ...dim,
      score: UNEVIDENCED_CAP,
      evidence: [],
      reasoning: `${dim.reasoning} [Score capped: cited evidence could not be verified in the transcript.]`,
    };
  });
  return { ...analysis, dimensions, degraded: true };
}

export async function analyzeMeeting(
  provider: AnalysisProvider,
  rubric: Rubric,
  meeting: Meeting,
): Promise<MeetingAnalysis> {
  const first = await provider.analyzeMeeting({ rubric, meeting });
  const failures = findInvalid(meeting, first);
  if (failures.length === 0) return first;

  const second = await provider.analyzeMeeting({
    rubric,
    meeting,
    correctionFeedback:
      "Some cited quotes were not found verbatim in the transcript. " +
      "Re-analyze and cite only exact verbatim passages. Failures:\n" +
      failures.join("\n"),
  });
  const secondFailures = findInvalid(meeting, second);
  if (secondFailures.length === 0) return second;

  return capUnevidenced(meeting, second);
}
