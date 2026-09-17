import { afterEach, describe, expect, it } from "vitest";
import { availableProviders, createProvider, registerProvider } from "./factory.js";
import { MockProvider } from "./mock.js";

describe("provider factory", () => {
  afterEach(() => {
    delete process.env.HPC_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("registers and creates providers by name", () => {
    registerProvider("test-mock", () => new MockProvider([]));
    expect(availableProviders()).toContain("test-mock");
    expect(createProvider("test-mock").id).toBe("mock");
  });

  it("selects via HPC_PROVIDER env when no name is given", () => {
    registerProvider("env-mock", () => new MockProvider([]));
    process.env.HPC_PROVIDER = "env-mock";
    expect(createProvider().id).toBe("mock");
  });

  it("throws a clear error for unknown providers", () => {
    expect(() => createProvider("does-not-exist")).toThrow(/Unknown analysis provider/);
  });

  it("defaults to anthropic, which fails lazily without an API key", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => createProvider()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("constructs the anthropic provider when a key is present", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const p = createProvider("anthropic");
    expect(p.id).toMatch(/^anthropic:/);
  });
});
