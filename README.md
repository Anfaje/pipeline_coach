# Healthy Pipeline Coach

A private AI sales coach for consultants. Paste a meeting transcript, get an
evidence-backed score against **The Healthy Pipeline** framework — Pain,
Power, Vision, Value, Control — plus a preparation pack for the next meeting.

Product brief & specification: see the Claude doc *"Healthy Pipeline Coach —
Product Brief & Specification"* (source of truth for scope and rationale).

## Architecture in one paragraph

The intelligence is layered (brief §6): the **rubric** is versioned JSON
config (`src/rubric/`), the **analysis contract** is a model-agnostic
provider interface (`src/providers/types.ts`) returning strict JSON whose
evidence quotes are deterministically validated against the transcript
(`src/core/quoteValidator.ts` — no quote, no score above 3), and everything
downstream — deal-level merging with staleness decay, trends — is plain
tested TypeScript (`src/core/`). The LLM only judges single meetings.

## Getting started

```bash
npm install
npm run ci        # typecheck + tests
```

Analysis calls (Tier A) use the Anthropic API:

```bash
export ANTHROPIC_API_KEY=...
# optional: ANTHROPIC_MODEL (default claude-sonnet-4-6), ANTHROPIC_BASE_URL
```

Current models and API options: https://docs.claude.com/en/api/overview

## GitHub setup (one time)

```bash
gh auth login
./scripts/bootstrap-github.sh          # creates private repo, labels,
                                       # milestones v0/v0.5/v1, and the
                                       # issue backlog from the brief
```

## Conventions

- **Rubric changes bump the rubric version**; every stored analysis records
  the version (and provider id) that produced it, so trends stay honest.
- **Never commit transcripts.** Real transcripts contain customer-confidential
  material; test fixtures must be synthetic or heavily redacted.
- Deterministic logic gets unit tests; LLM judgment gets the calibration
  harness (golden transcripts, v0.5).
