import { describe, expect, it } from "vitest";

import {
  agentMood,
  cloudText,
  currentTurnMessage,
  deliveredTurnCount,
  effectiveRound,
  effectiveStatus,
  focusSide,
  leanPercent,
  revealedText,
  roundFromTurn,
  runtimeLabel,
  runtimeState,
  scoredTurnsDelivered,
  speakingSide,
  type SpeechView,
} from "./presentation";
import type { DebateMessage, JudgeScorecard, Side, SpeakerStatus } from "./types";

function msg(overrides: Partial<DebateMessage> = {}): DebateMessage {
  return {
    id: "m1",
    side: "alpha",
    round: 1,
    content: "Hello world this is a message",
    reasoning: "",
    streaming: false,
    telemetry: null,
    ...overrides,
  };
}

function speech(overrides: Partial<SpeechView> = {}): SpeechView {
  return {
    speakingId: null,
    revealFraction: 0,
    revealedIds: new Set<string>(),
    syncActive: false,
    ...overrides,
  };
}

const IDLE_STATUS: Record<Side, SpeakerStatus> = { alpha: "idle", beta: "idle" };

describe("revealedText", () => {
  it("returns the full text at fraction >= 1", () => {
    expect(revealedText("one two three", 1)).toBe("one two three");
    expect(revealedText("one two three", 1.5)).toBe("one two three");
  });

  it("returns empty string at fraction <= 0", () => {
    expect(revealedText("one two three", 0)).toBe("");
    expect(revealedText("one two three", -1)).toBe("");
  });

  it("never cuts a word in half", () => {
    const out = revealedText("alpha beta gamma delta", 0.5);
    for (const word of out.trim().split(/\s+/)) {
      expect(["alpha", "beta", "gamma", "delta"]).toContain(word);
    }
  });

  it("reveals more words as the fraction grows", () => {
    const text = "one two three four five six seven eight";
    const early = revealedText(text, 0.25).trim().split(/\s+/).filter(Boolean).length;
    const late = revealedText(text, 0.75).trim().split(/\s+/).filter(Boolean).length;
    expect(late).toBeGreaterThan(early);
  });

  it("returns empty string for an empty input", () => {
    expect(revealedText("", 0.5)).toBe("");
  });
});

describe("roundFromTurn", () => {
  it("maps turn pairs to the same round", () => {
    expect(roundFromTurn(0)).toBe(1);
    expect(roundFromTurn(1)).toBe(1);
    expect(roundFromTurn(2)).toBe(2);
    expect(roundFromTurn(3)).toBe(2);
  });
});

describe("effectiveStatus", () => {
  it("returns raw status when sync is inactive", () => {
    const status: Record<Side, SpeakerStatus> = { alpha: "thinking", beta: "idle" };
    expect(effectiveStatus("alpha", status, [], speech())).toBe("thinking");
  });

  it("reports speaking for the side currently voiced", () => {
    const messages = [msg({ id: "a1", side: "alpha" })];
    const sp = speech({ syncActive: true, speakingId: "a1" });
    expect(effectiveStatus("alpha", IDLE_STATUS, messages, sp)).toBe("speaking");
  });

  it("reports thinking when voice has unread content pending", () => {
    const messages = [msg({ id: "a1", side: "alpha", content: "not yet heard" })];
    const sp = speech({ syncActive: true, speakingId: null, revealedIds: new Set() });
    expect(effectiveStatus("alpha", IDLE_STATUS, messages, sp)).toBe("thinking");
  });

  it("reports idle once everything has been revealed and status is idle", () => {
    const messages = [msg({ id: "a1", side: "alpha", content: "already heard" })];
    const sp = speech({ syncActive: true, speakingId: null, revealedIds: new Set(["a1"]) });
    expect(effectiveStatus("alpha", IDLE_STATUS, messages, sp)).toBe("idle");
  });
});

describe("speakingSide", () => {
  it("returns null when neither side is speaking", () => {
    expect(speakingSide(IDLE_STATUS, [], speech())).toBeNull();
  });

  it("returns alpha when alpha is speaking", () => {
    const status: Record<Side, SpeakerStatus> = { alpha: "speaking", beta: "idle" };
    expect(speakingSide(status, [], speech())).toBe("alpha");
  });

  it("prefers alpha when somehow both read speaking", () => {
    const status: Record<Side, SpeakerStatus> = { alpha: "speaking", beta: "speaking" };
    expect(speakingSide(status, [], speech())).toBe("alpha");
  });
});

