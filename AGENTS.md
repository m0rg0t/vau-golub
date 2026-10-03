# Agent guide

«Синдром Дефицита Вау Голубь» — static Russian-language player of random topics and
finished minutes from the Завтракаст podcast archive. Next.js (vinext) + Cloudflare
Pages; pushing `main` deploys production.

- Node: `.nvmrc` selects Node 24 LTS; current test tools require Node >=24.15.0.
- Verify with `npm run typecheck && npm run lint && npm test` before committing.
- Brand strings come from `src/app/brand.ts` — never hardcode the product name.
- Multiple agents may work in this tree in parallel: stage only your own paths
  (never `git add -A`), keep commits scoped and per-task.

## Skills

- **Adding / transcribing podcast episodes** — follow
  [`.claude/skills/add-episode/SKILL.md`](.claude/skills/add-episode/SKILL.md)
  for the full pipeline (select → fetch → split → Whisper transcribe → normalize →
  curate `editorial.json` → validate → build catalog → per-episode commits → push).
