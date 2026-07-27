import { JUDGE_SYSTEM_PROMPT } from "./judge";
import type { ArenaSettings, DebaterConfig, JudgeConfig } from "./types";


export const TONE_PRESETS: Record<string, string> = {
  Custom: "",
  Aggressive:
    "You are an aggressive tech evangelist. Attack weak reasoning directly, use punchy sentences, and never concede without a fight. Keep responses under 90 words.",
  Analytical:
    "You are a rigorous analytical debater. Argue with structured logic, cite measurable trade-offs, latency, cost and reliability figures. Keep responses under 90 words.",
  Humorous:
    "You are a witty, sarcastic critic. Make sharp arguments wrapped in dry humour, but always land a real technical point. Keep responses under 90 words.",
  Conservative:
    "You are a cautious enterprise architect. Favour proven, low-risk approaches and highlight operational and governance risk. Keep responses under 90 words.",
  Socratic:
    "You are a Socratic debater. Advance your case mainly through pointed questions that expose the flaws in the opposing position. Keep responses under 90 words.",
  Diplomatic:
    "You are a diplomatic academic. Acknowledge merit in the opposing view, then dismantle it with evidence and measured language. Keep responses under 90 words.",
};

export const THINKING_INSTRUCTION = [
  "",
  "Before answering, think briefly inside <think></think> tags, then give your argument.",
  "Before answering, reason step by step inside <think></think> tags covering assumptions and counter-arguments, then give your argument.",
  "Before answering, produce a deep chain of reasoning inside <think></think> tags: list assumptions, evidence, counter-arguments and the strongest rebuttal, then give your final argument.",
];

const alpha: DebaterConfig = {
  name: "Debater Alpha",
  endpoint: "http://localhost:11434/api/chat",
  model: "llama3",
  temperature: 0.8,
  topP: 0.9,
  tonePreset: "Analytical",
  thinkingLevel: 1,
  systemPrompt: TONE_PRESETS.Analytical,
};

const beta: DebaterConfig = {
  name: "Debater Beta",
  endpoint: "http://localhost:11434/api/chat",
  model: "qwen2.5",
  temperature: 0.9,
  topP: 0.95,
  tonePreset: "Aggressive",
  thinkingLevel: 1,
  systemPrompt: TONE_PRESETS.Aggressive,
};

export const DEFAULT_SETTINGS: ArenaSettings = {
  alpha,
  beta,
  rounds: 4,
  mode: "auto",
  contextWindow: 8192,
};

export const SAMPLE_TOPICS = [
  "Is edge computing superior to centralized cloud for IoT?",
  "AI Ethics: should frontier models be open-weight?",
  "Quantum computing will make classical supercomputing obsolete",
  "Saudi smart cities (THE LINE) need on-premise AI infrastructure",
];

const STORAGE_KEY = "debate-arena-settings-v1";

export function loadSettings(): ArenaSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ArenaSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      alpha: { ...DEFAULT_SETTINGS.alpha, ...(parsed.alpha ?? {}) },
      beta: { ...DEFAULT_SETTINGS.beta, ...(parsed.beta ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ArenaSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota errors */
  }
}
