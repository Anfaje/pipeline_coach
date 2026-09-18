# Healthy Pipeline Coach

**A private AI sales coach for consultants.** Paste a meeting transcript, get an honest, evidence-backed score against **The Healthy Pipeline** framework — *Pain, Power, Vision, Value, Control* — and a concrete preparation plan for your next meeting.

Consultants who sell their own expertise get no coaching. Sales tools are built for managers to inspect teams: recording bots, CRM dashboards, leaderboards. This project flips that. It is a **self-evaluation ritual**: after a customer meeting you paste the transcript, and instead of a generic summary you get an assessment against the methodology you were actually trained in — plus follow-up questions, preparation actions, and an agenda for the next conversation.

## Why this exists

The AI meeting-coach market clusters around teams: enterprise revenue intelligence (Gong, Chorus), mid-market coaching assistants (Attention, Sybill, Avoma), and CRM-integrated framework scorers (Demodesk, Revenue.io). All of them assume a recording bot in the meeting, a CRM to fill, and a manager reading the dashboard.

Nobody serves the individual consultant who wants to get better in private. That is the gap:

- **Self-coaching, not surveillance.** No bot joins the customer's call. No manager dashboard. You paste what you choose to analyze — a real trust and GDPR advantage when you work inside clients' Teams environments.
- **Methodology-native.** Every score and suggestion speaks The Healthy Pipeline's vocabulary. The rubric is a versioned, swappable config file — other methodologies are a config change, not a rebuild.
- **Deal-centric, not call-centric.** Qualification evidence accumulates across meetings. The core view is the deal: five dimensions filling in (or going stale) over the life of the relationship.
- **Forward-looking.** The score is the diagnosis; the product's real output is the prescription for the next meeting.
- **Bilingual by design.** Danish, English, and mixed-language transcripts are first-class.

## The framework

Each meeting is scored 0–10 per dimension, with hard rules that keep scores honest:

| Dimension | What gets scored |
| --- | --- |
| **Pain** | Did the customer articulate a concrete, admitted business problem — in their own words, with consequences? |
| **Power** | Do we know who owns budget and decision, and do we have access or a credible path to them? |
| **Vision** | Does the customer hold a concrete vision of solving the problem with our capabilities — ideally co-created? |
| **Value** | Is the value quantified and agreed *by the customer*, not just claimed by the seller? |
| **Control** | Does the seller control the process — agreed next step, owners, dates, path to decision? |

Two mechanics do most of the coaching work:

1. **Evidence or it didn't happen.** Every score above 3 must cite verbatim transcript quotes, and every quote is deterministically validated against the transcript. Fabricated or paraphrased evidence is rejected, retried once, then capped. No quote, no score.
2. **Customer-stated beats seller-assumed.** The same statement scores differently depending on who said it. A dedicated *happy ears* section lists assumptions the seller treated as confirmed that the customer never actually stated — the "ouch, but fair" moment.

Deal-level scores carry the best verified evidence to date, with staleness decay: evidence not reconfirmed within two meetings drops a band, because deals go stale quietly.

## Try it

Requirements: Node.js 22+, an Anthropic API key.

```bash
git clone https://github.com/Anfaje/pipeline_coach.git
cd pipeline_coach
npm install
npm run ci        # typecheck + 30 tests, no API key needed
```

Analyze a transcript from the command line:

```bash
export ANTHROPIC_API_KEY=sk-ant-...

npm run analyze -- meeting.txt --seller "Anna"
```

The parser accepts Teams copy-outs, WebVTT exports, Zoom transcripts, plain `Speaker: text` lines, or unstructured notes (with a warning — scoring quality drops without speakers). It detects Danish/English/mixed automatically and never guesses who the seller is: with multiple speakers, pass `--seller` with your speaker label.

Example output:

```
Pain      8/10  (customer_stated)
         ↳ Mads: "Vi taber cirka to uger per projekt på omarbejde."
         ...
Power     3/10  (seller_assumed)
         ...
Happy ears:
  ✗ Seller treated budget ownership as settled
    Reality: the customer only said the CFO "usually looks at these things"
```

Optional flags: `--goal "<your goal for the meeting>"` for better context, `--provider <name>` to select an analysis engine (`HPC_PROVIDER` env works too; default `anthropic`, model via `ANTHROPIC_MODEL`).

**Never commit transcripts.** Real transcripts contain customer-confidential material; test fixtures must be synthetic or heavily redacted.

## Architecture in one paragraph

The intelligence is layered so only one layer depends on a specific LLM. The **rubric** is versioned JSON config (`src/rubric/`). The **analysis contract** is a model-agnostic provider interface (`src/providers/`) returning strict JSON whose evidence quotes are deterministically validated against the transcript (`src/core/quoteValidator.ts`). Everything downstream — deal-level merging with staleness decay, trends — is plain, tested TypeScript (`src/core/`). The LLM only judges single meetings; engines are registered in a factory and swappable, which is also where the planned privacy tiers plug in: cloud EU (default), local redaction before anything leaves the machine, and fully local models for clients whose contracts bar third-party processing.

## Status & roadmap

Early and honest: the core engine, parser, and CLI work; the app around them is being built issue by issue.

| Phase | Scope |
| --- | --- |
| **v0 — Personal tool** (now) | Transcript analysis, deal workspace, prep pack, happy-ears, basic trends |
| **v0.5 — Calibrate** | Golden transcripts as a regression suite; rubric validated against the source methodology; ±1 score consistency |
| **v1 — Polished product** | Pre-meeting mode, deal export, hosting, first external users |
| **v2 — Practice & patterns** | Roleplay against an AI prospect on your weakest dimension; win/loss pattern analysis |

The current rubric uses well-documented Solution Selling-tradition defaults pending validation against The Healthy Pipeline's source material (see issues). Contributions and calibration feedback are welcome — open an issue.
