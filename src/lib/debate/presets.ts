import {
  DEFAULT_JUDGE_SCALE,
  DEFAULT_JUDGE_WEIGHTS,
  DEFAULT_TIE_THRESHOLD,
  JUDGE_SYSTEM_PROMPT,
} from "./judge";
import type {
  ArenaSettings,
  DebateLanguage,
  DebaterConfig,
  JudgeConfig,
  TtsSettings,
} from "./types";

/** Kokoro (English) voice ids, grouped by gender for the Settings panel. */
export const KOKORO_VOICES = {
  Male: [
    "am_adam",
    "am_echo",
    "am_eric",
    "am_fenrir",
    "am_liam",
    "am_michael",
    "am_onyx",
    "am_puck",
  ],
  Female: [
    "af_alloy",
    "af_bella",
    "af_heart",
    "af_jessica",
    "af_kore",
    "af_nicole",
    "af_nova",
    "af_sarah",
  ],
};

export const TONE_PRESETS: Record<string, string> = {
  Custom: "",
  Aggressive:
    "You are an aggressive tech evangelist. Attack weak reasoning directly, use punchy sentences, and never concede without a fight. Keep responses under 50 words.",
  Analytical:
    "You are a rigorous analytical debater. Argue with structured logic, cite measurable trade-offs, latency, cost and reliability figures. Keep responses under 50 words.",
  Humorous:
    "You are a witty, sarcastic critic. Make sharp arguments wrapped in dry humour, but always land a real technical point. Keep responses under 50 words.",
  Conservative:
    "You are a cautious enterprise architect. Favour proven, low-risk approaches and highlight operational and governance risk. Keep responses under 50 words.",
  Socratic:
    "You are a Socratic debater. Advance your case mainly through pointed questions that expose the flaws in the opposing position. Keep responses under 50 words.",
  Diplomatic:
    "You are a diplomatic academic. Acknowledge merit in the opposing view, then dismantle it with evidence and measured language. Keep responses under 50 words.",
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
  model: "nemotron3:33b",
  temperature: 0.8,
  topP: 0.9,
  tonePreset: "Analytical",
  thinkingLevel: 1,
  systemPrompt: TONE_PRESETS.Analytical,
  voice: "am_michael",
  // No character by default — today's shipped behaviour is preserved and
  // choosing a cast member is opt-in from the Configuration sheet.
  characterId: null,
};

const beta: DebaterConfig = {
  name: "Debater Beta",
  endpoint: "http://localhost:11435/api/chat",
  // Measured over 36 sides-swapped debates: the closest match for Alpha's
  // nemotron3:33b (65% to Alpha, 95% CI [49%, 79%] -- interval spans even),
  // where gemma2:27b lost 75% [59%, 86%]. Also ~40% faster per turn.
  model: "qwen3:30b-a3b",
  temperature: 0.9,
  topP: 0.95,
  tonePreset: "Aggressive",
  thinkingLevel: 1,
  systemPrompt: TONE_PRESETS.Aggressive,
  voice: "af_heart",
  characterId: null,
};

const tts: TtsSettings = {
  enabled: true,
  endpointEn: "http://localhost:8100/synthesize",
};

const judge: JudgeConfig = {
  enabled: true,
  endpoint: "http://localhost:11436/api/chat",
  // A judge must not share an architecture with either debater, or it
  // self-prefers. `nemotron-mini` did exactly that: scored identical debaters
  // +21.7 toward Pro and picked Pro in 11 of 12 trials, and Alpha is always
  // Pro. llama3.1:8b measured +0.3 on the same test.
  model: "llama3.1:8b-instruct-q4_K_M",
  temperature: 0.2,
  systemPrompt: JUDGE_SYSTEM_PROMPT,
  weights: { ...DEFAULT_JUDGE_WEIGHTS },
  scale: DEFAULT_JUDGE_SCALE,
  tieThreshold: DEFAULT_TIE_THRESHOLD,
  rules: "",
};

export const DEFAULT_SETTINGS: ArenaSettings = {
  alpha,
  beta,
  rounds: 4,
  mode: "auto",
  contextWindow: 8192,
  judge,
  language: "en",
  tts,
};

/** Language directive appended to every debater system prompt. */
export const LANGUAGE_INSTRUCTION: Record<DebateLanguage, string> = {
  en: "Write your argument in English.",
  ar: "اكتب حجتك باللغة العربية الفصحى فقط. لا تستخدم الإنجليزية إطلاقاً، بما في ذلك محتوى وسوم <think>. حافظ على أسلوب خطابي قوي ومصطلحات تقنية دقيقة.",
};

export const LANGUAGE_LABEL: Record<DebateLanguage, string> = {
  en: "English",
  ar: "العربية",
};

export const SAMPLE_TOPICS_AR = [
  "هل الحوسبة الطرفية أفضل من السحابة المركزية لإنترنت الأشياء؟",
  "أخلاقيات الذكاء الاصطناعي: هل يجب أن تكون النماذج المتقدمة مفتوحة الأوزان؟",
  "الحوسبة الكمية ستجعل الحوسبة الفائقة التقليدية بلا جدوى",
  "المدن الذكية السعودية تحتاج بنية ذكاء اصطناعي محلية داخل الموقع",
];

export const SAMPLE_TOPICS = [
  "Is edge computing superior to centralized cloud for IoT?",
  "AI Ethics: should frontier models be open-weight?",
  "Quantum computing will make classical supercomputing obsolete",
  "Saudi smart cities (THE LINE) need on-premise AI infrastructure",
];

const STORAGE_KEY = "debate-arena-settings-v1";

/**
 * Model ids retired in favour of measured replacements, and what supersedes
 * them.
 *
 * Stored settings are merged *over* the defaults, so a browser that has run
 * the arena before would otherwise keep its old models forever — including
 * `nemotron-mini`, the judge that scored identical debaters +21.7 toward Pro.
 * Rewriting just these ids is deliberate: bumping the storage key would work
 * too, but it would also discard hand-tuned cast assignments and judge
 * weights. Anything the operator has since chosen by hand is left alone.
 */
const RETIRED_MODELS: Record<string, string> = {
  "gemma2:27b": "qwen3:30b-a3b",
  "nemotron-mini": "llama3.1:8b-instruct-q4_K_M",
  "nemotron-mini:latest": "llama3.1:8b-instruct-q4_K_M",
};

function currentModel(model: string | undefined, fallback: string): string {
  if (!model) return fallback;
  return RETIRED_MODELS[model] ?? model;
}

export function loadSettings(): ArenaSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ArenaSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      alpha: {
        ...DEFAULT_SETTINGS.alpha,
        ...(parsed.alpha ?? {}),
        model: currentModel(parsed.alpha?.model, DEFAULT_SETTINGS.alpha.model),
      },
      beta: {
        ...DEFAULT_SETTINGS.beta,
        ...(parsed.beta ?? {}),
        model: currentModel(parsed.beta?.model, DEFAULT_SETTINGS.beta.model),
      },
      judge: {
        ...DEFAULT_SETTINGS.judge,
        ...(parsed.judge ?? {}),
        model: currentModel(parsed.judge?.model, DEFAULT_SETTINGS.judge.model),
        weights: { ...DEFAULT_JUDGE_WEIGHTS, ...(parsed.judge?.weights ?? {}) },
      },
      language: parsed.language ?? DEFAULT_SETTINGS.language,
      tts: { ...DEFAULT_SETTINGS.tts, ...(parsed.tts ?? {}) },
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
