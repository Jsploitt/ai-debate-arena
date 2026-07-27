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
  /** Kokoro voice id used for English TTS (ignored in Arabic mode). */
  voice: string;
}

export interface JudgeConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  /** Relative importance of each criterion (0 = ignored). */
  weights: Record<JudgeCriterion, number>;
  /** Maximum score a debater can get on a single criterion. */
  scale: number;
  /** Total-score gap below which the judge must declare a draw. */
  tieThreshold: number;
  /** Extra house rules appended to the judging prompt. */
  rules: string;
}

export type JudgeCriterion = "Logic" | "Evidence" | "Rebuttal" | "Clarity" | "Persuasion";

export interface JudgeSideScore {
  scores: Record<JudgeCriterion, number>;
  reasons: Record<JudgeCriterion, string>;
  total: number;
  summary: string;
}

export interface JudgeScorecard {
  alpha: JudgeSideScore;
  beta: JudgeSideScore;
  winner: Side | "tie";
  verdict: string;
  simulated: boolean;
  createdAt: number;
  /** True while the debate is still running — this is a running, provisional score. */
  interim: boolean;
  /** Number of completed turns the scorecard was based on. */
  turnsScored: number;
  /** Max score per criterion used for this scorecard. */
  scale: number;
  /** Max weighted total a side could reach. */
  maxTotal: number;
  /** Criterion weights used for this scorecard. */
  weights: Record<JudgeCriterion, number>;
  /** True while the judge's own response is still streaming in (partial JSON). */
  streaming?: boolean;
}


/** Language the debaters speak in. The UI chrome stays in English. */
export type DebateLanguage = "en" | "ar";

export interface TtsSettings {
  /** Master switch — when false, no TTS requests are made at all. */
  enabled: boolean;
  /** Kokoro (English) synthesis endpoint. */
  endpointEn: string;
  /** MMS-TTS-ara (Arabic) synthesis endpoint. */
  endpointAr: string;
}

export interface ArenaSettings {
  alpha: DebaterConfig;
  beta: DebaterConfig;
  rounds: number;
  mode: ExecutionMode;
  contextWindow: number;
  judge: JudgeConfig;
  /** Language the two debaters argue in ("en" default, "ar" for Arabic). */
  language: DebateLanguage;
  tts: TtsSettings;
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
  /** Model name reported by the local runtime for this response. */
  model?: string;
  raw: string;
}
