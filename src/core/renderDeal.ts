import { mergeDealScores } from "./dealScore.js";
import type { DealFile } from "./dealStore.js";
import type { Rubric } from "./types.js";

/** Plain-text deal state: merged five-dimension profile with staleness. */
export function renderDealState(rubric: Rubric, deal: DealFile): string {
  const merged = mergeDealScores(
    rubric,
    deal.meetings.map((m) => ({ sequence: m.sequence, meetingId: m.id, analysis: m.analysis })),
  );
  const lines = [
    `Deal "${deal.name}" — ${deal.meetings.length} meeting${deal.meetings.length === 1 ? "" : "s"} analyzed`,
  ];
  for (const dim of rubric.dimensions) {
    const s = merged.find((x) => x.dimensionKey === dim.key)!;
    const bar = "█".repeat(s.score) + "░".repeat(10 - s.score);
    const src = s.sourceSequence ? `from meeting ${s.sourceSequence}` : "no evidence yet";
    const stale = s.stale ? ` — STALE: was ${s.rawScore}, not reconfirmed for ${s.meetingsSinceEvidence} meetings` : "";
    lines.push(`${dim.name.padEnd(8)} ${String(s.score).padStart(2)}/10 ${bar}  ${src}${stale}`);
  }
  const weakest = [...merged].sort((a, b) => a.score - b.score).slice(0, 2);
  lines.push(
    `Focus next: ${weakest
      .map((w) => rubric.dimensions.find((d) => d.key === w.dimensionKey)?.name ?? w.dimensionKey)
      .join(" and ")}`,
  );
  return lines.join("\n");
}
