# Running the site

Gotchas for running, previewing and checking the site. Commands and flags are in `package.json` and `npx astro dev --help`.

## Background servers

`astro dev` and `astro preview` run as background servers that persist after your command returns. Before starting one, check: `npx astro dev status` / `npx astro preview status`. Stop yours when done: `npx astro dev stop` / `npx astro preview stop`.

A preview reported "already running" may be serving another worktree's `dist/` (worktrees live under `.claude/worktrees/`). Confirm which checkout it serves, or stop it and start your own. Playwright's `webServer` starts its own preview with `--ignore-lock`, so `npm run test:e2e` is unaffected.

## Content config

Restart the dev server after changing `src/content.config.ts`. A stale server shows errors such as "No Section home".

## Placeholders

Placeholders show under `astro dev` and in the test builds (`SHOW_PLACEHOLDERS=true`, see `src/lib/placeholders.ts`). `npm run build`, and so the live site, leaves them out. Deploy rebuilds with `npm run build` and runs `npm run test:live` on that build before uploading. To fill one in, follow `PLACEHOLDERS.md`.

## Andrew's phone

`npx astro preview --host` serves the built site on the LAN; give Andrew the network URL it prints.

For performance on iPhone (WebKit), measure on the device: add a temporary on-screen meter, read Andrew's real-device numbers, then remove it. Desktop Chromium timings mislead here. Commit `ab43e84` records the draw-time investigation (63ms per draw on iPhone, 5.9ms after the fix).

## Screenshots

For a visual check, use `npm run shots` instead of writing a Playwright script:

```sh
npm run shots -- [paths...] [--viewport desktop|iphone] [--theme dark|light] [--view grid|plain] [--placeholders]
```

- It builds the site (as live; `--placeholders` builds with Placeholders), starts its own `astro preview` on port 4330, and always stops it, also on failure or Ctrl-C. If port 4330 is already in use it stops with an error rather than shooting another server.
- With no paths it shoots every Section; each flag narrows to one choice. With the Grid on the Intro is skipped; the Plain View is the stored "simulation off" preference. Shots are taken in Chromium.
- Images go to the gitignored `.shots/` folder as `<path>-<viewport>-<theme>-<grid|plain>.png` (the root Section is `home`). The folder is cleared at the start of each run, and the command prints the paths.