describe("deliveredTurnCount", () => {
  it("counts finalized non-empty messages without sync", () => {
    const messages = [
      msg({ id: "a1", streaming: false, content: "done" }),
      msg({ id: "a2", streaming: true, content: "still going" }),
      msg({ id: "a3", streaming: false, content: "" }),
    ];
    expect(deliveredTurnCount(messages, speech())).toBe(1);
  });

  it("counts revealed ids when sync is active", () => {
    const messages = [msg({ id: "a1" }), msg({ id: "a2" })];
    const sp = speech({ syncActive: true, revealedIds: new Set(["a1"]) });
    expect(deliveredTurnCount(messages, sp)).toBe(1);
  });
});

describe("focusSide", () => {
  it("returns the speaking side when someone holds the floor", () => {
    expect(focusSide("beta", [], speech())).toBe("beta");
  });

  it("falls back to the last message's side without sync", () => {
    const messages = [msg({ side: "alpha" }), msg({ side: "beta" })];
    expect(focusSide(null, messages, speech())).toBe("beta");
  });

  it("falls back to the last revealed message's side with sync", () => {
    const messages = [msg({ id: "a1", side: "alpha" }), msg({ id: "b1", side: "beta" })];
    const sp = speech({ syncActive: true, revealedIds: new Set(["a1"]) });
    expect(focusSide(null, messages, sp)).toBe("alpha");
  });

  it("returns null when nothing has been revealed under sync", () => {
    const messages = [msg({ id: "a1", side: "alpha" })];
    const sp = speech({ syncActive: true, revealedIds: new Set() });
    expect(focusSide(null, messages, sp)).toBeNull();
  });
});

describe("currentTurnMessage", () => {
  it("returns the last non-empty message without sync", () => {
    const messages = [msg({ id: "a1", content: "first" }), msg({ id: "a2", content: "" })];
    expect(currentTurnMessage(messages, speech())?.id).toBe("a1");
  });

  it("returns the speaking message when sync is active", () => {
    const messages = [msg({ id: "a1" }), msg({ id: "a2" })];
    const sp = speech({ syncActive: true, speakingId: "a2" });
    expect(currentTurnMessage(messages, sp)?.id).toBe("a2");
  });

  it("returns the last revealed message when nobody is currently speaking", () => {
    const messages = [msg({ id: "a1" }), msg({ id: "a2" })];
    const sp = speech({ syncActive: true, speakingId: null, revealedIds: new Set(["a1"]) });
    expect(currentTurnMessage(messages, sp)?.id).toBe("a1");
  });
});

describe("cloudText", () => {
  it("returns the latest message's content without sync", () => {
    const messages = [msg({ id: "a1", side: "alpha", content: "hello" })];
    expect(cloudText("alpha", messages, speech())).toBe("hello");
  });

  it("returns null when the side has no messages", () => {
    expect(cloudText("beta", [], speech())).toBeNull();
  });

  it("truncates to the revealed fraction while the speaker is mid-turn", () => {
    const messages = [msg({ id: "a1", side: "alpha", content: "one two three four" })];
    const sp = speech({ syncActive: true, speakingId: "a1", revealFraction: 0.5 });
    const text = cloudText("alpha", messages, sp);
    expect(text).not.toBeNull();
    expect(text!.length).toBeLessThan("one two three four".length);
  });
});

describe("agentMood", () => {
  it("is speaking when this side is speaking", () => {
    expect(agentMood("alpha", "alpha", 5, 3)).toBe("speaking");
  });

  it("is base on a tie", () => {
    expect(agentMood("alpha", null, 5, 5)).toBe("base");
  });

  it("is pleased when ahead and tense when behind", () => {
    expect(agentMood("alpha", null, 8, 5)).toBe("pleased");
    expect(agentMood("alpha", null, 5, 8)).toBe("tense");
  });
});

describe("scoredTurnsDelivered", () => {
  const scorecard = { turnsScored: 2 } as JudgeScorecard;

  it("is false while fewer turns have been delivered than scored", () => {
    const messages = [msg({ id: "a1" })];
    expect(scoredTurnsDelivered(scorecard, messages, speech())).toBe(false);
  });

  it("is true once delivered turns catch up", () => {
    const messages = [msg({ id: "a1" }), msg({ id: "a2" })];
    expect(scoredTurnsDelivered(scorecard, messages, speech())).toBe(true);
  });
});

