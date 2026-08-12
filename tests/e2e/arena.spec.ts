import { test, expect } from "@playwright/test";
import { openPage, pickTopicOnHome, seedSettings, turns, typeMotion } from "./helpers";

/** Regressions found during exploratory testing of the rest of the frontend. */

test.describe("end of debate on /", () => {
  test("with the judge disabled, a finished debate still closes out", async ({ context }) => {
    // Previously `/` keyed its closing panel off the scorecard, so with judging
    // off the footer stayed on a permanently disabled "Appoint a judge" grid and
    // never acknowledged that the debate had ended.
    await seedSettings(context, { judge: { enabled: false } });
    const home = await openPage(context, "/");

    await pickTopicOnHome(home);
    await home.getByRole("button", { name: /Begin the debate/i }).click();

    await expect(home.getByText(/AI judge is switched off/i)).toBeVisible({ timeout: 60_000 });
    await expect(home.getByRole("link", { name: /Full scorecard/i })).toBeVisible();
    // Nothing was scored, so there is no brief to download.
    await expect(home.getByRole("button", { name: /Download PDF/i })).toHaveCount(0);
  });

  test("with the judge enabled, the verdict and PDF brief are offered", async ({ context }) => {
    await seedSettings(context);
    const home = await openPage(context, "/");

    await pickTopicOnHome(home);
    await home.getByRole("button", { name: /Begin the debate/i }).click();

    const download = home.getByRole("button", { name: /Download PDF/i });
    await expect(download).toBeVisible({ timeout: 60_000 });
    await expect(home.getByText(/^Winner:/)).toBeVisible();

    const started = home.waitForEvent("download", { timeout: 20_000 });
    await download.click();
    expect((await started).suggestedFilename()).toMatch(/\.pdf$/);
  });
});

test.describe("Arabic content", () => {
  test("debate content carries both dir and lang, and the shell stays LTR", async ({ context }) => {
    await seedSettings(context, { language: "ar" });
    const arena = await openPage(context, "/arena");

    await typeMotion(arena, "مغادرة السحابة العامة");
    await arena.getByRole("button", { name: /^Start$/ }).click();
    await expect(turns(arena).first()).toBeVisible({ timeout: 30_000 });

    // The turn body is the content container: it must be RTL *and* declare
    // Arabic, or a screen reader reads it with an English voice.
    const body = turns(arena).first().locator("p").first();
    await expect(body).toHaveAttribute("dir", "rtl");
    await expect(body).toHaveAttribute("lang", "ar");

    // The shell deliberately stays LTR English — mirroring the document would
    // break the stage's PRO-left / CON-right semantics.
    await expect(arena.locator("html")).not.toHaveAttribute("dir", "rtl");
  });
});

test.describe("empty and error states", () => {
  test("a fresh /arena shows every empty state and no enabled transport", async ({ context }) => {
    await seedSettings(context);
    const arena = await openPage(context, "/arena");

    await expect(arena.getByText("No turns yet")).toBeVisible();
    await expect(arena.getByText("Not yet scored")).toBeVisible();
    await expect(arena.getByText("No traffic yet")).toBeVisible();

    for (const name of [/^Start$/, /^Resume$/, /^Next turn$/, /^Reset$/, /^Export$/]) {
      await expect(arena.getByRole("button", { name })).toBeDisabled();
    }
  });

  test("unreachable endpoints in live mode fall back to simulation", async ({ context }) => {
    // No inference stack is running, so live mode must degrade rather than hang.
    await seedSettings(context, { mode: "live" });
    const arena = await openPage(context, "/arena");

    await typeMotion(arena, "Behaviour when the local runtimes are down");
    await arena.getByRole("button", { name: /^Start$/ }).click();

    await expect(turns(arena).first()).toBeVisible({ timeout: 40_000 });
    await expect(arena.getByText("Simulation").first()).toBeVisible();
  });
});
