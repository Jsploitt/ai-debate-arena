import { describe, expect, it } from "vitest";

import {
  DEFAULT_JUDGE_SCALE,
  DEFAULT_JUDGE_WEIGHTS,
  DEFAULT_TIE_THRESHOLD,
  JUDGE_CRITERIA,
  buildJudgeMessages,
  maxTotalFor,
  parseJudgeResponse,
  rubricNote,
  simulateJudge,
  weightedTotal,
} from "./judge";
import type { DebateMessage, JudgeConfig, JudgeCriterion, Side } from "./types";

const NAMES: Record<Side, string> = { alpha: "Alpha Model", beta: "Beta Model" };

function judgeConfig(overrides: Partial<JudgeConfig> = {}): JudgeConfig {
  return {
    enabled: true,
    endpoint: "http://localhost:11436",
    model: "judge-model",
    temperature: 0.2,
    systemPrompt: "",
    weights: { ...DEFAULT_JUDGE_WEIGHTS },
    scale: DEFAULT_JUDGE_SCALE,
    tieThreshold: DEFAULT_TIE_THRESHOLD,
    rules: "",
    ...overrides,
  };
}

function message(overrides: Partial<DebateMessage> = {}): DebateMessage {
  return {
    id: "m1",
    side: "alpha",
    round: 1,
    content: "This is my argument.",
    reasoning: "",
    streaming: false,
    telemetry: null,
    ...overrides,
  };
}

describe("weightedTotal", () => {
  it("returns the plain average when all weights are equal", () => {
    const scores = { Logic: 8, Evidence: 6, Rebuttal: 7, Clarity: 9, Persuasion: 5 };
    const weights = { Logic: 1, Evidence: 1, Rebuttal: 1, Clarity: 1, Persuasion: 1 };
    // average is 7, times criteria count (5) / criteria count (5) => average itself scaled
    expect(weightedTotal(scores, weights)).toBeCloseTo(7 * JUDGE_CRITERIA.length, 1);
  });

  it("weights higher-importance criteria more heavily", () => {
    const scores = { Logic: 10, Evidence: 0, Rebuttal: 0, Clarity: 0, Persuasion: 0 };
    const heavyLogic = { Logic: 10, Evidence: 1, Rebuttal: 1, Clarity: 1, Persuasion: 1 };
    const flat = { Logic: 1, Evidence: 1, Rebuttal: 1, Clarity: 1, Persuasion: 1 };
    expect(weightedTotal(scores, heavyLogic)).toBeGreaterThan(weightedTotal(scores, flat));
  });

  it("returns 0 when every weight is 0", () => {
    const scores = { Logic: 10, Evidence: 10, Rebuttal: 10, Clarity: 10, Persuasion: 10 };
    const weights = { Logic: 0, Evidence: 0, Rebuttal: 0, Clarity: 0, Persuasion: 0 };
    expect(weightedTotal(scores, weights)).toBe(0);
  });
});

describe("maxTotalFor", () => {
  it("defaults to the default scale times criteria count", () => {
    expect(maxTotalFor(undefined)).toBe(DEFAULT_JUDGE_SCALE * JUDGE_CRITERIA.length);
  });

  it("scales with a custom judge scale", () => {
    expect(maxTotalFor({ scale: 5 })).toBe(5 * JUDGE_CRITERIA.length);
  });

  it("falls back to the default scale for an invalid value", () => {
    expect(maxTotalFor({ scale: -1 })).toBe(DEFAULT_JUDGE_SCALE * JUDGE_CRITERIA.length);
  });
});

describe("rubricNote", () => {
  it("lists every criterion and its weight", () => {
    const note = rubricNote(judgeConfig());
    for (const c of JUDGE_CRITERIA) expect(note).toContain(`${c} x1`);
  });

  it("calls out zero-weight criteria as ignored", () => {
    const note = rubricNote(judgeConfig({ weights: { ...DEFAULT_JUDGE_WEIGHTS, Persuasion: 0 } }));
    expect(note).toContain("Ignore entirely (weight 0): Persuasion");
  });

  it("appends house rules when present", () => {
    const note = rubricNote(judgeConfig({ rules: "Never favour the first speaker." }));
    expect(note).toContain("House rules: Never favour the first speaker.");
  });

  it("omits the house rules line when rules is blank", () => {
    const note = rubricNote(judgeConfig({ rules: "   " }));
    expect(note).not.toContain("House rules");
  });
});

