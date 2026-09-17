/** Core domain types. Mirrors "Data model & architecture" in the product brief. */

export type BandLabel =
  | "not_addressed"
  | "touched_unverified"
  | "established"
  | "customer_articulated";

export type ConfidenceFlag = "customer_stated" | "seller_assumed";

export interface RubricBand {
  min: number;
  max: number;
  label: BandLabel;
  description: string;
}

export interface RubricDimension {
  key: string;
  name: string;
  definition: string;
  analysisGuidance: string;
  highExample: string;
  lowExample: string;
}

export interface Rubric {
  id: string;
  version: string;
  name: string;
  source: string;
  staleness: {
    /** Meetings without reconfirmation before a dimension's evidence decays. */
    meetingsBeforeDecay: number;
    /** How many bands the score drops when stale. */
    decayBands: number;
  };
  bands: RubricBand[];
  dimensions: RubricDimension[];
}

export interface EvidenceQuote {
  speaker: string;
  text: string;
}

export interface DimensionAnalysis {
  dimensionKey: string;
  /** 0-10, banded per rubric. Scores above 3 REQUIRE validated evidence quotes. */
  score: number;
  confidence: ConfidenceFlag;
  evidence: EvidenceQuote[];
  reasoning: string;
}

export interface HappyEarsFinding {
  /** Assumption the seller treated as confirmed that the customer never stated. */
  assumption: string;
  /** What was actually said (or not said). */
  reality: string;
}

export interface MeetingAnalysis {
  meetingId: string;
  rubricId: string;
  rubricVersion: string;
  dimensions: DimensionAnalysis[];
  happyEars: HappyEarsFinding[];
  missedSignals: string[];
  verdict: string;
  /** Set when quote validation failed even after retry; affected scores were capped. */
  degraded?: boolean;
}

export type DealStatus = "active" | "won" | "lost" | "parked";

export interface Deal {
  id: string;
  customer: string;
  offering: string;
  status: DealStatus;
  notes: string;
  createdAt: string;
}

export interface Meeting {
  id: string;
  dealId: string;
  date: string;
  /** 1-based sequence within the deal. */
  sequence: number;
  languages: string[];
  transcript: string;
  sellerGoal?: string;
  /** Speaker label in the transcript identifying the seller. */
  sellerSpeaker: string;
}

export interface DealDimensionScore {
  dimensionKey: string;
  /** Effective score after staleness decay. */
  score: number;
  /** Raw best score before decay. */
  rawScore: number;
  sourceMeetingId: string;
  sourceSequence: number;
  /** Meetings elapsed since the evidence was last confirmed. */
  meetingsSinceEvidence: number;
  stale: boolean;
}
