import { describe, expect, it } from "vitest";
import { resolveSpeaker } from "./speakers.js";

const speakers = ["Johan Broberg Binder", "Morten Østergaard"];

describe("resolveSpeaker", () => {
  it("matches exactly", () => {
    expect(resolveSpeaker("Johan Broberg Binder", speakers).speaker).toBe("Johan Broberg Binder");
  });
  it("matches a first name case-insensitively", () => {
    expect(resolveSpeaker("johan", speakers).speaker).toBe("Johan Broberg Binder");
  });
  it("matches any name word prefix, including Danish letters", () => {
    expect(resolveSpeaker("øster", speakers).speaker).toBe("Morten Østergaard");
    expect(resolveSpeaker("Binder", speakers).speaker).toBe("Johan Broberg Binder");
  });
  it("returns candidates instead of guessing when ambiguous", () => {
    const r = resolveSpeaker("o", ["Ole Holm", "Otto Friis"]);
    expect(r.speaker).toBeNull();
    expect(r.matches).toEqual(["Ole Holm", "Otto Friis"]);
  });
  it("returns no match cleanly", () => {
    const r = resolveSpeaker("Pernille", speakers);
    expect(r.speaker).toBeNull();
    expect(r.matches).toEqual([]);
  });
});