describe("leanPercent", () => {
  it("centres at 50 when both sides are at zero", () => {
    expect(leanPercent(0, 0)).toBe(50);
  });

  it("pulls the indicator toward the leading side", () => {
    // alpha (pro) ahead should pull toward alpha's end, i.e. below 50.
    expect(leanPercent(45, 30)).toBeLessThan(50);
    expect(leanPercent(30, 45)).toBeGreaterThan(50);
  });

  it("clamps away from the extremes", () => {
    expect(leanPercent(100, 0)).toBeLessThanOrEqual(92);
    expect(leanPercent(0, 100)).toBeGreaterThanOrEqual(8);
  });

  it("moves visibly on a realistic lead", () => {
    // Share-of-total put a five-point lead at 46.5% — three percent off
    // centre, indistinguishable from a tie at the back of a room.
    expect(leanPercent(38, 33)).toBeLessThan(40);
    expect(leanPercent(33, 38)).toBeGreaterThan(60);
  });

  it("does not go numb as the totals grow", () => {
    // The same margin must read the same late in a debate as early on, which
    // share-of-total could not do: its denominator kept growing.
    const early = leanPercent(10, 16);
    const late = leanPercent(40, 46);
    expect(Math.abs(early - 50)).toBeGreaterThan(10);
    expect(Math.abs(late - 50)).toBeGreaterThan(10);
  });

  it("is symmetric about the centre", () => {
    expect(leanPercent(41, 32) + leanPercent(32, 41)).toBeCloseTo(100, 5);
  });
});

describe("runtimeState", () => {
  const base = {
    status: IDLE_STATUS,
    health: { alpha: "unknown", beta: "unknown" } as const,
    messages: [] as DebateMessage[],
    judging: false,
    usingSimulation: false,
    speech: speech(),
  };

  it("reports paused directly from phase", () => {
    expect(runtimeState({ ...base, phase: "paused" })).toBe("paused");
  });

  it("reports judging or finished for phase finished", () => {
    expect(runtimeState({ ...base, phase: "finished", judging: true })).toBe("judging");
    expect(runtimeState({ ...base, phase: "finished", judging: false })).toBe("finished");
  });

  it("reports offline only when idle, offline and not simulating", () => {
    const offlineHealth = { alpha: "offline", beta: "offline" } as const;
    expect(runtimeState({ ...base, phase: "idle", health: offlineHealth })).toBe("offline");
    expect(
      runtimeState({ ...base, phase: "idle", health: offlineHealth, usingSimulation: true }),
    ).toBe("idle");
  });

  it("reports checking while health is still resolving", () => {
    expect(
      runtimeState({ ...base, phase: "idle", health: { alpha: "checking", beta: "unknown" } }),
    ).toBe("checking");
  });

  it("reports streaming while a message is still generating", () => {
    const messages = [msg({ streaming: true })];
    expect(runtimeState({ ...base, phase: "running", messages })).toBe("streaming");
  });

  it("reports starting on a fresh running phase with no messages yet", () => {
    expect(runtimeState({ ...base, phase: "running" })).toBe("starting");
  });
});

describe("runtimeLabel", () => {
  it("appends the simulation suffix only when simulating", () => {
    expect(runtimeLabel("thinking", false)).toBe("Thinking…");
    expect(runtimeLabel("thinking", true)).toBe("Thinking… (simulation)");
  });

  it("has a distinct label for every runtime state", () => {
    const states = [
      "idle",
      "checking",
      "offline",
      "starting",
      "thinking",
      "streaming",
      "speaking",
      "paused",
      "judging",
      "finished",
    ] as const;
    const labels = new Set(states.map((s) => runtimeLabel(s, false)));
    expect(labels.size).toBe(states.length);
  });
});

describe("effectiveRound", () => {
  it("falls back to roundFromTurn without sync", () => {
    expect(effectiveRound(2, [], speech())).toBe(roundFromTurn(2));
  });

  it("uses the speaking message's round under sync", () => {
    const messages = [msg({ id: "a1", round: 3 })];
    const sp = speech({ syncActive: true, speakingId: "a1" });
    expect(effectiveRound(0, messages, sp)).toBe(3);
  });
});
