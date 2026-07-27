import { streamChat } from "./ollamaClient";
import type {
  ChatMessage,
  DebateMessage,
  DebaterConfig,
  JudgeConfig,
  JudgeCriterion,
  JudgeScorecard,
  DebateLanguage,
  Side,
} from "./types";

export const JUDGE_CRITERIA: JudgeCriterion[] = [
  "Logic",
  "Evidence",
  "Rebuttal",
  "Clarity",
  "Persuasion",
];

export const DEFAULT_JUDGE_WEIGHTS: Record<JudgeCriterion, number> = {
  Logic: 1,
  Evidence: 1,
  Rebuttal: 1,
  Clarity: 1,
  Persuasion: 1,
};

export const DEFAULT_JUDGE_SCALE = 10;
export const DEFAULT_TIE_THRESHOLD = 0.4;

function weightsOf(judge?: Pick<JudgeConfig, "weights">) {
  const w = judge?.weights ?? DEFAULT_JUDGE_WEIGHTS;
  const out = {} as Record<JudgeCriterion, number>;
  for (const c of JUDGE_CRITERIA) {
    const v = Number(w?.[c]);
    out[c] = Number.isFinite(v) && v >= 0 ? v : 1;
  }
  return out;
}

function scaleOf(judge?: Pick<JudgeConfig, "scale">) {
  const v = Number(judge?.scale);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_JUDGE_SCALE;
}

/** Weighted total, normalised so the maximum stays scale x criteria count. */
export function weightedTotal(
  scores: Record<JudgeCriterion, number>,
  weights: Record<JudgeCriterion, number>,
) {
  const totalWeight = JUDGE_CRITERIA.reduce((acc, c) => acc + weights[c], 0);
  if (totalWeight <= 0) return 0;
  const weighted = JUDGE_CRITERIA.reduce((acc, c) => acc + scores[c] * weights[c], 0);
  return +((weighted / totalWeight) * JUDGE_CRITERIA.length).toFixed(1);
}

export function maxTotalFor(judge?: Pick<JudgeConfig, "scale">) {
  return +(scaleOf(judge) * JUDGE_CRITERIA.length).toFixed(1);
}

/** Rubric text describing the operator-configured weights, scale and house rules. */
export function rubricNote(judge: JudgeConfig): string {
  const weights = weightsOf(judge);
  const scale = scaleOf(judge);
  const lines = [
    `\n\nSCORING RULES (set by the event operator, follow them exactly):`,
    `- Score every criterion from 0 to ${scale}.`,
    `- Criterion importance weights: ${JUDGE_CRITERIA.map((c) => `${c} x${weights[c]}`).join(", ")}. Higher weight means that criterion matters more to the final result.`,
  ];
  const ignored = JUDGE_CRITERIA.filter((c) => weights[c] === 0);
  if (ignored.length) lines.push(`- Ignore entirely (weight 0): ${ignored.join(", ")}. Still return 0 for them.`);
  lines.push(
    `- Declare a tie when the two weighted totals are within ${judge.tieThreshold ?? DEFAULT_TIE_THRESHOLD} points.`,
  );
  if (judge.rules?.trim()) lines.push(`- House rules: ${judge.rules.trim()}`);
  return lines.join("\n");
}

export const JUDGE_SYSTEM_PROMPT = [
  "You are an impartial AI debate judge at a live technology showcase.",
  "Score both debaters on five criteria, each from 0 to 10: Logic, Evidence, Rebuttal, Clarity, Persuasion.",
  "For EVERY criterion you must also give a short (max 18 words) reason citing something specific the debater actually said.",
  "Be discriminating — do not give both sides identical scores unless the debate was genuinely tied.",
  "If the debate is still in progress you will be told so: score only what has been said so far.",
  "Reply with ONLY a JSON object, no prose and no markdown fences, in exactly this shape:",
  '{"alpha":{"Logic":{"score":0,"reason":"why"},"Evidence":{"score":0,"reason":"why"},"Rebuttal":{"score":0,"reason":"why"},"Clarity":{"score":0,"reason":"why"},"Persuasion":{"score":0,"reason":"why"},"summary":"one sentence"},',
  '"beta":{"Logic":{"score":0,"reason":"why"},"Evidence":{"score":0,"reason":"why"},"Rebuttal":{"score":0,"reason":"why"},"Clarity":{"score":0,"reason":"why"},"Persuasion":{"score":0,"reason":"why"},"summary":"one sentence"},',
  '"winner":"alpha|beta|tie","verdict":"two sentences explaining the decision"}',
].join("\n");


