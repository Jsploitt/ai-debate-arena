import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const SETTINGS_KEY = "debate-arena-settings-v1";
export const LEADER_KEY = "debate-arena-leader-v1";

export const TOPIC = "Replace sales with AI agents";

/**
 * `loadSettings()` deep-merges the stored object over DEFAULT_SETTINGS, so a
 * partial patch is enough and stays valid as new settings are added.
 *
 * Every suite seeds simulation mode: the debate then runs entirely in-browser
 * with no local model and no TTS service, which makes the cross-tab assertions
 * deterministic and lets the suite run on a machine with no GPU.
 */
export async function seedSettings(
  context: BrowserContext,
  overrides: Record<string, unknown> = {},
) {
  const settings = {
    mode: "simulation",
    rounds: 1,
    tts: { enabled: false },
    ...overrides,
  };
  await context.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, JSON.stringify(value));
    },
    [SETTINGS_KEY, settings] as const,
  );
}

/**
 * The topic rails on `/` are infinite CSS marquees, and a permanently moving
 * element never satisfies Playwright's "stable" actionability check. The app
 * already stands the marquees down under reduced motion (`src/styles.css`), so
 * emulating it exercises a real supported mode rather than faking one.
 *
 * This is applied per page rather than through `use.reducedMotion` because the
 * context-level option is not honoured by the Chromium build this suite runs
 * against; the explicit call is verified to work on both.
 */
export async function preparePage(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
}

/** Opens a prepared page at `path` in the given context. */
export async function openPage(context: BrowserContext, path: string): Promise<Page> {
  const page = await context.newPage();
  await preparePage(page);
  await page.goto(path);
  return page;
}

/**
 * Connection failures against the local model and TTS ports are expected when
 * the inference stack is not running — the app is designed to fall back to
 * simulation. Everything else is a genuine console error.
 */
const EXPECTED_NETWORK_NOISE = /localhost:(1143[456]|810[01])|ERR_CONNECTION_(REFUSED|RESET)/;

/** Collects console errors and uncaught exceptions for an end-of-test assertion. */
export function failOnConsoleErrors(page: Page, sink: string[]) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (EXPECTED_NETWORK_NOISE.test(text)) return;
    sink.push(`[console.error] ${text}`);
  });
  page.on("pageerror", (err) => sink.push(`[pageerror] ${err.message}`));
}

/**
 * Picks a motion from the `/` topic rails.
 *
 * Retries the click: this is an SSR app, and a click that lands before React
 * has hydrated hits inert markup and is silently dropped.
 */
export async function pickTopicOnHome(page: Page, topic = TOPIC) {
  await expect(async () => {
    await page.getByRole("button", { name: topic, exact: true }).click();
    await expect(page.getByRole("button", { name: /Begin the debate/i })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 20_000 });
}

/**
 * Types a motion into the `/arena` field.
 *
 * Retries until the Start button enables, not merely until the field shows the
 * text: `Start` is disabled from React state, so it only enables once the app
 * has actually registered the motion. Asserting on the field value alone passes
 * against pre-hydration markup, which React then discards (see BUG-4).
 */
export async function typeMotion(page: Page, text: string) {
  const field = page.getByLabel("Motion");
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1_000 });
    await expect(page.getByRole("button", { name: /^Start$/ })).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 25_000 });
}

/**
 * Asserts a page is looking at the shared session for `topic`: the motion field
 * carries it and the transcript has turns. Both come from the session, so this
 * is the "same debate" check regardless of which tab is driving.
 */
export async function expectArenaShowsSession(page: Page, topic = TOPIC) {
  await expect(page.getByLabel("Motion")).toHaveValue(topic, { timeout: 20_000 });
  await expect(turns(page).first()).toBeVisible({ timeout: 20_000 });
}

/** The motion chip rendered in the `/` header once a topic is chosen. */
export function homeTopicChip(page: Page, topic = TOPIC) {
  return page.locator("header").getByText(topic, { exact: true });
}

/** `/arena` transcript turns. */
export function turns(page: Page) {
  return page.getByRole("article");
}
