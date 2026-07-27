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

export function buildRequestBody(config: DebaterConfig, messages: ChatMessage[]) {
  return {
    model: config.model,
    messages,
    stream: true,
    // Some Ollama-served reasoning models (e.g. gemma4) mix native chain-of-
    // thought into the visible answer instead of cleanly separating it, even
    // when it's also echoed in `message.thinking`. Disabling native "think"
    // mode makes all models rely solely on the app's own prompted <think>
    // tag instruction (see THINKING_INSTRUCTION), which is what the UI
    // actually parses — deterministic across model families.
    think: false,
    options: {
      temperature: config.temperature,
      top_p: config.topP,
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
): AsyncGenerator<StreamChunk> {
  const res = await fetch(config.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody(config, messages)),
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
