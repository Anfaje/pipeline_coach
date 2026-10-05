import type {
  ConfidenceFlag,
  DimensionAnalysis,
  EvidenceQuote,
  HappyEarsFinding,
  MeetingAnalysis,
  Rubric,
} from "./types.js";

/**
 * Models occasionally drift from the requested JSON shape — a missed signal
 * as {"signal": "..."} instead of a string, a verdict as an object, a score
 * as "8". The analysis has been paid for by the time we parse it, so the
 * contract boundary coerces instead of crashing: every field is normalized
 * into MeetingAnalysis, unknowns degrade to sensible defaults, and scores
 * are clamped to 0-10. Quote validation downstream still rejects anything
 * that is not verbatim.
 */

const str = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const key of ["text", "signal", "description", "assumption", "reality", "quote", "value"]) {
      if (typeof o[key] === "string") return o[key] as string;
    }
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }
  return "";
};

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
};

const confidence = (v: unknown): ConfidenceFlag =>
  v === "customer_stated" ? "customer_stated" : "seller_assumed";

const quote = (v: unknown): EvidenceQuote => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { speaker: str(o.speaker), text: typeof v === "string" ? v : str(o.text ?? o.quote) };
};

const happy = (v: unknown): HappyEarsFinding => {
  if (typeof v === "string") return { assumption: v, reality: "" };
  const o = (v ?? {}) as Record<string, unknown>;
  return { assumption: str(o.assumption ?? o.text), reality: str(o.reality ?? o.whatWasSaid) };
};

export function coerceMeetingAnalysis(
  raw: unknown,
  ids: { meetingId: string; rubric: Rubric },
): MeetingAnalysis {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawDims = Array.isArray(o.dimensions) ? o.dimensions : [];
  const dimensions: DimensionAnalysis[] = rawDims.map((d) => {
    const x = (d ?? {}) as Record<string, unknown>;
    return {
      dimensionKey: str(x.dimensionKey ?? x.key ?? x.dimension),
      score: num(x.score),
      confidence: confidence(x.confidence),
      evidence: (Array.isArray(x.evidence) ? x.evidence : []).map(quote).filter((q) => q.text),
      reasoning: str(x.reasoning),
    };
  });
  // Guarantee every rubric dimension is present so UIs never render holes.
  for (const dim of ids.rubric.dimensions) {
    if (!dimensions.some((d) => d.dimensionKey === dim.key)) {
      dimensions.push({
        dimensionKey: dim.key,
        score: 0,
        confidence: "seller_assumed",
        evidence: [],
        reasoning: "Not assessed in the model's response.",
      });
    }
  }
  return {
    meetingId: ids.meetingId,
    rubricId: ids.rubric.id,
    rubricVersion: ids.rubric.version,
    dimensions,
    happyEars: (Array.isArray(o.happyEars) ? o.happyEars : []).map(happy).filter((h) => h.assumption),
    missedSignals: (Array.isArray(o.missedSignals) ? o.missedSignals : []).map(str).filter(Boolean),
    verdict: str(o.verdict),
  };
}
