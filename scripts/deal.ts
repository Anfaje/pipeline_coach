/**
 * Show the merged state of a locally stored deal, or list deals.
 *   npm run deal -- <name>     npm run deal
 */
import rubricJson from "../src/rubric/healthy-pipeline.v1.json";
import { listDeals, loadDeal } from "../src/core/dealStore.js";
import { renderDealState } from "../src/core/renderDeal.js";
import type { Rubric } from "../src/core/types.js";

const name = process.argv[2];
if (!name) {
  const deals = listDeals(process.cwd());
  console.log(deals.length ? `Deals in .hpc/deals/:\n  ${deals.join("\n  ")}` : "No deals stored yet. Analyze with --deal <name> to start one.");
  process.exit(0);
}
const deal = loadDeal(process.cwd(), name);
if (!deal.meetings.length) {
  console.log(`Deal "${name}" has no analyzed meetings yet.`);
  process.exit(0);
}
console.log(renderDealState(rubricJson as Rubric, deal));
console.log("\nMeetings:");
for (const m of deal.meetings) {
  console.log(`  ${m.sequence}. ${m.date} · ${m.source} · ${(m.analysis.verdict || "").slice(0, 80)}`);
}
