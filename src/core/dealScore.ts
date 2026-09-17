import type {
  DealDimensionScore,
  MeetingAnalysis,
  Rubric,
} from "./types.js";

/**
 * Deal-level scoring (brief §4): per dimension, the deal carries the best
 * verified evidence to date, with decay — evidence older than N meetings
 * without reconfirmation drops one band, because deals go stale.
 *
 * Deterministic by design: the LLM judges single meetings; this code owns
 * aggregation. Analyses must be supplied with their meeting sequence.
 */

export interface SequencedAnalysis {
  sequence: number;
  meetingId: string;
  analysis: MeetingAnalysis;
}

function bandFloor(rubric: Rubric, score: number): number {
  const band = rubric.bands.find((b) => score >= b.min && score <= b.max);
  return band ? band.min : 0;
}

/** Drop a score by `bands` band(s): it lands on the max of the target band. */
function decayScore(rubric: Rubric, score: number, bands: number): number {
  let current = score;
  for (let i = 0; i < bands; i++) {
    const floor = bandFloor(rubric, current);
    const idx = rubric.bands.findIndex((b) => b.min === floor);
    const lower = rubric.bands[idx - 1];
    current = lower ? lower.max : rubric.bands[0]?.min ?? 0;
  }
  return current;
}

export function mergeDealScores(
  rubric: Rubric,
  analyses: SequencedAnalysis[],
): DealDimensionScore[] {
  if (analyses.length === 0) return [];
  const latestSequence = Math.max(...analyses.map((a) => a.sequence));

  return rubric.dimensions.map((dim) => {
    // Best evidence to date: highest score; ties resolved to the most
    // recent meeting (fresher confirmation of equal strength wins).
    let best: { score: number; sequence: number; meetingId: string } | null =
      null;
    for (const a of analyses) {
      const d = a.analysis.dimensions.find(
        (x) => x.dimensionKey === dim.key,
      );
      if (!d) continue;
      if (
        best === null ||
        d.score > best.score ||
        (d.score === best.score && a.sequence > best.sequence)
      ) {
        best = { score: d.score, sequence: a.sequence, meetingId: a.meetingId };
      }
    }

    if (best === null) {
      return {
        dimensionKey: dim.key,
        score: 0,
        rawScore: 0,
        sourceMeetingId: "",
        sourceSequence: 0,
        meetingsSinceEvidence: latestSequence,
        stale: false,
      };
    }

    const meetingsSinceEvidence = latestSequence - best.sequence;
    const stale =
      meetingsSinceEvidence > rubric.staleness.meetingsBeforeDecay &&
      best.score > rubric.bands[0]!.max;
    const score = stale
      ? decayScore(rubric, best.score, rubric.staleness.decayBands)
      : best.score;

    return {
      dimensionKey: dim.key,
      score,
      rawScore: best.score,
      sourceMeetingId: best.meetingId,
      sourceSequence: best.sequence,
      meetingsSinceEvidence,
      stale,
    };
  });
}