describe("buildJudgeMessages", () => {
  it("includes the transcript, resolution and both names", () => {
    const messages = [
      message({ id: "a1", side: "alpha", round: 1, content: "Alpha opens." }),
      message({ id: "b1", side: "beta", round: 1, content: "Beta responds." }),
    ];
    const [, user] = buildJudgeMessages(judgeConfig(), "Should X happen?", messages, NAMES);
    expect(user.content).toContain("Should X happen?");
    expect(user.content).toContain("Alpha opens.");
    expect(user.content).toContain("Beta responds.");
    expect(user.content).toContain(NAMES.alpha);
    expect(user.content).toContain(NAMES.beta);
  });

  it("marks an interim request as still in progress", () => {
    const [, user] = buildJudgeMessages(judgeConfig(), "Topic", [], NAMES, true);
    expect(user.content.toLowerCase()).toContain("still in progress");
  });

  it("adds the Arabic language note only for Arabic debates", () => {
    const [systemEn] = buildJudgeMessages(judgeConfig(), "Topic", [], NAMES, false, "en");
    const [systemAr] = buildJudgeMessages(judgeConfig(), "Topic", [], NAMES, false, "ar");
    expect(systemEn.content).not.toContain("مهم");
    expect(systemAr.content).toContain("مهم");
  });
});

function scorecardJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    alpha: {
      Logic: { score: 8, reason: "Clear chain of claims." },
      Evidence: { score: 7, reason: "Cited two figures." },
      Rebuttal: { score: 6, reason: "Addressed one counterpoint." },
      Clarity: { score: 9, reason: "Well organised." },
      Persuasion: { score: 7, reason: "Confident close." },
      summary: "Alpha built a tight case.",
    },
    beta: {
      Logic: { score: 6, reason: "Some gaps in reasoning." },
      Evidence: { score: 5, reason: "Mostly anecdotal." },
      Rebuttal: { score: 7, reason: "Strong counters." },
      Clarity: { score: 6, reason: "A little dense." },
      Persuasion: { score: 6, reason: "Solid but not decisive." },
      summary: "Beta pressed hard but lacked data.",
    },
    winner: "alpha",
    verdict: "Alpha wins on evidence and clarity.",
    ...overrides,
  });
}

