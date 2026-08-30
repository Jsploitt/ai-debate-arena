import type { ChatMessage, DebaterConfig, StreamChunk } from "./types";

function tagsUrl(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return `${url.origin}/api/tags`;
  } catch {
    return "http://localhost:11434/api/tags";
  }
}

export async function checkHealth(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch(tagsUrl(endpoint), { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(endpoint: string): Promise<string[]> {
  try {
    const res = await fetch(tagsUrl(endpoint));
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    return (data.models ?? []).map((m) => m.name ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Per-request overrides for calls that need something other than the slot's
 * debate configuration — currently only the verdict brief, which constrains
 * the response to a JSON schema via Ollama structured outputs.
 */
export interface RequestOverrides {
  /**
   * Ollama's `format` field: `"json"` or a JSON schema object. Constrained
   * decoding is dramatically more reliable than asking a local model nicely
   * for JSON. Endpoints that do not know the field ignore it.
   */
  format?: unknown;
  temperature?: number;
}

/**
 * Families whose reasoning escapes into the answer when `think: false` is set.
 *
 * For these, the flag does not suppress reasoning — it removes the channel
 * that separates reasoning from the answer, so the scratchpad lands in
 * `message.content`. Measured on qwen3:30b-a3b: 229 words of "Okay, the user
 * wants me to…" with the flag, a clean 64-word argument without it.
 *
 * The exemption only applies when the response is NOT schema-constrained.
 * Under a schema the grammar itself forbids anything outside the answer
 * string, so the channel is not needed — and keeping it open is expensive:
 * a constrained qwen3 turn took 12.2s with native thinking against 1.8s
 * without, with zero leaks either way. Speed wins once leaking is impossible.
 */
const NATIVE_THINKING = ["qwen3", "gpt-oss", "deepseek-r1"];

function usesNativeThinking(model: string): boolean {
  const name = model.toLowerCase();
  return NATIVE_THINKING.some((family) => name.includes(family));
}

/**
 * Context window requested per call.
 *
 * Ollama sizes its allocation from the context length times
 * `OLLAMA_NUM_PARALLEL` (4 on the GB10 box), so leaving this unset made a
 * 4.9 GB model reserve 74 GB — only one model fit at a time and the three
 * agents evicted each other between turns, paying a cold load on every
 * switch. Bounding it keeps all three resident (~44 GB measured). A debate
 * turn plus history is a couple of thousand tokens, so this is ample.
 */
const NUM_CTX = 8192;

export function buildRequestBody(
  config: DebaterConfig,
  messages: ChatMessage[],
  overrides?: RequestOverrides,
) {
  // A schema makes leaking structurally impossible, so the exemption is only
  // needed for unconstrained calls.
  const constrained = overrides?.format !== undefined;
  const keepNativeThinking = !constrained && usesNativeThinking(config.model);
  return {
    model: config.model,
    messages,
    stream: true,
    // Models that mix chain-of-thought into the visible answer (e.g. gemma4)
    // are pinned to the app's own prompted <think> tag instead, which is what
    // the UI parses. See NATIVE_THINKING for the exemption.
    ...(keepNativeThinking ? {} : { think: false }),
    // Holds the model in memory between turns rather than reloading it.
    keep_alive: "45m",
    ...(overrides?.format !== undefined ? { format: overrides.format } : {}),
    options: {
      temperature: overrides?.temperature ?? config.temperature,
      top_p: config.topP,
      num_ctx: NUM_CTX,
    },
  };
}

/** Tracks whether a `<think>` tag is currently open across chunks of one stream. */
interface ThinkState {
  open: boolean;
}

/**
 * Ollama reports reasoning-model output as a separate `message.thinking`
 * field rather than inline `<think>` tags. Re-inject it as `<think>…</think>`
 * around the content stream so downstream reasoning extraction (which only
 * looks for those tags) keeps working regardless of which shape the runtime
 * used.
 */
function parseLine(line: string, thinkState: ThinkState): StreamChunk | null {
  let payload = line.trim();
  if (!payload) return null;
  if (payload.startsWith("data:")) payload = payload.slice(5).trim();
  if (!payload || payload === "[DONE]") {
    return { content: "", done: true, raw: line };
  }
  try {
    const json = JSON.parse(payload) as {
      message?: { content?: string; thinking?: string };
      response?: string;
      done?: boolean;
      model?: string;
      eval_count?: number;
      prompt_eval_count?: number;
      choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
    };
    const thinking = json.message?.thinking ?? "";
    const answer =
      json.message?.content ?? json.response ?? json.choices?.[0]?.delta?.content ?? "";
    const done = Boolean(json.done) || Boolean(json.choices?.[0]?.finish_reason);

    let content = "";
    if (thinking) {
      content += (thinkState.open ? "" : "<think>") + thinking;
      thinkState.open = true;
    }
    if (answer) {
      if (thinkState.open) {
        content += "</think>";
        thinkState.open = false;
      }
      content += answer;
    }
    if (done && thinkState.open) {
      content += "</think>";
      thinkState.open = false;
    }

    return {
      content,
      done,
      model: json.model,
      evalCount: json.eval_count,
      promptEvalCount: json.prompt_eval_count,
      raw: payload,
    };
  } catch {
    return null;
  }
}

/**
 * Match a configured model name against the models actually installed on the
 * local runtime. Handles the `llama3` vs `llama3:latest` tag mismatch and falls
 * back to the first installed model so the UI never shows a phantom name.
 */
export function resolveModelName(configured: string, available: string[]): string | null {
  if (!available.length) return null;
  const want = configured.trim().toLowerCase();
  if (!want) return available[0];
  const exact = available.find((m) => m.toLowerCase() === want);
  if (exact) return exact;
  const tagged = available.find((m) => m.toLowerCase() === `${want}:latest`);
  if (tagged) return tagged;
  const base = available.find((m) => m.toLowerCase().split(":")[0] === want.split(":")[0]);
  if (base) return base;
  const partial = available.find(
    (m) => m.toLowerCase().includes(want) || want.includes(m.toLowerCase().split(":")[0]),
  );
  return partial ?? available[0];
}

export async function* streamChat(
  config: DebaterConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
  overrides?: RequestOverrides,
): AsyncGenerator<StreamChunk> {
  const res = await fetch(config.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody(config, messages, overrides)),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Local endpoint responded ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const thinkState: ThinkState = { open: false };
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const chunk = parseLine(line, thinkState);
      if (chunk) yield chunk;
    }
  }

  const tail = parseLine(buffer, thinkState);
  if (tail) yield tail;
}
