---
name: add-episode
description: Transcribe and publish new Завтракаст archive episodes end to end — select, fetch, split, Whisper-transcribe, normalize, curate editorial.json, validate, rebuild the playback catalog, test, commit per episode, and push (Cloudflare Pages deploys from main). Use when asked to add, transcribe, or curate podcast episodes, continue the transcription batch, or finalize episode data.
---

# Add / transcribe podcast episodes

End-to-end pipeline for adding Завтракаст episodes to «Синдром Дефицита Вау Голубь».
Works for both Claude Code and Codex; commands run from the repo root.

## Prerequisites

- **Whisper server** (whisper.cpp, `pfrankov/whisper-server`) must already be running at
  `http://127.0.0.1:12017` with model `large-v3-turbo-q5_0`. **Never kill or restart it** —
  it is long-running and shared. If it is down, tell the user instead of restarting it yourself.
- **Node**: `.nvmrc` pins 20.19.3, but `vinext build` requires Node 22
  (`fs.promises.glob`). Use `nvm use 22` for build/test steps; data scripts run on either.
- Raw audio and chunk output live under the gitignored `.cache/`. Only
  `data/episodes/<id>/transcript.json` and `editorial.json` are committed.

## Pipeline (per batch)

1. **Select episodes** — metadata into `data/episodes/<id>/`:
   `npm run data:select` (or `data:select:extra` for additional picks; `data:select:check` to verify).
   Add a cover as `public/covers/<id>.jpg`.
2. **Fetch audio** — `npm run data:fetch` (downloads into `.cache/`).
3. **Split into chunks** — `npm run data:split`.
4. **Transcribe** (resumable — completed chunks in `.cache/whisper/<id>/` are skipped on rerun):
   ```sh
   WHISPER_API_BASE=http://localhost:12017 \
   WHISPER_MODEL=large-v3-turbo-q5_0 \
   npm run data:transcribe -- --all
   ```
   This can run for hours; poll progress rather than restarting. Only one transcription
   run at a time — if a session already has it running, wait for it.
5. **Normalize** each finished episode:
   `TMPDIR=/private/tmp npm run data:normalize -- --episode zc-XXX`
   (`TMPDIR=/private/tmp` because `tsx` needs local IPC pipes that sandboxed tmp dirs reject;
   escalate sandbox permissions if the command is blocked.)
6. **Editorial curation** — hand-write `data/episodes/<id>/editorial.json`, following the
   shape and style of `data/episodes/zc-02/editorial.json`:
   - meaningful topics with `title`, `summary`, `startSec`, `endSec`;
   - minute clips whose boundaries land on normalized phrase boundaries;
   - exclusions for intro/outro, music, ads, and technical pauses.
7. **Validate**: `TMPDIR=/private/tmp npm run data:validate -- --episode zc-XXX`
   (or `-- --all` for the whole catalog).
8. **Commit per episode** (keeps the batch resumable):
   ```sh
   git add data/episodes/zc-XXX/transcript.json data/episodes/zc-XXX/editorial.json
   git commit -m "feat: curate <short episode description> archive data"
   ```

## Finalization (after the whole batch)

1. `TMPDIR=/private/tmp npm run data:validate -- --all`
2. `TMPDIR=/private/tmp npm run data:build -- --all` — rebuilds the playback index/catalog.
3. Update episode/topic/minute counts in `README.md` from the validator output.
4. Verify: `npm run typecheck && npm run lint && npm test`
   (and `npm run test:e2e:production` when touching playback-critical data).
5. Commit generated catalog changes and `git push`.

## Deployment

Hosting is **Cloudflare Pages** connected to the GitHub repo
(`git@github.com:m0rg0t/vau-golub.git`): pushing `main` triggers the production deploy.
There is no manual deploy step. Do not create new hosting projects.

## Safety

- Preserve the running Whisper server and the resumable `.cache/` outputs.
- Never commit raw audio, chunks, or credentials.
- Per-episode commits only; avoid destructive git commands so parallel agents can resume.
- Другой агент может работать параллельно в этом же дереве — не добавляйте в коммит
  чужие незакоммиченные файлы (`git add` только свои пути, никогда `git add -A`).