describe("parseJudgeResponse", () => {
  it("parses a well-formed scorecard", () => {
    const card = parseJudgeResponse(scorecardJson(), judgeConfig());
    expect(card).not.toBeNull();
    expect(card!.winner).toBe("alpha");
    expect(card!.alpha.scores.Logic).toBe(8);
    expect(card!.beta.scores.Rebuttal).toBe(7);
    expect(card!.verdict).toBe("Alpha wins on evidence and clarity.");
    expect(card!.simulated).toBe(false);
  });

  it("returns null when there is no JSON object at all", () => {
    expect(parseJudgeResponse("I cannot score this debate.", judgeConfig())).toBeNull();
  });

  it("strips <think> blocks before parsing", () => {
    const raw = `<think>scratch notes here</think>${scorecardJson()}`;
    const card = parseJudgeResponse(raw, judgeConfig());
    expect(card).not.toBeNull();
    expect(card!.winner).toBe("alpha");
  });

  it("declares a tie when the gap is below the tie threshold, ignoring the declared winner", () => {
    const raw = scorecardJson({
      alpha: {
        Logic: { score: 7, reason: "x" },
        Evidence: { score: 7, reason: "x" },
        Rebuttal: { score: 7, reason: "x" },
        Clarity: { score: 7, reason: "x" },
        Persuasion: { score: 7, reason: "x" },
        summary: "",
      },
      beta: {
        Logic: { score: 7, reason: "x" },
        Evidence: { score: 7, reason: "x" },
        Rebuttal: { score: 7, reason: "x" },
        Clarity: { score: 7, reason: "x" },
        Persuasion: { score: 7, reason: "x" },
        summary: "",
      },
      winner: "alpha",
    });
    const card = parseJudgeResponse(raw, judgeConfig());
    expect(card!.winner).toBe("tie");
  });

  it("falls back to the higher total when the declared winner is not alpha/beta", () => {
    const card = parseJudgeResponse(scorecardJson({ winner: "unclear" }), judgeConfig());
    expect(card!.winner).toBe("alpha");
  });

  it("recovers a scorecard from truncated streaming JSON", () => {
    const full = scorecardJson();
    // Cut mid-way through the beta block, simulating a stream in flight.
    const cutIndex = full.indexOf('"beta"') + 40;
    const truncated = full.slice(0, cutIndex);
    const card = parseJudgeResponse(truncated, judgeConfig(), true, 2);
    expect(card).not.toBeNull();
    expect(card!.interim).toBe(true);
    expect(card!.turnsScored).toBe(2);
  });

  it("clamps out-of-range and non-numeric scores into the configured scale", () => {
    const raw = scorecardJson({
      alpha: {
        Logic: { score: 999, reason: "x" },
        Evidence: { score: "not-a-number", reason: "x" },
        Rebuttal: { score: -5, reason: "x" },
        Clarity: { score: 5, reason: "x" },
        Persuasion: { score: 5, reason: "x" },
        summary: "",
      },
    });
    const card = parseJudgeResponse(raw, judgeConfig({ scale: 10 }));
    expect(card!.alpha.scores.Logic).toBe(10);
    expect(card!.alpha.scores.Evidence).toBe(5); // scale / 2 fallback for NaN
    expect(card!.alpha.scores.Rebuttal).toBe(0);
  });

  it("respects a custom scale and tie threshold", () => {
    const card = parseJudgeResponse(scorecardJson(), judgeConfig({ scale: 5, tieThreshold: 50 }));
    expect(card!.scale).toBe(5);
    expect(card!.winner).toBe("tie"); // huge tie threshold forces a tie
  });
});

describe("simulateJudge", () => {
  const topic = "Should companies adopt a four-day work week?";

  it("produces a deterministic-shaped scorecard flagged as simulated", () => {
    const messages = [
      message({ id: "a1", side: "alpha", content: "Because productivity rises 10 percent." }),
      message({ id: "b1", side: "beta", content: "However, coverage suffers on Fridays." }),
    ];
    const card = simulateJudge(topic, messages, NAMES);
    expect(card.simulated).toBe(true);
    expect(["alpha", "beta", "tie"]).toContain(card.winner);
    expect(card.turnsScored).toBe(messages.length);
    for (const c of JUDGE_CRITERIA) {
      expect(card.alpha.scores[c]).toBeGreaterThanOrEqual(0);
      expect(card.alpha.scores[c]).toBeLessThanOrEqual(card.scale);
    }
  });

  it("returns a tie with no messages on either side", () => {
    const card = simulateJudge(topic, [], NAMES);
    expect(card.winner).toBe("tie");
  });

  it("rewards a side with more numeric evidence on the Evidence criterion", () => {
    const messages = [
      message({
        id: "a1",
        side: "alpha",
        content: "We saw 10, 20, 30 and 40 percent gains across four separate quarters.",
      }),
      message({ id: "b1", side: "beta", content: "This seems like a generally good idea." }),
    ];
    const card = simulateJudge(topic, messages, NAMES);
    expect(card.alpha.scores.Evidence).toBeGreaterThan(card.beta.scores.Evidence);
  });

  it("writes Arabic reasons and summary when language is ar", () => {
    const messages = [message({ id: "a1", side: "alpha", content: "حجة قوية بالأرقام." })];
    const card = simulateJudge(topic, messages, NAMES, undefined, false, "ar");
    expect(card.alpha.reasons.Logic).toMatch(/[؀-ۿ]/);
  });
});
