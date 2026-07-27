import { streamChat } from "./ollamaClient";
import type {
  ChatMessage,
  DebateMessage,
  DebaterConfig,
  JudgeConfig,
  JudgeCriterion,
  JudgeScorecard,
  Side,
} from "./types";

export const JUDGE_CRITERIA: JudgeCriterion[] = [
  "Logic",
  "Evidence",
  "Rebuttal",
  "Clarity",
  "Persuasion",
];

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
): ChatMessage[] {
  const transcript = messages
    .map((m) => `[Round ${m.round}] ${names[m.side]} (${m.side.toUpperCase()}): ${m.content}`)
    .join("\n\n");
  const closing = interim
    ? "The debate is STILL IN PROGRESS. Give a provisional running score for what has been said so far, with a short reason per criterion. JSON only."
    : "The debate is complete. Score it now, with a short reason per criterion. JSON only.";
  return [
    { role: "system", content: judge.systemPrompt || JUDGE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Resolution: "${topic}"\n\nALPHA = ${names.alpha} (argued FOR)\nBETA = ${names.beta} (argued AGAINST)\n\nTranscript:\n\n${transcript}\n\n${closing}`,
    },
  ];
}

function clamp(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 5;
  return Math.max(0, Math.min(10, Math.round(v * 10) / 10));
}

function sum(scores: Record<JudgeCriterion, number>) {
  return +JUDGE_CRITERIA.reduce((acc, c) => acc + scores[c], 0).toFixed(1);
}

export function parseJudgeResponse(raw: string, interim = false, turnsScored = 0): JudgeScorecard | null {
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
        scores[c] = clamp(obj.score ?? obj.value);
        reasons[c] = typeof obj.reason === "string" ? obj.reason : "";
      } else {
        scores[c] = clamp(entry);
        const alt = block[`${c.toLowerCase()}_reason`] ?? block[`${c}Reason`];
        reasons[c] = typeof alt === "string" ? alt : "";
      }
    }
    return {
      scores,
      reasons,
      total: sum(scores),
      summary: typeof block.summary === "string" ? block.summary : "",
    };
  };

  const alpha = side("alpha");
  const beta = side("beta");
  const declared = typeof data.winner === "string" ? data.winner.toLowerCase() : "";
  const winner: Side | "tie" =
    declared === "alpha" || declared === "beta"
      ? (declared as Side)
      : alpha.total === beta.total
        ? "tie"
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
  };
}


/** Deterministic-but-plausible scoring used when no live judge model is reachable. */
export function simulateJudge(
  topic: string,
  messages: DebateMessage[],
  names: Record<Side, string>,
  interim = false,
): JudgeScorecard {
  const stats = (s: Side) => {
    const own = messages.filter((m) => m.side === s);
    const text = own.map((m) => m.content).join(" ");
    const words = text.split(/\s+/).filter(Boolean);
    const unique = new Set(words.map((w) => w.toLowerCase())).size;
    const numbers = (text.match(/\d/g) ?? []).length;
    const rebuttals = (text.match(/\b(but|however|concede|your|you)\b/gi) ?? []).length;
    const questions = (text.match(/\?/g) ?? []).length;
    const avgSentence = words.length / Math.max(1, (text.match(/[.!?]/g) ?? []).length);
    return { words: words.length, unique, numbers, rebuttals, questions, avgSentence, turns: own.length };
  };

  const build = (s: Side) => {
    const t = stats(s);
    const name = names[s];
    const scores = {
      Logic: clamp(6 + Math.min(2.5, t.unique / 90) + Math.min(1, t.turns / 4)),
      Evidence: clamp(5.5 + Math.min(3.5, t.numbers / 3)),
      Rebuttal: clamp(5.5 + Math.min(3.5, t.rebuttals / 4) + Math.min(0.8, t.questions / 3)),
      Clarity: clamp(9.5 - Math.abs(t.avgSentence - 18) / 6),
      Persuasion: clamp(6 + Math.min(3, t.words / 140)),
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
      total: sum(scores),
      summary:
        s === "alpha"
          ? `${names.alpha} built the affirmative case with steady structure and concrete framing across ${t.turns} turns.`
          : `${names.beta} pressed hard on the opposing framing and forced the strongest concessions of the round.`,
    };
  };

  const alpha = build("alpha");
  const beta = build("beta");
  const winner: Side | "tie" =
    Math.abs(alpha.total - beta.total) < 0.4 ? "tie" : alpha.total > beta.total ? "alpha" : "beta";

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
): Promise<{ scorecard: JudgeScorecard | null; raw: string }> {
  const payload = buildJudgeMessages(judge, topic, messages, names, interim);

  let raw = "";
  for await (const chunk of streamChat(toDebaterConfig(judge), payload, signal)) {
    if (signal?.aborted) break;
    raw += chunk.content;
    if (chunk.raw) onChunk?.(chunk.raw);
    if (chunk.done) break;
  }
  return { scorecard: parseJudgeResponse(raw, interim, messages.length), raw };
}
