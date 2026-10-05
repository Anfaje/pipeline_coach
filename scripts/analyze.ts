/**
 * CLI: parse a transcript file, run the analysis pipeline, print the scores.
 *
 *   ANTHROPIC_API_KEY=... npm run analyze -- path/to/transcript.txt --seller "Anna"
 *
 * Options:
 *   --seller <label>     speaker label identifying the seller (required if >1 speaker)
 *   --provider <name>    analysis engine (default: anthropic, or HPC_PROVIDER env)
 *   --goal "<text>"      the seller's goal for this meeting (optional context)
 */
import { readFileSync } from "node:fs";
import rubricJson from "../src/rubric/healthy-pipeline.v2.json";
import { analyzeMeeting } from "../src/core/analyze.js";
import { decodeTranscript } from "../src/core/encoding.js";
import { parseTranscript, toCanonicalText } from "../src/core/transcriptParser.js";
import { resolveSpeaker } from "../src/core/speakers.js";
import { addMeeting, loadDeal, saveDeal } from "../src/core/dealStore.js";
import { renderDealState } from "../src/core/renderDeal.js";
import type { Meeting, Rubric } from "../src/core/types.js";
import { createProvider } from "../src/providers/factory.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!file) {
  console.error(
    [
      "Usage:",
      '  npm run analyze -- <transcript-file> --seller <name> [--deal <name>] [--date YYYY-MM-DD] [--goal <text>] [--provider <name>]',
      "",
      "--deal attaches this meeting to a named deal (stored locally in .hpc/) and prints",
      "the merged deal state afterwards — scores accumulate across meetings with staleness.",
      "",
      'Note the standalone "--" (with spaces around it) after "analyze": npm only passes',
      "arguments through after it. Without it, npm swallows your flags. Equivalent without npm:",
      '  npx tsx scripts/analyze.ts <transcript-file> --seller <name>',
    ].join("\n"),
  );
  process.exit(1);
}

const rubric = rubricJson as Rubric;
const decoded = decodeTranscript(new Uint8Array(readFileSync(file)));
if (decoded.encoding !== "utf-8") console.log(`Encoding: ${decoded.encoding} (converted)`);
const parsed = parseTranscript(decoded.text);
for (const w of parsed.warnings) console.warn(`⚠ ${w}`);
console.log(`Format: ${parsed.format} · Speakers: ${parsed.speakers.join(", ")} · Languages: ${parsed.languages.join(", ") || "unknown"}`);
if (parsed.affiliations.length) {
  // Companies in speaker labels must never reach the model — add them to the redaction terms.
  process.env.HPC_REDACT_TERMS = [process.env.HPC_REDACT_TERMS, ...parsed.affiliations]
    .filter(Boolean)
    .join(",");
  console.log(`Affiliations redacted: ${parsed.affiliations.join(", ")}`);
}

let seller: string;
const sellerArg = opt("seller");
if (!sellerArg) {
  if (parsed.speakers.length === 1) {
    seller = parsed.speakers[0]!;
  } else {
    console.error(`Multiple speakers detected (${parsed.speakers.join(", ")}). The parser never guesses who the seller is — pass --seller <name>.`);
    process.exit(1);
  }
} else {
  const r = resolveSpeaker(sellerArg, parsed.speakers);
  if (!r.speaker) {
    console.error(
      r.matches.length
        ? `--seller "${sellerArg}" is ambiguous between: ${r.matches.join(", ")}. Be more specific.`
        : `--seller "${sellerArg}" doesn't match any detected speaker: ${parsed.speakers.join(", ")}`,
    );
    process.exit(1);
  }
  seller = r.speaker;
  if (seller !== sellerArg) console.log(`Seller: "${sellerArg}" → ${seller}`);
}

const dealName = opt("deal");
const deal = dealName ? loadDeal(process.cwd(), dealName) : null;
const meeting: Meeting = {
  id: `cli-${Date.now()}`,
  dealId: deal ? dealName! : "cli",
  date: opt("date") ?? new Date().toISOString().slice(0, 10),
  sequence: deal ? deal.meetings.length + 1 : 1,
  languages: parsed.languages,
  transcript: toCanonicalText(parsed),
  sellerSpeaker: seller,
  sellerGoal: opt("goal"),
};

const provider = createProvider(opt("provider"));
console.log(`Engine: ${provider.id} · Rubric: ${rubric.id}@${rubric.version}\nAnalyzing...\n`);

const analysis = await analyzeMeeting(provider, rubric, meeting);
for (const d of analysis.dimensions) {
  const dim = rubric.dimensions.find((x) => x.key === d.dimensionKey);
  console.log(`${(dim?.name ?? d.dimensionKey).padEnd(8)} ${String(d.score).padStart(2)}/10  (${d.confidence})`);
  for (const q of d.evidence) console.log(`         ↳ ${q.speaker}: "${q.text}"`);
  console.log(`         ${d.reasoning}\n`);
}
if (analysis.craft?.length) {
  console.log("Seller craft (your skill this meeting, separate from the deal):");
  for (const c of analysis.craft) {
    const metric = rubric.sellerCraft?.metrics.find((m) => m.key === c.metricKey);
    console.log(`${(metric?.name ?? c.metricKey).padEnd(10)} ${String(c.score).padStart(2)}/10`);
    for (const cp of c.checkpoints ?? []) {
      console.log(`           ${cp.present ? "✓" : "✗"} ${cp.name}${cp.note ? ` — ${cp.note}` : ""}`);
      if (cp.quote) console.log(`             ↳ ${cp.quote.speaker}: "${cp.quote.text}"`);
    }
    for (const q of c.evidence) console.log(`           ↳ ${q.speaker}: "${q.text}"`);
    console.log(`           ${c.reasoning}`);
    if (c.misses.length) {
      console.log(`           Openings you left on the table:`);
      for (const m of c.misses) {
        console.log(`           · ${m.statement.speaker}: "${m.statement.text}"`);
        console.log(`             → ask: ${m.suggestedQuestion}`);
      }
    }
    console.log("");
  }
}
if (analysis.happyEars.length) {
  console.log("Happy ears:");
  for (const h of analysis.happyEars) console.log(`  ✗ ${h.assumption}\n    Reality: ${h.reality}`);
}
if (analysis.missedSignals.length) {
  console.log("\nMissed signals:");
  for (const s of analysis.missedSignals) console.log(`  → ${s}`);
}
console.log(`\nVerdict: ${analysis.verdict}`);
if (analysis.degraded) console.log("⚠ Analysis degraded: some cited evidence could not be verified; affected scores were capped.");

if (deal && dealName) {
  addMeeting(deal, {
    id: meeting.id,
    date: meeting.date,
    source: file.split("/").pop() ?? file,
    sellerSpeaker: meeting.sellerSpeaker,
    languages: meeting.languages,
    analysis,
  });
  const savedTo = saveDeal(process.cwd(), deal);
  console.log(`\nSaved as meeting ${deal.meetings.length} of deal "${dealName}" (${savedTo})`);
  console.log("");
  console.log(renderDealState(rubric, deal));
} else {
  console.log('\nTip: add --deal <name> to accumulate meetings on one account — scores then merge across meetings ("best evidence to date", with staleness decay) instead of each analysis standing alone.');
}
