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
import rubricJson from "../src/rubric/healthy-pipeline.v1.json";
import { analyzeMeeting } from "../src/core/analyze.js";
import { parseTranscript, toCanonicalText } from "../src/core/transcriptParser.js";
import type { Meeting, Rubric } from "../src/core/types.js";
import { createProvider } from "../src/providers/factory.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!file) {
  console.error("Usage: npm run analyze -- <transcript-file> --seller <label> [--provider <name>] [--goal <text>]");
  process.exit(1);
}

const rubric = rubricJson as Rubric;
const parsed = parseTranscript(readFileSync(file, "utf8"));
for (const w of parsed.warnings) console.warn(`⚠ ${w}`);
console.log(`Format: ${parsed.format} · Speakers: ${parsed.speakers.join(", ")} · Languages: ${parsed.languages.join(", ") || "unknown"}`);

let seller = opt("seller");
if (!seller) {
  if (parsed.speakers.length === 1) {
    seller = parsed.speakers[0]!;
  } else {
    console.error(`Multiple speakers detected (${parsed.speakers.join(", ")}). The parser never guesses who the seller is — pass --seller <label>.`);
    process.exit(1);
  }
}
if (!parsed.speakers.includes(seller)) {
  console.error(`--seller "${seller}" is not among detected speakers: ${parsed.speakers.join(", ")}`);
  process.exit(1);
}

const meeting: Meeting = {
  id: `cli-${Date.now()}`,
  dealId: "cli",
  date: new Date().toISOString().slice(0, 10),
  sequence: 1,
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
