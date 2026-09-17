import type { Meeting, MeetingAnalysis, Rubric } from "../core/types.js";
import type { AnalysisProvider } from "./types.js";

/** Scripted provider for tests: returns queued analyses in order. */
export class MockProvider implements AnalysisProvider {
  readonly id = "mock";
  calls: Array<{ correctionFeedback?: string }> = [];
  private queue: MeetingAnalysis[];

  constructor(queue: MeetingAnalysis[]) {
    this.queue = [...queue];
  }

  async analyzeMeeting(input: {
    rubric: Rubric;
    meeting: Meeting;
    correctionFeedback?: string;
  }): Promise<MeetingAnalysis> {
    this.calls.push({ correctionFeedback: input.correctionFeedback });
    const next = this.queue.shift();
    if (!next) throw new Error("MockProvider queue empty");
    return { ...next, meetingId: input.meeting.id };
  }
}
