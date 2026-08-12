import { defineConfig, devices } from "@playwright/test";

/**
 * The sandbox this runs in has no IPv6, and `@lovable.dev/vite-tanstack-config`
 * defaults the dev server to `::`. Binding explicitly to 127.0.0.1 keeps the
 * suite portable between the sandbox and a normal workstation.
 */
const HOST = process.env.E2E_HOST ?? "127.0.0.1";
const PORT = Number(process.env.E2E_PORT ?? 8080);
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // The sync specs drive several tabs at once and assert on cross-tab timing;
  // running files in parallel makes them fight over the shared dev server.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The topic rails on `/` are infinite CSS marquees, which never satisfy
    // Playwright's "element is stable" actionability check. The app already
    // stands the marquees down under reduced motion (src/styles.css), so this
    // exercises a real supported mode rather than faking one.
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Honour a pre-provisioned Chromium (CI images often ship one whose
        // build number does not match the installed Playwright). Falls back to
        // Playwright's own download when the variable is unset.
        launchOptions: process.env.CHROMIUM_PATH
          ? { executablePath: process.env.CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: `bunx vite dev --host ${HOST} --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
