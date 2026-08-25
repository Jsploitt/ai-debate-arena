import { describe, expect, it } from "vitest";

import { buildTranscriptMarkdown } from "./transcript";
import type { ArenaSettings, DebateMessage, JudgeScorecard } from "./debate/types";

function settings(overrides: Partial<ArenaSettings> = {}): ArenaSettings {
  return {
    alpha: {
      name: "Alpha Model",
      model: "llama3",
      endpoint: "",
      temperature: 0.7,
      topP: 0.9,
      systemPrompt: "",
      thinkingLevel: 0,
      tonePreset: "Custom",
    },
    beta: {
      name: "Beta Model",
      model: "mistral",
      endpoint: "",
      temperature: 0.7,
      topP: 0.9,
      systemPrompt: "",
      thinkingLevel: 0,
      tonePreset: "Custom",
    },
    rounds: 4,
    mode: "auto",
    contextWindow: 4096,
    judge: {
      enabled: true,
      endpoint: "",
      model: "judge",
      temperature: 0.2,
      systemPrompt: "",
      weights: { Logic: 1, Evidence: 1, Rebuttal: 1, Clarity: 1, Persuasion: 1 },
      scale: 10,
      tieThreshold: 0.4,
      rules: "",
    },
    language: "en",
    tts: { enabled: false, endpointEn: "" },
    ...overrides,
  } as ArenaSettings;
}

function message(overrides: Partial<DebateMessage> = {}): DebateMessage {
  return {
    id: "m1",
    side: "alpha",
    round: 1,
    content: "My opening argument.",
    reasoning: "",
    streaming: false,
    telemetry: null,
    ...overrides,
  };
}

function scorecard(overrides: Partial<JudgeScorecard> = {}): JudgeScorecard {
  return {
    alpha: {
      scores: { Logic: 8, Evidence: 7, Rebuttal: 6, Clarity: 9, Persuasion: 7 },
      reasons: {
        Logic: "sharp",
        Evidence: "solid",
        Rebuttal: "fine",
        Clarity: "clean",
        Persuasion: "good",
      },
      total: 37,
      summary: "Strong overall.",
    },
    beta: {
      scores: { Logic: 6, Evidence: 5, Rebuttal: 7, Clarity: 6, Persuasion: 6 },
      reasons: {
        Logic: "ok",
        Evidence: "thin",
        Rebuttal: "sharp",
        Clarity: "dense",
        Persuasion: "fine",
      },
      total: 30,
      summary: "Pressed hard.",
    },
    winner: "alpha",
    verdict: "Alpha takes it on evidence.",
    simulated: false,
    createdAt: 0,
    interim: false,
    turnsScored: 2,
    scale: 10,
    maxTotal: 50,
    weights: { Logic: 1, Evidence: 1, Rebuttal: 1, Clarity: 1, Persuasion: 1 },
    ...overrides,
  };
}

const NOW = new Date("2026-01-01T12:00:00Z");

describe("buildTranscriptMarkdown", () => {
  it("includes the resolution, mode and language header", () => {
    const md = buildTranscriptMarkdown({
      topic: "Should X happen?",
      messages: [],
      scorecard: null,
      settings: settings(),
      simulated: false,
      now: NOW,
    });
    expect(md).toContain("**Resolution:** Should X happen?");
    expect(md).toContain("**Mode:** Live local API");
    expect(md).toContain("**Debate language:** English");
  });

  it("labels a simulated run and Arabic language", () => {
    const md = buildTranscriptMarkdown({
      topic: "Topic",
      messages: [],
      scorecard: null,
      settings: settings({ language: "ar" }),
      simulated: true,
      now: NOW,
    });
    expect(md).toContain("**Mode:** Simulation");
    expect(md).toContain("**Debate language:** Arabic");
  });

  it("falls back to (none) for an empty topic", () => {
    const md = buildTranscriptMarkdown({
      topic: "",
      messages: [],
      scorecard: null,
      settings: settings(),
      simulated: false,
      now: NOW,
    });
    expect(md).toContain("**Resolution:** (none)");
  });

  it("renders each message with its round heading and model name", () => {
    const messages = [
      message({ id: "a1", side: "alpha", round: 1, content: "Alpha's opener." }),
      message({ id: "b1", side: "beta", round: 1, content: "Beta's reply." }),
    ];
    const md = buildTranscriptMarkdown({
      topic: "T",
      messages,
      scorecard: null,
      settings: settings(),
      simulated: false,
      now: NOW,
    });
    expect(md).toContain("## Round 1 — Alpha Model (llama3)");
    expect(md).toContain("Alpha's opener.");
    expect(md).toContain("## Round 1 — Beta Model (mistral)");
    expect(md).toContain("Beta's reply.");
  });

  it("includes reasoning and telemetry when present", () => {
    const messages = [
      message({
        reasoning: "Thinking step one.\nThinking step two.",
        telemetry: { ttftMs: 120, tokensPerSec: 42, tokens: 88, promptTokens: 10, durationMs: 900 },
      }),
    ];
    const md = buildTranscriptMarkdown({
      topic: "T",
      messages,
      scorecard: null,
      settings: settings(),
      simulated: false,
      now: NOW,
    });
    expect(md).toContain("> Reasoning: Thinking step one. Thinking step two.");
    expect(md).toContain("TTFT 120ms · 42 tok/s · 88 tokens");
  });

  it("omits the scorecard section entirely when there is no scorecard", () => {
    const md = buildTranscriptMarkdown({
      topic: "T",
      messages: [],
      scorecard: null,
      settings: settings(),
      simulated: false,
      now: NOW,
    });
    expect(md).not.toContain("AI Judge Scorecard");
  });

  it("renders the scorecard table with weights, scores and the winner", () => {
    const md = buildTranscriptMarkdown({
      topic: "T",
      messages: [],
      scorecard: scorecard(),
      settings: settings(),
      simulated: false,
      now: NOW,
    });
    expect(md).toContain("## AI Judge Scorecard");
    expect(md).toContain("| Logic | ×1 | 8.0 | sharp | 6.0 | ok |");
    expect(md).toContain("**Winner:** Alpha Model");
    expect(md).toContain("Alpha takes it on evidence.");
  });

  it("marks a heuristic (simulated) and provisional (interim) scorecard", () => {
    const md = buildTranscriptMarkdown({
      topic: "T",
      messages: [],
      scorecard: scorecard({ simulated: true, interim: true }),
      settings: settings(),
      simulated: false,
      now: NOW,
    });
    expect(md).toContain("(heuristic)");
    expect(md).toContain("provisional (debate in progress)");
  });

  it("reports a draw when the scorecard is tied", () => {
    const md = buildTranscriptMarkdown({
      topic: "T",
      messages: [],
      scorecard: scorecard({ winner: "tie" }),
      settings: settings(),
      simulated: false,
      now: NOW,
    });
    expect(md).toContain("**Winner:** Draw");
  });
});
