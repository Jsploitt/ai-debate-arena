export type Side = "alpha" | "beta";

export type SpeakerStatus = "idle" | "thinking" | "speaking";

export type ExecutionMode = "auto" | "live" | "simulation";

export type ConnectionState = "unknown" | "checking" | "online" | "offline";

export interface DebaterConfig {
  name: string;
  endpoint: string;
  model: string;
  temperature: number;
  topP: number;
  systemPrompt: string;
  thinkingLevel: number;
  tonePreset: string;
}

export interface ArenaSettings {
  alpha: DebaterConfig;
  beta: DebaterConfig;
  rounds: number;
  mode: ExecutionMode;
  contextWindow: number;
}

export interface Telemetry {
  ttftMs: number;
  tokensPerSec: number;
  tokens: number;
  promptTokens: number;
  durationMs: number;
}

export interface DebateMessage {
  id: string;
  side: Side;
  round: number;
  content: string;
  reasoning: string;
  streaming: boolean;
  telemetry: Telemetry | null;
}

export type LogKind = "request" | "chunk" | "info" | "error";

export interface LogEntry {
  id: string;
  ts: number;
  kind: LogKind;
  side: Side | "system";
  text: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  evalCount?: number;
  promptEvalCount?: number;
  raw: string;
}
