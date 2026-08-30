/**
 * Soak harness for the debate arena, modelled on the one-man-company
 * `soak_harness.py`: a thin, dependency-free driver that exercises the real
 * end-to-end loop (browser → React → engine → judge → brief) for hours and
 * writes one CSV row per debate, with a separate `--report` step that gates
 * pass/fail.
 *
 *   node scripts/soak.mjs --hours 4                # the real thing
 *   node scripts/soak.mjs --minutes 10             # shakedown
 *   node scripts/soak.mjs --cycles 2               # smoke (2 debates)
 *   node scripts/soak.mjs --mode simulation        # GPU-free fallback path
 *   node scripts/soak.mjs --report soak/soak-<stamp>.csv
 *
 * Assumes the app is already running on --url (default http://localhost:8080).
 * Default mode is `auto` — the soak's job is to prove the LIVE model path
 * survives hours of debates; `--mode simulation` exists only to exercise the
 * GPU-free fallback.
 *
 * Per-cycle gates mirror the OMC design: every debate must complete (verdict
 * reached), zero hangs (CYCLE_TIMEOUT), zero page errors. Browser JS heap and
 * TTS success/error counts are logged per cycle for leak inspection but not
 * gated, matching how OMC treats memory.
 */

import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const CYCLE_TIMEOUT_MS = 10 * 60 * 1000;
const SETTLE_MS = 3000;
const SETTINGS_KEY = "debate-arena-settings-v1";

const CSV_HEADER =
  "timestamp,cycle,topic,mode,status,wall_s,turns,tts_ok,tts_err,console_errors,heap_mb\n";

function parseArgs(argv) {
  const args = { url: "http://localhost:8080", mode: "auto" };
  for (let i = 2; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case "--hours":
        args.deadlineMs = Number(next()) * 3600_000;
        break;
      case "--minutes":
        args.deadlineMs = Number(next()) * 60_000;
        break;
      case "--cycles":
        args.cycles = Number(next());
        break;
      case "--mode":
        args.mode = next();
        break;
      case "--url":
        args.url = next();
        break;
      case "--report":
        args.report = next();
        break;
      default:
        throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!args.report && !args.cycles && !args.deadlineMs) args.deadlineMs = 4 * 3600_000;
  return args;
}

/** The same topic list the app ships; read from the source so they never drift. */
function loadTopics() {
  const src = readFileSync(new URL("../src/lib/debate/presets.ts", import.meta.url), "utf8");
  const block = src.match(/export const ALL_TOPICS = \[([\s\S]*?)\];/);
  if (!block) throw new Error("ALL_TOPICS not found in presets.ts");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
}

async function runCycle(page, topic, counters) {
  const t0 = Date.now();
  await page.goto(page.url().replace(/\/[^/]*$/, "/arena"), { waitUntil: "domcontentloaded" });

  // A fill that lands before React hydrates only writes the DOM value — the
  // controlled input's state stays empty and Start stays disabled. Re-fill
  // until the button actually arms.
  const motion = page.locator('input[placeholder^="Enter a motion"], input[placeholder^="اكتب"]');
  const start = page.getByRole("button", { name: /^(Start|ابدأ)$/ });
  for (let tries = 0; tries < 20; tries++) {
    await motion.fill(topic);
    await page.waitForTimeout(300);
    if (await start.isEnabled()) break;
  }
  await start.click();

  // A debate is done when the transcript log announces the final verdict.
  let status = "hang";
  try {
    await page
      .getByText(/AI Judge (\(simulated\) )?verdict:/)
      .waitFor({ timeout: CYCLE_TIMEOUT_MS });
    status = "completed";
  } catch {
    /* falls through as hang */
  }

  const wall = (Date.now() - t0) / 1000;
  // The stage shows only the current turn as an <article>; the scorecard's
  // own "N turns scored" is the real per-debate turn count.
  const body = (await page.textContent("body")) ?? "";
  const turns = Number(body.match(/(\d+) turns scored/)?.[1] ?? 0);
  const heap = await page.evaluate(() =>
    performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
  );

  await page
    .getByRole("button", { name: /^(Reset|إعادة)/ })
    .click()
    .catch(() => {});
  return { status, wall, turns, heap, ttsOk: counters.ttsOk, ttsErr: counters.ttsErr };
}

