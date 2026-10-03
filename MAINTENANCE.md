# Maintenance checks (2026-10-03)

Use Node 24 LTS (`.nvmrc`, >=24.15.0 for current jsdom), then `npm ci`.
The current stack is Vinext 1.0.1, Next 16.3.8, React/RSC 19.3, Vite 8.3.2,
Cloudflare Vite plugin 1.62.5, Wrangler 4.147 and Vitest 5.0.3.

- `npm run typecheck && npm run lint && npm test`: source/config checks, full
  Cloudflare-targeted build and 54 data/domain/component tests
- `npx playwright install chromium && PLAYWRIGHT_PRODUCTION=1 npm run test:e2e`:
  14 desktop/mobile scenarios including production HTML/metadata, accessible
  player navigation, transcript, denied storage and offline PWA behavior
- `npm start`: local built-worker preview through Cloudflare's `vite preview`
  runtime. It does not deploy, access production bindings or change hosting.

The former Node-only `dist/server/index.js` import test now runs as a real HTTP
request in the production browser suite, with every original HTML/metadata
assertion retained. The current Cloudflare bundle imports `cloudflare:workers`,
which plain Node cannot execute. Both browser projects exercise that response.
The browser fixture blocks off-origin requests, including remote podcast audio;
no paid transcription or archive-fetch commands are part of CI.

Restricted localStorage reads/writes now fall back to session state rather than
crashing the player. Two component tests reproduced the original errors and
four browser checks cover both operations on desktop/mobile. Catalogs, audio
links, transcripts, editorial selections and branding are unchanged.

## Compatibility and audit limits

- TypeScript 6.0.3 remains within the current typescript-eslint peer range (<6.1).
- ESLint 9.39.5 is the compatible exception: current eslint-plugin-react 7.37.5
  (through eslint-config-next) supports ESLint <=9 and crashes under 10.
  ESLint 9 itself is now deprecated; migrate when Next's React plugin supports
  the current ESLint API rather than disabling its checks or forcing peers.
- Node types stay on the runtime-matching 24.x line.
- A narrow fflate 0.7.5 override replaces Vinext/Satori's vulnerable pinned
  0.7.3 ZIP parser without crossing a minor release.
- Final audit still reports eight high-severity package paths caused by the
  single unfixed braces <=3.0.3 advisory GHSA-vfj7-8cjw-p6xm. The dependency is
  pulled through Next lint tooling and Vinext's build-time glob plugins. The
  registry's latest braces is still 3.0.3; audit's suggested major downgrades of
  Next/Vinext are not a compatible fix. Do not claim an audit-clean result.
  Review untrusted glob inputs and update when upstream publishes a fix.

Navigation also advances while the current episode data is still loading; a synthetic stalled-request test reproduces the previous ignored click. Runtime asset caching now observes late hydration downloads so offline reload can hydrate the app. Browser coverage waits for both dataset and runtime caches before disconnecting. CI explicitly installs ffprobe for the existing icon-dimension checks.

No deployment, merge, credential changes or production data writes occurred.
Physical-device PWA installation and real streamed playback need release checks.
