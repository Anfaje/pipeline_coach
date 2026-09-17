#!/usr/bin/env bash
# One-time GitHub setup: repo, labels, milestones, and the initial issue
# backlog from the product brief. Requires the GitHub CLI, authenticated:
#   gh auth login
# Then run from the repo root:
#   ./scripts/bootstrap-github.sh [repo-name]
set -euo pipefail

REPO_NAME="${1:-healthy-pipeline-coach}"

echo "==> Creating private repo '$REPO_NAME' and pushing main..."
gh repo create "$REPO_NAME" --private --source=. --remote=origin --push

echo "==> Labels..."
gh label create feature      --color 1D76DB --description "Product feature (F1-F6 in the brief)" --force
gh label create infra        --color C5DEF5 --description "Tooling, CI, storage, deployment" --force
gh label create ai-quality   --color D93F0B --description "Scoring quality, prompts, calibration" --force
gh label create research     --color FBCA04 --description "Needs input or investigation before build" --force
gh label create bug          --color B60205 --description "Something behaves wrong" --force

echo "==> Milestones..."
gh api repos/{owner}/"$REPO_NAME"/milestones -f title="v0 — Personal tool"      -f description="Core loop usable daily: analyze, deal workspace, prep pack, happy-ears, basic trends" >/dev/null
gh api repos/{owner}/"$REPO_NAME"/milestones -f title="v0.5 — Calibrate"        -f description="Golden transcripts, rubric validation, score consistency" >/dev/null
gh api repos/{owner}/"$REPO_NAME"/milestones -f title="v1 — Polished product"   -f description="Pre-meeting mode, export, hosting, first external users" >/dev/null

issue () { # title, milestone, labels, body
  gh issue create --title "$1" --milestone "$2" --label "$3" --body "$4" >/dev/null
  echo "  • $1"
}

echo "==> Issues (v0)..."
issue "F1: Transcript parser — normalize Teams/Zoom copy-outs, detect speakers & languages" "v0 — Personal tool" "feature" \
"Parse pasted transcripts in common formats (Teams built-in, Zoom, plain notes). Detect speaker labels, ask which speaker is the seller when ambiguous, detect language(s) per Brief §6. Output: normalized Meeting object.

**Acceptance:** 3 real (redacted) transcript formats parse correctly; ambiguous seller triggers a question, not a guess."

issue "F1: Wire AnthropicProvider into the analysis pipeline end-to-end" "v0 — Personal tool" "feature,ai-quality" \
"src/providers/anthropic.ts exists; connect it to analyzeMeeting() behind an env-selected provider factory. Verify quote validation + retry against a real transcript. Model configurable via ANTHROPIC_MODEL — verify current model options at https://docs.claude.com/en/api/overview.

**Acceptance:** one real Danish and one English transcript produce a full MeetingAnalysis with verified quotes."

issue "Rubric v1 validation against B2B Klubben material" "v0 — Personal tool" "research,ai-quality" \
"src/rubric/healthy-pipeline.v1.json uses Solution Selling defaults. Validate every definition, band, and guidance line against B2B Klubben's actual teaching (course notes/slides). Their interpretation wins. Bump rubric version on changes (Brief §4)."

issue "F2: Storage layer — SQLite persistence for deals, meetings, analyses" "v0 — Personal tool" "infra" \
"Local-first per Brief §6 (privacy: single-user, one-action delete of a deal and all its data). Schema mirrors src/core/types.ts. Record rubric version and provider id on every analysis."

issue "F2: App scaffold + deal workspace UI" "v0 — Personal tool" "feature" \
"Next.js (or equivalent) app: deal list, deal view with five-dimension profile, per-meeting score history, paste-transcript flow. Radar/bar profile per Brief §5 F2."

issue "F3: Next-meeting prep pack generator" "v0 — Personal tool" "feature,ai-quality" \
"From deal-level scores: 2-3 weakest/stalest dimensions, 3-5 natural follow-up questions each in the meeting's language, suggested agenda, preparation actions (Brief §5 F3). Deterministic gap selection; LLM only phrases questions."

issue "F4: Happy-ears output section in the meeting debrief UI" "v0 — Personal tool" "feature" \
"Render happyEars findings and missedSignals prominently in the debrief (Brief §5 F4 — the 'ouch, but fair' feature)."

issue "F5: Personal trends — per-dimension aggregates across deals over time" "v0 — Personal tool" "feature" \
"Average score per dimension over time, chronic weak spots, coaching-toned framing (Brief §5 F5). Deterministic math in core, tested."

issue "F6: Rubric editor — raw JSON view with versioning" "v0 — Personal tool" "feature" \
"View/edit rubric config in-app; every save bumps version; analyses record the version that produced them (Brief §5 F6 — the productization seam)."

echo "==> Issues (v0.5)..."
issue "Calibration harness: golden transcripts as a regression suite" "v0.5 — Calibrate" "ai-quality,infra" \
"Score 5-10 real historical transcripts, store expected per-dimension scores, add a harness comparing any provider/prompt/rubric change against them (Brief §7, §6 model strategy). Consistency target: ±1 per dimension across runs."

issue "Prompt tuning for Danish and mixed-language transcripts" "v0.5 — Calibrate" "ai-quality" \
"Evaluate hedged/euphemistic Danish phrasing, code-switching mid-sentence, and quote validation across character sets against the golden set."

echo "==> Issues (v1)..."
issue "Pre-meeting mode: paste agenda/context, get a question plan" "v1 — Polished product" "feature" \
"Brief §5 deferred list. Reuses prep-pack generation with agenda as extra context."

issue "Deal summary export (Markdown)" "v1 — Polished product" "feature" \
"One-file export of a deal: profile, meeting history, current gaps. Safety net for data ownership (Brief §8 open question)."

issue "Tier B: local redaction/pseudonymization hook before provider calls" "v1 — Polished product" "infra,ai-quality" \
"Design the redacting decorator around AnalysisProvider per Brief §6 deployment tiers: on-device pass strips names/companies/figures, re-maps locally after analysis."

echo "==> Done. Open: $(gh repo view "$REPO_NAME" --json url -q .url)"
