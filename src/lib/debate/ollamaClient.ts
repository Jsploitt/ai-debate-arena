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
    options: {
      temperature: config.temperature,
      top_p: config.topP,
    },
  };
}

function parseLine(line: string): StreamChunk | null {
  let payload = line.trim();
  if (!payload) return null;
  if (payload.startsWith("data:")) payload = payload.slice(5).trim();
  if (!payload || payload === "[DONE]") {
    return { content: "", done: true, raw: line };
  }
  try {
    const json = JSON.parse(payload) as {
      message?: { content?: string };
      response?: string;
      done?: boolean;
      eval_count?: number;
      prompt_eval_count?: number;
      choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
    };
    const content =
      json.message?.content ?? json.response ?? json.choices?.[0]?.delta?.content ?? "";
    const done = Boolean(json.done) || Boolean(json.choices?.[0]?.finish_reason);
    return {
      content,
      done,
      evalCount: json.eval_count,
      promptEvalCount: json.prompt_eval_count,
      raw: payload,
    };
  } catch {
    return null;
  }
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
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const chunk = parseLine(line);
      if (chunk) yield chunk;
    }
  }

  const tail = parseLine(buffer);
  if (tail) yield tail;
}