function toDebaterConfig(judge: JudgeConfig): DebaterConfig {
  return {
    name: "AI Judge",
    endpoint: judge.endpoint,
    model: judge.model,
    temperature: judge.temperature,
    topP: 0.9,
    systemPrompt: judge.systemPrompt,
    thinkingLevel: 0,
    tonePreset: "Custom",
  };
}

export function buildJudgeMessages(
  judge: JudgeConfig,
  topic: string,
  messages: DebateMessage[],
  names: Record<Side, string>,
  interim = false,
  language: DebateLanguage = "en",
): ChatMessage[] {
  const transcript = messages
    .map((m) => `[Round ${m.round}] ${names[m.side]} (${m.side.toUpperCase()}): ${m.content}`)
    .join("\n\n");
  const closing = interim
    ? "The debate is STILL IN PROGRESS. Give a provisional running score for what has been said so far, with a short reason per criterion. JSON only."
    : "The debate is complete. Score it now, with a short reason per criterion. JSON only.";
  const languageNote =
    language === "ar"
      ? "\n\nمهم: النقاش أدناه باللغة العربية. اقرأه وقيّمه بالعربية، واكتب كل حقول \"reason\" و\"summary\" و\"verdict\" داخل JSON باللغة العربية الفصحى فقط. حافظ على مفاتيح JSON كما هي بالإنجليزية.\n"
      : "";
  return [
    {
      role: "system",
      content: (judge.systemPrompt || JUDGE_SYSTEM_PROMPT) + rubricNote(judge) + languageNote,
    },
    {
      role: "user",
      content: `Resolution: "${topic}"\n\nALPHA = ${names.alpha} (argued FOR)\nBETA = ${names.beta} (argued AGAINST)\n\nTranscript:\n\n${transcript}\n\n${closing}`,
    },
  ];
}

function clamp(n: unknown, scale = DEFAULT_JUDGE_SCALE): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return scale / 2;
  return Math.max(0, Math.min(scale, Math.round(v * 10) / 10));
}

export function parseJudgeResponse(
  raw: string,
  judge?: JudgeConfig,
  interim = false,
  turnsScored = 0,
): JudgeScorecard | null {
  const weights = weightsOf(judge);
  const scale = scaleOf(judge);
  const tieThreshold = Number.isFinite(Number(judge?.tieThreshold))
    ? Number(judge?.tieThreshold)
    : DEFAULT_TIE_THRESHOLD;
  const stripped = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const side = (key: Side) => {
    const block = (data[key] ?? {}) as Record<string, unknown>;
    const scores = {} as Record<JudgeCriterion, number>;
    const reasons = {} as Record<JudgeCriterion, string>;
    for (const c of JUDGE_CRITERIA) {
      const entry = block[c] ?? block[c.toLowerCase()];
      if (entry && typeof entry === "object") {
        const obj = entry as Record<string, unknown>;
        scores[c] = clamp(obj.score ?? obj.value, scale);
        reasons[c] = typeof obj.reason === "string" ? obj.reason : "";
      } else {
        scores[c] = clamp(entry, scale);
        const alt = block[`${c.toLowerCase()}_reason`] ?? block[`${c}Reason`];
        reasons[c] = typeof alt === "string" ? alt : "";
      }
    }
    return {
      scores,
      reasons,
      total: weightedTotal(scores, weights),
      summary: typeof block.summary === "string" ? block.summary : "",
    };
  };

  const alpha = side("alpha");
  const beta = side("beta");
  const declared = typeof data.winner === "string" ? data.winner.toLowerCase() : "";
  const gap = Math.abs(alpha.total - beta.total);
  const winner: Side | "tie" =
    gap < tieThreshold
      ? "tie"
      : declared === "alpha" || declared === "beta"
        ? (declared as Side)
        : alpha.total > beta.total
          ? "alpha"
          : "beta";

  return {
    alpha,
    beta,
    winner,
    verdict: typeof data.verdict === "string" ? data.verdict : "",
    simulated: false,
    createdAt: Date.now(),
    interim,
    turnsScored,
    scale,
    maxTotal: maxTotalFor(judge),
    weights,
  };
}


