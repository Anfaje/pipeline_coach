import type { AnalysisProvider } from "./types.js";
import { AnthropicProvider } from "./anthropic.js";

/**
 * Provider factory (issue #2, brief §6 model strategy): the app depends only
 * on AnalysisProvider; which engine runs is configuration. New engines
 * (a local Ollama provider for Tier C, a redacting decorator for Tier B,
 * OpenAI-compatible endpoints, ...) register here without touching callers.
 *
 * Selection order: explicit argument > HPC_PROVIDER env > "anthropic".
 */

type ProviderFactory = () => AnalysisProvider;

const registry = new Map<string, ProviderFactory>();

export function registerProvider(name: string, factory: ProviderFactory): void {
  registry.set(name.toLowerCase(), factory);
}

export function availableProviders(): string[] {
  return [...registry.keys()];
}

export function createProvider(name?: string): AnalysisProvider {
  const selected = (name ?? process.env.HPC_PROVIDER ?? "anthropic").toLowerCase();
  const factory = registry.get(selected);
  if (!factory) {
    throw new Error(
      `Unknown analysis provider "${selected}". Available: ${availableProviders().join(", ")}`,
    );
  }
  return factory();
}

// Built-in engines. Construction is lazy: a missing ANTHROPIC_API_KEY only
// fails when the Anthropic provider is actually selected.
registerProvider("anthropic", () => new AnthropicProvider());
