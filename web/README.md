# sendm8 — web

The marketing site, docs and dashboard for [sendm8](https://sendm8.com). Astro + Vue islands, static output. The Worker in `../worker` serves `dist/` on the same origin as the API.

```sh
npm install
npm run build          # static site in dist/
npm run check          # astro check
npm test               # Vitest: the API client and adapters
npm run test:coverage  # same, with coverage for src/lib/api (70% threshold)

# The real dashboard, from the repo root: builds web, then wrangler dev on http://localhost:8787
npm run dev
```

Sign in locally with the **Dev sign-in** button on `/app/sign-in`. It only appears on localhost and calls `POST /api/dev/login`.

For `/app/admin`, dev-login with an email listed in `ADMIN_EMAILS` (e.g. `ADMIN_EMAILS=dev@sendm8.local` in `.dev.vars` at the repo root) and restart `npm run dev`.

- Legal pages `/terms` and `/privacy` are rendered at build time from `docs/legal/*.md` (`src/lib/markdown.ts`). `{{PLACEHOLDERS}}` show as yellow TODO marks until they're filled in.
- `public/s/v1.js` is the no-build AJAX helper served at `/s/v1.js` (documented under “AJAX without writing JavaScript” on `/docs`). It's plain ES5-ish JavaScript, so keep it dependency-free; tests are in `src/lib/helper-script.test.ts` (jsdom).
- Design tokens: [src/styles/tokens.css](./src/styles/tokens.css)
- How the dashboard talks to the API: [src/lib/api/](./src/lib/api/)
- Every limit and number on marketing pages: [src/config/site.ts](./src/config/site.ts)
- Illustrative data for marketing pages (`/`, `/pricing`, `/emails`, `/pages`, the demos): [src/mocks/](./src/mocks/)
