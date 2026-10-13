/**
 * `npm run shots -- [paths...] [--viewport desktop|iphone] [--theme dark|light]
 * [--view grid|plain] [--placeholders]`: screenshots of the built site for visual checks.
 *
 * It builds the site (as live, or with Placeholders under `--placeholders`), starts its own
 * `astro preview` on a fixed port, shoots each path at each viewport, theme and view, saves
 * them under `.shots/` and prints the files. The server is always stopped, also on failure
 * or Ctrl-C, and a port already in use is an error rather than a server to reuse.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { connect } from "node:net";
import { parseArgs } from "node:util";
import { chromium, type Browser, type BrowserContextOptions } from "@playwright/test";

const VIEWPORTS = ["desktop", "iphone"] as const;
const THEMES = ["dark", "light"] as const;
const VIEWS = ["grid", "plain"] as const;

type Viewport = (typeof VIEWPORTS)[number];
type Theme = (typeof THEMES)[number];
type View = (typeof VIEWS)[number];

export interface Shot {
  path: string;
  viewport: Viewport;
  theme: Theme;
  view: View;
}

export interface ShotsOptions {
  /** The paths to shoot; empty means every Section. */
  paths: string[];
  viewports: Viewport[];
  themes: Theme[];
  views: View[];
  /** Build with Placeholders (`SHOW_PLACEHOLDERS=true`) instead of as live. */
  placeholders: boolean;
}

/** Where the screenshots go (gitignored). */
export const OUT_DIR = ".shots";

/** The port its own `astro preview` serves on: not the end-to-end tests' 4329. */
const PORT = 4330;

/** The same sizes as the end-to-end tests (`playwright.config.ts`). */
const CONTEXTS: Record<Viewport, BrowserContextOptions> = {
  desktop: { viewport: { width: 1440, height: 900 } },
  iphone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
};

/** The file a shot is saved to, e.g. `.shots/projects-baja-iphone-light-plain.png`. */
export function shotFile({ path, viewport, theme, view }: Shot): string {
  const name = path.split("/").filter(Boolean).join("-") || "home";
  return `${OUT_DIR}/${name}-${viewport}-${theme}-${view}.png`;
}

/** The command's options from its arguments. Throws on an unknown flag or value. */
export function parseShotsArgs(argv: string[]): ShotsOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      viewport: { type: "string" },
      theme: { type: "string" },
      view: { type: "string" },
      placeholders: { type: "boolean", default: false },
    },
  });
  return {
    paths: positionals.map((path) => {
      const parts = path.split("/").filter(Boolean);
      return parts.length > 0 ? `/${parts.join("/")}/` : "/";
    }),
    viewports: oneOrAll("--viewport", values.viewport, VIEWPORTS),
    themes: oneOrAll("--theme", values.theme, THEMES),
    views: oneOrAll("--view", values.view, VIEWS),
    placeholders: values.placeholders,
  };
}

/** The flag's one choice, or every choice when it's not given. */
function oneOrAll<T extends string>(
  flag: string,
  value: string | undefined,
  all: readonly T[],
): T[] {
  if (value === undefined) return [...all];
  if (!all.includes(value as T)) throw new Error(`${flag} must be ${all.join(" or ")}`);
  return [value as T];
}

/** Every shot: each path at each viewport, theme and view. */
function plan(options: ShotsOptions, paths: string[]): Shot[] {
  return paths.flatMap((path) =>
    options.viewports.flatMap((viewport) =>
      options.themes.flatMap((theme) =>
        options.views.map((view) => ({ path, viewport, theme, view })),
      ),
    ),
  );
}

/** Every Section's path in the build: each `index.html` under `dist/`. */
async function builtSections(): Promise<string[]> {
  const files = await readdir("dist", { recursive: true });
  return files
    .filter((file) => file === "index.html" || file.endsWith("/index.html"))
    .map((file) => `/${file.slice(0, -"index.html".length)}`)
    .sort();
}

/** Whether something is already listening on the port. */
function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "localhost");
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });
}

/** Start `astro preview` in its own process group and wait until it answers. */
async function startPreview(): Promise<ChildProcess> {
  if (await portInUse(PORT)) {
    throw new Error(
      `Port ${PORT} is already in use: stop that server first (npx astro preview stop)`,
    );
  }
  const server = spawn("npx", ["astro", "preview", "--port", String(PORT), "--ignore-lock"], {
    detached: true,
    stdio: "ignore",
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`astro preview exited (${server.exitCode})`);
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return server;
    } catch {
      // Not answering yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  stopPreview(server);
  throw new Error(`astro preview didn't answer on port ${PORT} within 30s`);
}

/** Stop the server and everything it started. Safe to call more than once. */
function stopPreview(server: ChildProcess): void {
  if (server.pid === undefined || server.exitCode !== null || server.signalCode !== null) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // Already gone.
  }
}

/** Take one shot: the stored preferences set before the page's scripts run, the Intro skipped. */
async function take(browser: Browser, shot: Shot): Promise<string> {
  const context = await browser.newContext({
    ...CONTEXTS[shot.viewport],
    colorScheme: shot.theme,
    baseURL: `http://localhost:${PORT}`,
  });
  try {
    await context.route(/goatcounter\.com|gc\.zgo\.at/, (route) => route.abort());
    await context.addInitScript(
      ({ theme, simulation }) => {
        localStorage.setItem("theme", theme);
        localStorage.setItem("simulation", simulation);
        sessionStorage.setItem("intro-seen", "1");
      },
      { theme: shot.theme, simulation: shot.view === "grid" ? "on" : "off" },
    );
    const page = await context.newPage();
    await page.goto(shot.path);
    // The Section has arrived once its Body Text is fully faded in.
    await page.waitForFunction(() => {
      const main = document.querySelector("main");
      return main !== null && getComputedStyle(main).opacity === "1";
    });
    await page.evaluate(() => document.fonts.ready);
    const file = shotFile(shot);
    await page.screenshot({ path: file });
    return file;
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const options = parseShotsArgs(process.argv.slice(2));
  const build = spawnSync("npx", ["astro", "build"], {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, SHOW_PLACEHOLDERS: String(options.placeholders) },
  });
  if (build.status !== 0) throw new Error("astro build failed");
  const shots = plan(options, options.paths.length > 0 ? options.paths : await builtSections());
  await mkdir(OUT_DIR, { recursive: true });

  const server = await startPreview();
  const stop = () => stopPreview(server);
  process.once("exit", stop);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => (stop(), process.exit(130)));
  }
  try {
    const browser = await chromium.launch();
    try {
      const files: string[] = [];
      for (const shot of shots) files.push(await take(browser, shot));
      console.log(`\n${files.length} screenshots:\n${files.join("\n")}`);
    } finally {
      await browser.close();
    }
  } finally {
    stop();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
