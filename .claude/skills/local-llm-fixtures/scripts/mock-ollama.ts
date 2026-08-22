/**
 * Mock local-LLM + TTS stack for ai-debate-arena.
 *
 * Binds the same ports as docker-compose.yml so the app's default settings work
 * untouched, and lets every live code path be exercised without a GPU.
 *
 *   bun .claude/skills/local-llm-fixtures/scripts/mock-ollama.ts
 *
 * Failure injection: ?fail= / ?judge= / ?format= query params, or the
 * MOCK_FAIL / MOCK_JUDGE / MOCK_FORMAT env vars. See SKILL.md.
 */

const FIXTURES = new URL("../fixtures/", import.meta.url).pathname;

const PORTS = {
  11434: { slot: "alpha", model: "nemotron3-nano-30b" },
  11435: { slot: "beta", model: "gemma-4-26b" },
  11436: { slot: "judge", model: "nemotron3-nano-4b" },
} as const;

const TTS_PORTS = { 8100: "en", 8101: "ar" } as const;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

const fixture = (name: string) => Bun.file(`${FIXTURES}${name}`).text();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function flags(url: URL) {
  return {
    fail: url.searchParams.get("fail") ?? process.env.MOCK_FAIL ?? "",
    judge: url.searchParams.get("judge") ?? process.env.MOCK_JUDGE ?? "",
    format: url.searchParams.get("format") ?? process.env.MOCK_FORMAT ?? "ndjson",
  };
}

const headers = (extra: Record<string, string>, fail: string) =>
  fail === "cors" ? extra : { ...CORS, ...extra };

/** Replay a fixture stream line by line with a small delay, so the client sees real chunking. */
function replay(text: string, { truncate = false, delayMs = 0 } = {}) {
  const lines = text.split("\n").filter((l) => l.trim());
  const kept = truncate ? lines.slice(0, Math.max(1, Math.floor(lines.length / 2))) : lines;
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      if (delayMs) await sleep(delayMs);
      for (const line of kept) {
        controller.enqueue(encoder.encode(line + "\n\n"));
        await sleep(35);
      }
      controller.close();
    },
  });
}

/** Minimal valid 16-bit mono WAV, ~0.4s of silence, so <audio> loads and fires timeupdate/ended. */
function silentWav(seconds = 0.4, sampleRate = 8000): Uint8Array {
  const samples = Math.floor(seconds * sampleRate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);
  return new Uint8Array(buffer);
}

