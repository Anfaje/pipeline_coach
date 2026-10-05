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
  const craftMetrics = rubric.sellerCraft?.metrics ?? [];
  if (craftMetrics.length) {
    const avgs = craftMetrics.map((metric) => {
      const scores = deal.meetings
        .map((m) => (m.analysis.craft ?? []).find((c) => c.metricKey === metric.key)?.score)
        .filter((s): s is number => typeof s === "number");
      return scores.length
        ? `${metric.name} ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}/10`
        : null;
    }).filter(Boolean);
    if (avgs.length) lines.push(`Your craft (avg per meeting, not deal state): ${avgs.join(" · ")}`);
  }
  const weakest = [...merged].sort((a, b) => a.score - b.score).slice(0, 2);
  lines.push(
    `Focus next: ${weakest
      .map((w) => rubric.dimensions.find((d) => d.key === w.dimensionKey)?.name ?? w.dimensionKey)
      .join(" and ")}`,
  );
  return lines.join("\n");
}
