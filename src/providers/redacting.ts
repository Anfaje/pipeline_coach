import type { Meeting, MeetingAnalysis, Rubric } from "../core/types.js";
import {
  buildRedactionMap,
  redactText,
  unredactText,
  type RedactionEntry,
} from "../core/redaction.js";
import type { AnalysisProvider } from "./types.js";

/**
 * Privacy decorator (Tier B, brief §6): wraps ANY analysis engine so that
 * only pseudonymized text ever reaches it. The map is built and applied
 * locally, deterministically; the engine's response is de-redacted locally
 * before anyone sees it.
 *
 * Because the pipeline (analyze.ts) validates evidence quotes against the
 * ORIGINAL transcript, de-redaction must be exact — which it is, since
 * placeholders are unique tokens and reversal is plain substitution.
 * Correction feedback from a retry contains original-space quotes, so it
 * is redacted with the same (deterministic) map before reaching the engine.
 */

const speakersFromCanonical = (transcript: string): string[] => {
  const set = new Set<string>();
  for (const line of transcript.split("\n")) {
    const m = line.match(/^([^:]{1,40}?):\s/u);
    if (m) set.add(m[1]!.trim());
  }
  return [...set];
};

export interface RedactingOptions {
  customTerms?: string[];
  allowList?: string[];
}

export class RedactingProvider implements AnalysisProvider {
  readonly id: string;
  /** The map from the most recent call — exposed so UIs can show exactly what was sent. */
  lastMap: RedactionEntry[] = [];

  constructor(
    private readonly inner: AnalysisProvider,
    private readonly opts: RedactingOptions = {},
  ) {
    this.id = `redacted(${inner.id})`;
  }

  async analyzeMeeting(input: {
    rubric: Rubric;
    meeting: Meeting;
    correctionFeedback?: string;
  }): Promise<MeetingAnalysis> {
    const { meeting } = input;
    const map = buildRedactionMap(meeting.transcript, {
      speakers: speakersFromCanonical(meeting.transcript),
      customTerms: this.opts.customTerms,
      allowList: this.opts.allowList,
    });
    this.lastMap = map;

    const redactedMeeting: Meeting = {
      ...meeting,
      transcript: redactText(meeting.transcript, map),
      sellerSpeaker: redactText(meeting.sellerSpeaker, map),
      sellerGoal: meeting.sellerGoal
        ? redactText(meeting.sellerGoal, map)
        : undefined,
    };

    const result = await this.inner.analyzeMeeting({
      rubric: input.rubric,
      meeting: redactedMeeting,
      correctionFeedback: input.correctionFeedback
        ? redactText(input.correctionFeedback, map)
        : undefined,
    });

    const un = (s: string) => unredactText(s, map);
    return {
      ...result,
      dimensions: result.dimensions.map((d) => ({
        ...d,
        reasoning: un(d.reasoning),
        evidence: d.evidence.map((q) => ({ speaker: un(q.speaker), text: un(q.text) })),
      })),
      happyEars: result.happyEars.map((h) => ({
        assumption: un(h.assumption),
        reality: un(h.reality),
      })),
      missedSignals: result.missedSignals.map(un),
      verdict: un(result.verdict),
    };
  }
}