async function soak(args) {
  const topics = loadTopics();
  mkdirSync("soak", { recursive: true });
  const base = `soak/soak-${stamp()}`;
  const csvPath = `${base}.csv`;
  writeFileSync(csvPath, CSV_HEADER);
  const log = (line) => {
    const msg = `[${new Date().toISOString()}] ${line}`;
    console.log(msg);
    appendFileSync(`${base}.log`, msg + "\n");
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  // Force the requested mode (and voice on, so the TTS path is exercised)
  // before the app boots and reads its settings.
  await page.addInitScript(
    ({ key, mode }) => {
      try {
        const s = JSON.parse(localStorage.getItem(key) ?? "{}");
        s.mode = mode;
        if (s.tts) s.tts.enabled = true;
        localStorage.setItem(key, JSON.stringify(s));
      } catch {
        /* first boot writes defaults; the next cycle picks the mode up */
      }
    },
    { key: SETTINGS_KEY, mode: args.mode },
  );

  let consoleErrors = 0;
  const counters = { ttsOk: 0, ttsErr: 0 };
  page.on("pageerror", () => consoleErrors++);
  page.on("console", (msg) => msg.type() === "error" && consoleErrors++);
  page.on("response", (res) => {
    if (!res.url().includes("/synthesize")) return;
    if (res.ok()) counters.ttsOk++;
    else counters.ttsErr++;
  });

  await page.goto(args.url, { waitUntil: "domcontentloaded" });

  const deadline = args.deadlineMs ? Date.now() + args.deadlineMs : Infinity;
  const maxCycles = args.cycles ?? Infinity;
  log(`soak start: mode=${args.mode} url=${args.url} topics=${topics.length}`);

  let cycle = 0;
  while (Date.now() < deadline && cycle < maxCycles) {
    const topic = topics[cycle % topics.length];
    const errBefore = consoleErrors;
    const ttsBefore = { ...counters };
    let row;
    try {
      row = await runCycle(page, topic, counters);
    } catch (error) {
      const reason = String(error)
        .replace(/[\s,"]+/g, " ")
        .slice(0, 60)
        .trim();
      row = { status: `error:${reason}`, wall: 0, turns: 0, heap: -1 };
    }
    cycle++;
    const cellTtsOk = counters.ttsOk - ttsBefore.ttsOk;
    const cellTtsErr = counters.ttsErr - ttsBefore.ttsErr;
    const cellErrs = consoleErrors - errBefore;
    appendFileSync(
      csvPath,
      `${new Date().toISOString()},${cycle},"${topic}",${args.mode},${row.status},` +
        `${row.wall.toFixed(1)},${row.turns},${cellTtsOk},${cellTtsErr},${cellErrs},${row.heap}\n`,
    );
    log(
      `cycle ${cycle}: ${row.status} in ${row.wall.toFixed(0)}s, ${row.turns} turns, ` +
        `tts ${cellTtsOk}/${cellTtsOk + cellTtsErr}, ${cellErrs} console errors, heap ${row.heap}MB`,
    );
    await new Promise((r) => setTimeout(r, SETTLE_MS));
  }

  await browser.close();
  log(`soak done: ${cycle} cycles → ${csvPath}`);
  return csvPath;
}

function report(csvPath) {
  const rows = readFileSync(csvPath, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const m = line.match(
        /^([^,]+),(\d+),"(.*)",([^,]+),([^,]+),([^,]+),(\d+),(\d+),(\d+),(\d+),(-?\d+)$/,
      );
      if (!m) return null;
      return {
        status: m[5],
        wall: Number(m[6]),
        turns: Number(m[7]),
        ttsErr: Number(m[9]),
        consoleErrors: Number(m[10]),
        heap: Number(m[11]),
      };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    console.log("No cycles recorded — FAIL");
    process.exit(1);
  }

  const walls = rows.map((r) => r.wall).sort((a, b) => a - b);
  const median = walls[Math.floor(walls.length / 2)];
  const heaps = rows.map((r) => r.heap).filter((h) => h >= 0);

  const gates = {
    "all completed": rows.every((r) => r.status === "completed"),
    "zero hangs": rows.every((r) => r.status !== "hang"),
    "zero console errors": rows.every((r) => r.consoleErrors === 0),
    "zero tts errors": rows.every((r) => r.ttsErr === 0),
  };

  console.log(`cycles: ${rows.length}`);
  console.log(`wall s: min ${walls[0]} median ${median} max ${walls[walls.length - 1]}`);
  if (heaps.length)
    console.log(
      `heap MB: first ${heaps[0]} last ${heaps[heaps.length - 1]} max ${Math.max(...heaps)}`,
    );
  let pass = true;
  for (const [name, ok] of Object.entries(gates)) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
    pass &&= ok;
  }
  process.exit(pass ? 0 : 1);
}

const args = parseArgs(process.argv);
if (args.report) report(args.report);
else soak(args).then(report);
