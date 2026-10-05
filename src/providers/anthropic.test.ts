import { afterEach, describe, expect, it, vi } from "vitest";
import rubricJson from "../rubric/healthy-pipeline.v2.json";
import { AnthropicProvider } from "./anthropic.js";
import type { Meeting, Rubric } from "../core/types.js";

const rubric = rubricJson as Rubric;
const meeting: Meeting = {
  id: "m", dealId: "d", date: "2026-10-01", sequence: 1, languages: ["da"],
  sellerSpeaker: "Anna", transcript: "Anna: Hej.\nMads: Hej.",
};
const respond = (body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));

afterEach(() => vi.unstubAllGlobals());

describe("AnthropicProvider response handling", () => {
  it("raises a clear error when the response was truncated (stop_reason max_tokens)", async () => {
    respond({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"dimensions":[{"dim' }] });
    const p = new AnthropicProvider({ apiKey: "k" });
    await expect(p.analyzeMeeting({ rubric, meeting })).rejects.toThrow(/truncated .* ANTHROPIC_MAX_TOKENS/s);
  });

  it("raises a clear error on malformed JSON instead of a bare SyntaxError", async () => {
    respond({ stop_reason: "end_turn", content: [{ type: "text", text: '{"dimensions": [oops' }] });
    const p = new AnthropicProvider({ apiKey: "k" });
    await expect(p.analyzeMeeting({ rubric, meeting })).rejects.toThrow(/not valid JSON/);
  });

  it("parses and coerces a valid response, sending the configured max_tokens", async () => {
    process.env.ANTHROPIC_MAX_TOKENS = "20000";
    respond({ stop_reason: "end_turn", content: [{ type: "text", text: '{"dimensions":[],"craft":[],"happyEars":[],"missedSignals":[],"verdict":"ok"}' }] });
    const p = new AnthropicProvider({ apiKey: "k" });
    const a = await p.analyzeMeeting({ rubric, meeting });
    expect(a.verdict).toBe("ok");
    expect(a.dimensions).toHaveLength(5);
    const sent = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(sent.max_tokens).toBe(20000);
    delete process.env.ANTHROPIC_MAX_TOKENS;
  });
});
