# Ghost Detector: project rules

An Android-first Expo app that looks and behaves like a piece of paranormal field equipment. Readings are simulated and the store listing says so.

## Read first
1. `docs/MASTER-PLAN.md` is binding: scope, team, phases, gates, craft rules, red lines, owner decisions (§0).
2. `docs/research/2026-10-research-digest.md` holds researched facts with sources. Do not redo that research; re-check items marked [U].
3. `inspiration/` is re-read at the start of every design round.
4. `PROGRESS.md` is the live state. `features.json` is the contract. `docs/decisions.md` is the panel log.

## Session start (every session, every resume)
```
pwd && git log --oneline -20 && cat PROGRESS.md && ./init.sh && pnpm smoke
```
Only then do any work.

## Roles
- The Director (orchestrator session) plans, writes sprint contracts, delegates, judges and merges. It never writes feature code.
- Workers are the agents in `.claude/agents/`. Every agent file pins a `model`. Never add an agent without one.
- Dr. Hollow is the core voice. Every non-trivial decision goes through the panel protocol in plan §3 and is logged in `docs/decisions.md`. Dr. Hollow's score counts double.
- Compliance holds a hard veto. Plan §7 red lines and §8 ad rules are not negotiable.
- The Refuter (a different model from the builder) must fail to disprove a claim before it counts.

## Rules
- Proof beats prose. `passes:true` in `features.json` needs an `evidence` entry (command output, screenshot or video path) and a Refuter sign-off. Builders and QA may only add evidence; the Director flips `passes`.
- One `claude/p<N>-<slug>` branch and one PR per phase. CI must be green. Commit small and often. Conventional commits. Never name any AI model in commit messages, PR titles or PR bodies; that includes `Co-Authored-By` trailers. A `Claude-Session:` trailer with the session URL is fine. Phase PRs are squash-merged with a clean message.
- Simplicity: copy the smallest proven pattern; no new layer until something hurts.
- Licence ledger: every image, font or sound goes into `assets/LICENSES.md` with source URL, licence and author. No clear licence, no ship. Ghost source images: public domain or CC0 only, then distorted.
- Craft rules in plan §6 bind every agent: one instrument, one phosphor hue, two type faces, banned visual tells, banned copy words (delve, tapestry, pivotal, crucial, intricate, testament, foster, landscape, underscore), no em-dash asides.
- File ownership: `app/`, `src/ui/`, `src/state/`, `src/ads/`, `src/analytics/` and `src/i18n/` Builder A; `docs/privacy-policy.md`, `docs/data-safety.md`, `docs/impressum.md` Compliance; `src/engine/` Builder B; `src/fx/` FX Engineer; `src/audio/` Sound & Haptics; `locales/` Copy; `e2e/web/`, `e2e/screenshots/` and `.github/workflows/` QA; `eas.json`, `.eas/` and `e2e/maestro/` Release. Stay inside your tree.
- Agent teams are off. Fan-out uses the Workflow tool with at most 10 agents per run.
- `isolation: worktree` branches from the default branch, not the current HEAD. Do not use it while the phase branch is ahead of `main`; give agents disjoint file trees instead.

## Human gates (pause and message David)
Gate 1 at the end of P1 (name and icon), phone checks at P2, P4 and P8, Gate 2 at P9 (store listing), and blockers only he can clear.

## Tooling
pnpm, Expo SDK 57 with expo-router and expo-dev-client, TypeScript strict, ESLint at 0 warnings, Vitest for the engine, Playwright for the L2 web screenshot harness, EAS Workflows with Maestro for L3. Skills installed at project scope: Expo plugin, frontend-design, Impeccable (`.claude/settings.json`).