/** Deterministic-but-plausible scoring used when no live judge model is reachable. */
export function simulateJudge(
  topic: string,
  messages: DebateMessage[],
  names: Record<Side, string>,
  judge?: JudgeConfig,
  interim = false,
): JudgeScorecard {
  const weights = weightsOf(judge);
  const scale = scaleOf(judge);
  const tieThreshold = Number.isFinite(Number(judge?.tieThreshold))
    ? Number(judge?.tieThreshold)
    : DEFAULT_TIE_THRESHOLD;
  const k = scale / DEFAULT_JUDGE_SCALE;
  const stats = (s: Side) => {
    const own = messages.filter((m) => m.side === s);
    const text = own.map((m) => m.content).join(" ");
    const words = text.split(/\s+/).filter(Boolean);
    const unique = new Set(words.map((w) => w.toLowerCase())).size;
    const numbers = (text.match(/\d/g) ?? []).length;
    const rebuttals =
      (text.match(/\b(but|however|concede|your|you)\b/gi)?.length ?? 0) +
      (text.match(/(لكن|غير أن|أُسلّم|أقر|موقفك|حجتك|تفنيد)/g)?.length ?? 0);
    const questions = (text.match(/\?/g) ?? []).length;
    const avgSentence = words.length / Math.max(1, (text.match(/[.!?]/g) ?? []).length);
    return { words: words.length, unique, numbers, rebuttals, questions, avgSentence, turns: own.length };
  };

  const build = (s: Side) => {
    const t = stats(s);
    const name = names[s];
    const scores = {
      Logic: clamp(k * (6 + Math.min(2.5, t.unique / 90) + Math.min(1, t.turns / 4)), scale),
      Evidence: clamp(k * (5.5 + Math.min(3.5, t.numbers / 3)), scale),
      Rebuttal: clamp(
        k * (5.5 + Math.min(3.5, t.rebuttals / 4) + Math.min(0.8, t.questions / 3)),
        scale,
      ),
      Clarity: clamp(k * (9.5 - Math.abs(t.avgSentence - 18) / 6), scale),
      Persuasion: clamp(k * (6 + Math.min(3, t.words / 140)), scale),
    } as Record<JudgeCriterion, number>;
    const reasons: Record<JudgeCriterion, string> = {
      Logic: `${t.unique} distinct terms across ${t.turns} turn(s) — ${scores.Logic >= 8 ? "argument chains stayed tight and non-repetitive" : "some claims were restated rather than advanced"}.`,
      Evidence: `${t.numbers} numeric/quantified references — ${scores.Evidence >= 8 ? "claims were consistently backed by figures" : "more concrete data would strengthen the case"}.`,
      Rebuttal: `${t.rebuttals} direct counter-moves and ${t.questions} challenge question(s) aimed at the opponent's framing.`,
      Clarity: `Average sentence length ${t.avgSentence.toFixed(0)} words — ${scores.Clarity >= 8 ? "crisp and easy to follow on stage" : "denser than ideal for a live audience"}.`,
      Persuasion: `${t.words} words of sustained argument; ${scores.Persuasion >= 8 ? `${name} closed with real rhetorical momentum` : `${name} landed the point but with limited escalation`}.`,
    };
    return {
      scores,
      reasons,
      total: weightedTotal(scores, weights),
      summary:
        s === "alpha"
          ? `${names.alpha} built the affirmative case with steady structure and concrete framing across ${t.turns} turns.`
          : `${names.beta} pressed hard on the opposing framing and forced the strongest concessions of the round.`,
    };
  };

  const alpha = build("alpha");
  const beta = build("beta");
  const winner: Side | "tie" =
    Math.abs(alpha.total - beta.total) < tieThreshold
      ? "tie"
      : alpha.total > beta.total
        ? "alpha"
        : "beta";

  const lead = winner === "alpha" ? names.alpha : names.beta;
  const verdict = interim
    ? winner === "tie"
      ? `Running score on "${topic}": dead level so far — ${names.alpha} owns structure, ${names.beta} owns pressure.`
      : `Running score on "${topic}": ${lead} is ahead right now on sharper, better-evidenced rebuttals.`
    : winner === "tie"
      ? `On "${topic}" the two models finished within a rounding error of each other: ${names.alpha} owned structure, ${names.beta} owned pressure.`
      : `On "${topic}" the decision goes to ${lead}, who converted more of their claims into direct, evidenced rebuttals rather than restating the opening position.`;

  return {
    alpha,
    beta,
    winner,
    verdict,
    simulated: true,
    createdAt: Date.now(),
    interim,
    turnsScored: messages.length,
    scale,
    maxTotal: maxTotalFor(judge),
    weights,
  };
}

export async function runLiveJudge(
  judge: JudgeConfig,
  topic: string,
  messages: DebateMessage[],
  names: Record<Side, string>,
  signal?: AbortSignal,
  onChunk?: (raw: string) => void,
  interim = false,
  language: DebateLanguage = "en",
): Promise<{ scorecard: JudgeScorecard | null; raw: string }> {
  const payload = buildJudgeMessages(judge, topic, messages, names, interim, language);

  let raw = "";
  for await (const chunk of streamChat(toDebaterConfig(judge), payload, signal)) {
    if (signal?.aborted) break;
    raw += chunk.content;
    if (chunk.raw) onChunk?.(chunk.raw);
    if (chunk.done) break;
  }
  return { scorecard: parseJudgeResponse(raw, judge, interim, messages.length), raw };
}
