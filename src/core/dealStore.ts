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

export function addMeeting(
  deal: DealFile,
  meeting: Omit<StoredMeeting, "sequence">,
): StoredMeeting {
  const stored: StoredMeeting = { ...meeting, sequence: deal.meetings.length + 1 };
  deal.meetings.push(stored);
  return stored;
}

export function listDeals(baseDir: string): string[] {
  const dir = dealsDir(baseDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}
