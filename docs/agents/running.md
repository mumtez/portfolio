# Running the site

## Screenshots

For a visual check, use `npm run shots` instead of writing a Playwright script:

```sh
npm run shots -- [paths...] [--viewport desktop|iphone] [--theme dark|light] [--view grid|plain] [--placeholders]
```

- It builds the site (as live; `--placeholders` builds with Placeholders), starts its own `astro preview` on port 4330, and always stops it, also on failure or Ctrl-C. If port 4330 is already in use it stops with an error rather than shooting another server.
- With no paths it shoots every Section; each flag narrows to one choice. With the Grid on the Intro is skipped; the Plain View is the stored "simulation off" preference. Shots are taken in Chromium.
- Images go to the gitignored `.shots/` folder as `<path>-<viewport>-<theme>-<grid|plain>.png` (the root Section is `home`). The folder is cleared at the start of each run, and the command prints the paths.
