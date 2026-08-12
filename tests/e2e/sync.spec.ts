import { test, expect } from "@playwright/test";
import {
  TOPIC,
  expectArenaShowsSession,
  failOnConsoleErrors,
  homeTopicChip,
  openPage,
  pickTopicOnHome,
  preparePage,
  seedSettings,
  typeMotion,
  turns,
} from "./helpers";

/**
 * The `/` ↔ `/arena` synchronization contract.
 *
 * Both routes are views over ONE debate session. Within a tab they share a
 * provider; across tabs of the same browser profile they share a leader-elected
 * BroadcastChannel session. Every test here drives two real pages at once,
 * because the defect these guard against is invisible to a single-page test.
 */

test.describe("/ ↔ /arena synchronization", () => {
  test.beforeEach(async ({ context }) => {
    await seedSettings(context);
  });

  test("motion picked on / appears on /arena, and vice versa", async ({ context }) => {
    const errors: string[] = [];
    const home = await openPage(context, "/");
    const arena = await openPage(context, "/arena");
    failOnConsoleErrors(home, errors);
    failOnConsoleErrors(arena, errors);

    // / → /arena
    await pickTopicOnHome(home);
    await expect(arena.getByLabel("Motion")).toHaveValue(TOPIC);

    // /arena → /
    const other = "Ban meetings over 15 minutes";
    await typeMotion(arena, other);
    await expect(homeTopicChip(home, other)).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("debate started on / streams into /arena", async ({ context }) => {
    const home = await openPage(context, "/");
    const arena = await openPage(context, "/arena");

    await pickTopicOnHome(home);
    await home.getByRole("button", { name: /Begin the debate/i }).click();

    // The instrumented page must show the same session: motion, transcript and
    // the running scoreboard.
    await expectArenaShowsSession(arena);
    await expect(arena.getByText(/Round \d+ \/ \d+/)).toBeVisible();
  });

  test("reset on /arena clears the debate on /", async ({ context }) => {
    const home = await openPage(context, "/");
    const arena = await openPage(context, "/arena");

    await pickTopicOnHome(home);
    await home.getByRole("button", { name: /Begin the debate/i }).click();
    await expect(turns(arena).first()).toBeVisible({ timeout: 30_000 });

    await arena.getByRole("button", { name: /^Reset$/i }).click();

    // `/` falls all the way back to the motion picker.
    await expect(home.getByText("Pick a motion")).toBeVisible({ timeout: 15_000 });
    await expect(homeTopicChip(home)).toHaveCount(0);
    await expect(turns(arena)).toHaveCount(0);
  });

  test("pause driven from /arena is visible on /", async ({ context }) => {
    const home = await openPage(context, "/");
    const arena = await openPage(context, "/arena");

    await pickTopicOnHome(home);
    await home.getByRole("button", { name: /Begin the debate/i }).click();
    await expect(turns(arena).first()).toBeVisible({ timeout: 30_000 });

    await arena.getByRole("button", { name: /^Pause$/i }).click();
    // Pause takes effect after the in-flight turn, so Resume becoming enabled
    // is the observable signal that the session actually paused.
    await expect(arena.getByRole("button", { name: /^Resume$/i })).toBeEnabled({ timeout: 30_000 });
    // `/` must agree that a debate is under way, not offer to begin one.
    await expect(home.getByRole("button", { name: /Begin the debate/i })).toHaveCount(0);
  });

  test("works when /arena is opened first", async ({ context }) => {
    const arena = await openPage(context, "/arena");

    await typeMotion(arena, TOPIC);
    await arena.getByRole("button", { name: /^Start$/i }).click();
    await expect(turns(arena).first()).toBeVisible({ timeout: 30_000 });

    // A page joining an already-running session must catch up, not start empty.
    const home = await openPage(context, "/");
    await expect(homeTopicChip(home)).toBeVisible({ timeout: 15_000 });
    await expect(home.getByText("Pick a motion")).toHaveCount(0);
  });

  test("refreshing / rejoins the live session on /arena", async ({ context }) => {
    const home = await openPage(context, "/");
    const arena = await openPage(context, "/arena");

    await pickTopicOnHome(home);
    await home.getByRole("button", { name: /Begin the debate/i }).click();
    await expect(turns(arena).first()).toBeVisible({ timeout: 30_000 });

    await home.reload();
    await expect(homeTopicChip(home)).toBeVisible({ timeout: 15_000 });
    await expect(home.getByText("Pick a motion")).toHaveCount(0);
  });

  test("refreshing /arena rejoins the live session on /", async ({ context }) => {
    const home = await openPage(context, "/");
    const arena = await openPage(context, "/arena");

    await pickTopicOnHome(home);
    await home.getByRole("button", { name: /Begin the debate/i }).click();
    await expect(turns(arena).first()).toBeVisible({ timeout: 30_000 });

    await arena.reload();
    await expectArenaShowsSession(arena);
  });

  test("navigating / → /arena in one tab keeps the debate", async ({ context }) => {
    const page = await openPage(context, "/");
    await pickTopicOnHome(page);
    await page.getByRole("button", { name: /Begin the debate/i }).click();
    await expect(page.getByText(/Round \d+ \/ \d+/)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("link", { name: /Control arena/i }).click();
    await expect(page).toHaveURL(/\/arena$/);
    await expectArenaShowsSession(page);
  });

  test("a settings change on / reaches /arena", async ({ context }) => {
    const home = await openPage(context, "/");
    const arena = await openPage(context, "/arena");
    await expect(arena.getByText(/judging/)).toBeVisible();

    // The judge picker on `/` only renders once a motion has been chosen.
    await pickTopicOnHome(home);
    await home.getByRole("button", { name: /^CMO/ }).click();
    await expect(arena.getByText(/CMO judging/)).toBeVisible({ timeout: 15_000 });
  });

  test("closing the tab that started the debate does not lose it", async ({ context }) => {
    const home = await openPage(context, "/");
    const arena = await openPage(context, "/arena");

    await pickTopicOnHome(home);
    await home.getByRole("button", { name: /Begin the debate/i }).click();
    await expect(turns(arena).first()).toBeVisible({ timeout: 30_000 });

    await home.close();

    // The surviving page keeps the transcript and stays interactive.
    await expectArenaShowsSession(arena);
    await arena.getByRole("button", { name: /^Reset$/i }).click();
    await expect(turns(arena)).toHaveCount(0, { timeout: 15_000 });
  });

  test("double-clicking Begin starts exactly one debate", async ({ context }) => {
    const home = await openPage(context, "/");
    const arena = await openPage(context, "/arena");

    await pickTopicOnHome(home);
    await home.getByRole("button", { name: /Begin the debate/i }).dblclick();

    await expect(turns(arena).first()).toBeVisible({ timeout: 30_000 });
    // rounds=1 means exactly two turns; a duplicated session would exceed that.
    await expect.poll(async () => turns(arena).count(), { timeout: 30_000 }).toBeLessThanOrEqual(2);
  });
});

test.describe("documented boundary", () => {
  test("separate browser contexts do NOT share a session", async ({ browser }) => {
    // BroadcastChannel and localStorage are partitioned per browser profile, so
    // two independent contexts are genuinely independent clients. This asserts
    // the limitation deliberately so it cannot regress into a silent surprise.
    const a = await browser.newContext();
    const b = await browser.newContext();
    await seedSettings(a);
    await seedSettings(b);

    const home = await a.newPage();
    const arena = await b.newPage();
    await preparePage(home);
    await preparePage(arena);
    await home.goto("/");
    await arena.goto("/arena");

    await pickTopicOnHome(home);
    await home.getByRole("button", { name: /Begin the debate/i }).click();
    await home.waitForTimeout(3_000);

    await expect(arena.getByText("No turns yet")).toBeVisible();

    await a.close();
    await b.close();
  });
});
