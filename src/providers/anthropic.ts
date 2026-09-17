import type { Meeting, MeetingAnalysis, Rubric } from "../core/types.js";
import type { AnalysisProvider } from "./types.js";

/**
 * Tier A provider: Anthropic Messages API.
 * Model and endpoint are configuration, never hard-coded — see
 * https://docs.claude.com/en/api/overview for current models and options.
 *
 * Env:
 *   ANTHROPIC_API_KEY  (required)
 *   ANTHROPIC_MODEL    (default: claude-sonnet-4-6)
 *   ANTHROPIC_BASE_URL (default: https://api.anthropic.com)
 */

const buildPrompt = (
  rubric: Rubric,
  meeting: Meeting,
  correctionFeedback?: string,
): string => {
  const dims = rubric.dimensions
    .map(
      (d) =>
        `### ${d.name} (key: ${d.key})\nDefinition: ${d.definition}\nGuidance: ${d.analysisGuidance}\nStrong evidence example: ${d.highExample}\nWeak evidence example: ${d.lowExample}`,
    )
    .join("\n\n");
  const bands = rubric.bands
    .map((b) => `${b.min}-${b.max} ${b.label}: ${b.description}`)
    .join("\n");

  return [
    `You are a sales coach scoring one meeting transcript against the "${rubric.name}" framework (rubric version ${rubric.version}).`,
    `The seller is the speaker labeled "${meeting.sellerSpeaker}". The transcript may be in Danish, English, or mixed; analyze in whatever language the content is in, and write reasoning/verdict in the transcript's dominant language.`,
    meeting.sellerGoal ? `The seller's stated goal for this meeting: ${meeting.sellerGoal}` : "",
    `\n## Dimensions\n${dims}`,
    `\n## Score bands (0-10)\n${bands}`,
    `\n## Hard rules`,
    `- Every dimension score above 3 MUST cite 1-3 VERBATIM quotes from the transcript, each with its speaker label. Copy quotes character-for-character; never paraphrase.`,
    `- A statement made by the seller and merely acknowledged by the customer is confidence "seller_assumed"; the same content stated by the customer is "customer_stated". Seller-assumed evidence cannot score above 6.`,
    `- Also list happy-ears findings (assumptions the seller treated as confirmed that the customer never stated) and missed buying signals.`,
    correctionFeedback ? `\n## Correction required\n${correctionFeedback}` : "",
    `\n## Output`,
    `Respond with ONLY a JSON object, no markdown fences, matching:`,
    `{"dimensions":[{"dimensionKey":string,"score":number,"confidence":"customer_stated"|"seller_assumed","evidence":[{"speaker":string,"text":string}],"reasoning":string}],"happyEars":[{"assumption":string,"reality":string}],"missedSignals":[string],"verdict":string}`,
    `\n## Transcript\n${meeting.transcript}`,
  ]
    .filter(Boolean)
    .join("\n");
};

export class AnthropicProvider implements AnalysisProvider {
  readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(opts?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.model = opts?.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
    this.baseUrl =
      opts?.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
    this.id = `anthropic:${this.model}`;
    if (!this.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
  }

  async analyzeMeeting(input: {
    rubric: Rubric;
    meeting: Meeting;
    correctionFeedback?: string;
  }): Promise<MeetingAnalysis> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4000,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: buildPrompt(
              input.rubric,
              input.meeting,
              input.correctionFeedback,
            ),
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const text = data.content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as Omit<
      MeetingAnalysis,
      "meetingId" | "rubricId" | "rubricVersion"
    >;
    return {
      ...parsed,
      meetingId: input.meeting.id,
      rubricId: input.rubric.id,
      rubricVersion: input.rubric.version,
    };
  }
}
