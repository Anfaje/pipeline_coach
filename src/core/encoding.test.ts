import { describe, expect, it } from "vitest";
import { decodeTranscript } from "./encoding.js";

const enc = (s: string) => new TextEncoder().encode(s);

describe("decodeTranscript", () => {
  it("passes valid UTF-8 through untouched", () => {
    const r = decodeTranscript(enc("Søren: Vi taber to uger på omarbejde."));
    expect(r.encoding).toBe("utf-8");
    expect(r.text).toContain("Søren");
  });

  it("detects Mac Roman (å=0x8C, Ø=0xAF) from Danish exports", () => {
    // "Så Østergaard" in Mac Roman
    const bytes = new Uint8Array([0x53, 0x8c, 0x20, 0xaf, 0x73, 0x74, 0x65, 0x72, 0x67, 0x61, 0x61, 0x72, 0x64]);
    const r = decodeTranscript(bytes);
    expect(r.encoding).toBe("macintosh");
    expect(r.text).toBe("Så Østergaard");
  });

  it("detects windows-1252/latin1 (æ=0xE6, ø=0xF8, å=0xE5)", () => {
    // "æble på øen"
    const bytes = new Uint8Array([0xe6, 0x62, 0x6c, 0x65, 0x20, 0x70, 0xe5, 0x20, 0xf8, 0x65, 0x6e]);
    const r = decodeTranscript(bytes);
    expect(["windows-1252", "iso-8859-1"]).toContain(r.encoding);
    expect(r.text).toBe("æble på øen");
  });
});
