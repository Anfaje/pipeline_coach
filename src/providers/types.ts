import type { Meeting, MeetingAnalysis, Rubric } from "../core/types.js";

/**
 * The model-agnostic analysis contract (brief §6): rubric + transcript in,
 * strict structured analysis out. Everything engine-specific lives behind
 * this interface. Deployment tiers A/B/C are different implementations
 * (or wrappers, e.g. a redacting decorator for Tier B).
 */
export interface AnalysisProvider {
  /** Human-readable id, recorded alongside analyses for calibration. */
  readonly id: string;

  analyzeMeeting(input: {
    rubric: Rubric;
    meeting: Meeting;
    /** Feedback appended on retry, e.g. which quotes failed validation. */
    correctionFeedback?: string;
  }): Promise<MeetingAnalysis>;
}