async function handleOllama(req: Request, port: keyof typeof PORTS): Promise<Response> {
  const url = new URL(req.url);
  const { fail, judge, format } = flags(url);
  const { slot, model } = PORTS[port];

  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: headers({}, fail) });

  if (url.pathname === "/api/tags") {
    if (fail === "health") {
      return new Response("mock: forced health failure", {
        status: 500,
        headers: headers({}, fail),
      });
    }
    const body = await fixture(fail === "empty" ? "tags-empty.json" : "tags-ok.json");
    return new Response(body, {
      headers: headers({ "content-type": "application/json" }, fail),
    });
  }

  if (url.pathname === "/api/chat" || url.pathname === "/v1/chat/completions") {
    // The judge slot returns a scorecard payload rather than debate prose.
    if (slot === "judge") {
      const name =
        judge === "malformed"
          ? "judge-malformed.txt"
          : judge === "partial"
            ? "judge-partial.txt"
            : judge === "fenced"
              ? "judge-fenced.txt"
              : "judge-valid.json";
      const scorecard = await fixture(name);
      const line = JSON.stringify({
        model,
        message: { role: "assistant", content: scorecard },
        done: true,
        eval_count: 220,
        prompt_eval_count: 900,
      });
      return new Response(replay(line, { delayMs: fail === "slow" ? 5000 : 0 }), {
        headers: headers({ "content-type": "application/x-ndjson" }, fail),
      });
    }

    // The verdict brief hits the winning *debater's* endpoint with a JSON
    // schema in `format` (Ollama structured outputs). Recognise it by that
    // field and answer with the brief fixture, so the brief path is
    // exercisable end-to-end without a GPU. `?judge=malformed` degrades it to
    // prose, which exercises the brief's retry-then-fallback chain instead.
    let briefRequest = false;
    try {
      const body = (await req.clone().json()) as { format?: unknown };
      briefRequest = body.format !== undefined && body.format !== null;
    } catch {
      /* non-JSON body — not a brief request */
    }
    if (briefRequest && judge !== "malformed") {
      const brief = await fixture("brief-valid.json");
      const line = JSON.stringify({
        model,
        message: { role: "assistant", content: brief },
        done: true,
        eval_count: 180,
        prompt_eval_count: 700,
      });
      return new Response(replay(line, { delayMs: fail === "slow" ? 5000 : 0 }), {
        headers: headers({ "content-type": "application/x-ndjson" }, fail),
      });
    }

    const name =
      format === "sse"
        ? "openai-sse.txt"
        : fail === "truncate"
          ? "stream-truncated.txt"
          : "ollama-ndjson.txt";
    const text = await fixture(name);
    return new Response(
      replay(text, { truncate: fail === "truncate", delayMs: fail === "slow" ? 5000 : 0 }),
      {
        headers: headers(
          {
            "content-type": format === "sse" ? "text/event-stream" : "application/x-ndjson",
            "cache-control": "no-cache",
          },
          fail,
        ),
      },
    );
  }

  return new Response("mock: not found", { status: 404, headers: headers({}, fail) });
}

async function handleTts(req: Request, lang: "en" | "ar"): Promise<Response> {
  const url = new URL(req.url);
  const { fail } = flags(url);

  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: headers({}, fail) });

  if (url.pathname === "/health") {
    return new Response(JSON.stringify({ ok: fail !== "tts" }), {
      status: fail === "tts" ? 503 : 200,
      headers: headers({ "content-type": "application/json" }, fail),
    });
  }

  if (fail === "tts") {
    return new Response("mock: forced TTS failure", { status: 503, headers: headers({}, fail) });
  }

  const body = (await req.json().catch(() => ({}))) as { text?: string; voice?: string };

  // The Arabic service takes no voice parameter. Surface misuse loudly rather
  // than silently accepting it, so the bug shows up here and not in production.
  if (lang === "ar" && body.voice) {
    return new Response(
      JSON.stringify({ error: "tts-ar accepts {text} only; a voice was supplied" }),
      { status: 400, headers: headers({ "content-type": "application/json" }, fail) },
    );
  }

  // Length roughly tracks the text, so revealFraction pacing looks realistic.
  const seconds = Math.min(8, Math.max(0.4, (body.text?.length ?? 40) / 90));
  return new Response(silentWav(seconds), {
    headers: headers({ "content-type": "audio/wav" }, fail),
  });
}

const servers: Array<{ port: number; label: string }> = [];

for (const port of Object.keys(PORTS).map(Number) as Array<keyof typeof PORTS>) {
  Bun.serve({ port, fetch: (req) => handleOllama(req, port) });
  servers.push({ port, label: `ollama-${PORTS[port].slot} (${PORTS[port].model})` });
}

for (const [port, lang] of Object.entries(TTS_PORTS)) {
  Bun.serve({ port: Number(port), fetch: (req) => handleTts(req, lang as "en" | "ar") });
  servers.push({ port: Number(port), label: `tts-${lang}` });
}

console.log("mock local-LLM stack listening:");
for (const s of servers) console.log(`  http://localhost:${s.port}  ${s.label}`);
console.log("\ninject failures with ?fail=health|empty|cors|truncate|slow|tts");
console.log("                     ?judge=malformed|partial|fenced   ?format=sse");
console.log("or MOCK_FAIL / MOCK_JUDGE / MOCK_FORMAT env vars\n");
