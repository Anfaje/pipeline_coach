import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { MeetingAnalysis } from "./types.js";

/**
 * CLI-local deal memory (brief §5 F2, local-first). One JSON file per deal
 * under <baseDir>/.hpc/deals/. Stores analyses and metadata — NOT the
 * transcript itself, which stays wherever the user keeps it. The folder
 * must never be committed (.gitignore covers it): analyses contain real
 * names, since de-redaction happens before storage.
 */

export interface StoredMeeting {
  id: string;
  date: string;
  sequence: number;
  /** Content fingerprint of the canonical transcript — the identity of a
   *  meeting. Re-analyzing the same transcript REPLACES, never duplicates. */
  transcriptHash?: string;
  /** Source file name, for the user's own reference. */
  source: string;
  sellerSpeaker: string;
  languages: string[];
  analysis: MeetingAnalysis;
}

export interface DealFile {
  name: string;
  createdAt: string;
  meetings: StoredMeeting[];
}

export const slugify = (name: string): string =>
  name.toLowerCase().trim().replace(/[^a-z0-9æøå]+/g, "-").replace(/^-+|-+$/g, "") || "deal";

const dealsDir = (baseDir: string): string => join(baseDir, ".hpc", "deals");
const dealPath = (baseDir: string, name: string): string =>
  join(dealsDir(baseDir), `${slugify(name)}.json`);

export function loadDeal(baseDir: string, name: string): DealFile {
  const p = dealPath(baseDir, name);
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as DealFile;
  return { name, createdAt: new Date().toISOString(), meetings: [] };
}

export function saveDeal(baseDir: string, deal: DealFile): string {
  mkdirSync(dealsDir(baseDir), { recursive: true });
  const p = dealPath(baseDir, deal.name);
  writeFileSync(p, JSON.stringify(deal, null, 2) + "\n");
  return p;
}

/** Whitespace-insensitive content fingerprint of a canonical transcript. */
export const transcriptHash = (canonical: string): string =>
  createHash("sha256").update(canonical.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);

/** Meeting identity: content hash when present, else source file name (legacy entries). */
const meetingKey = (m: { transcriptHash?: string; source: string }): string =>
  m.transcriptHash ? `h:${m.transcriptHash}` : `s:${m.source}`;

/**
 * Normalize a deal in place: collapse duplicates (same transcript analyzed
 * more than once keeps only the MOST RECENT analysis), order meetings by
 * date, and renumber sequences 1..n. Returns how many duplicates collapsed.
 */
export function normalizeDeal(deal: DealFile): number {
  const byKey = new Map<string, StoredMeeting>();
  for (const m of deal.meetings) byKey.set(meetingKey(m), m); // later wins
  const collapsed = deal.meetings.length - byKey.size;
  deal.meetings = [...byKey.values()].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  deal.meetings.forEach((m, i) => (m.sequence = i + 1));
  return collapsed;
}

/**
 * Add or replace a meeting by content identity, then normalize. Re-running
 * the same transcript revises the stored analysis instead of appending.
 */
export function upsertMeeting(
  deal: DealFile,
  meeting: Omit<StoredMeeting, "sequence">,
): { stored: StoredMeeting; replaced: boolean; collapsed: number } {
  const key = meetingKey(meeting);
  const existingIdx = deal.meetings.findIndex((m) => meetingKey(m) === key);
  const replaced = existingIdx >= 0;
  const stored: StoredMeeting = {
    ...meeting,
    sequence: replaced ? deal.meetings[existingIdx]!.sequence : deal.meetings.length + 1,
    id: replaced ? deal.meetings[existingIdx]!.id : meeting.id,
  };
  if (replaced) deal.meetings[existingIdx] = stored;
  else deal.meetings.push(stored);
  const collapsed = normalizeDeal(deal) - (0);
  return { stored, replaced, collapsed };
}

export function listDeals(baseDir: string): string[] {
  const dir = dealsDir(baseDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}
