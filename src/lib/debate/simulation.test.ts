import { describe, expect, it } from "vitest";

import { simulateStream, simulatedTurnText } from "./simulation";

describe("simulatedTurnText", () => {
  it("picks a topic-matched script when keywords are present", () => {
    const text = simulatedTurnText("AI safety and regulation", "alpha", 0);
    expect(text).toContain("accountability");
  });

  it("falls back to the generic pool for an unmatched topic", () => {
    const text = simulatedTurnText("Should we eat more vegetables", "alpha", 0);
    expect(text).toContain("Should we eat more vegetables");
  });

  it("cycles through the pool as the turn index grows", () => {
    const topic = "Unrelated generic topic";
    const first = simulatedTurnText(topic, "beta", 0);
    const second = simulatedTurnText(topic, "beta", 1);
    expect(first).not.toBe(second);
  });

  it("substitutes the topic placeholder with the trimmed resolution", () => {
    const text = simulatedTurnText("Robots should vote.", "alpha", 0);
    expect(text).toContain("Robots should vote");
    expect(text).not.toContain("{topic}");
  });

  it("returns Arabic text for Arabic debates", () => {
    const text = simulatedTurnText("موضوع عام", "alpha", 0, "ar");
    expect(text).toMatch(/[؀-ۿ]/);
  });

  it("gives alpha and beta different content for the same turn", () => {
    const topic = "AI ethics and safety";
    expect(simulatedTurnText(topic, "alpha", 0)).not.toBe(simulatedTurnText(topic, "beta", 0));
  });
});

describe("simulateStream", () => {
  it("yields the text split into pieces, then a final done chunk", async () => {
    const chunks = [];
    for await (const chunk of simulateStream("hello there world", "sim-model")) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(1);
    const last = chunks[chunks.length - 1];
    expect(last.done).toBe(true);
    expect(last.evalCount).toBe(chunks.length - 1);

    const rebuilt = chunks
      .filter((c) => !c.done)
      .map((c) => c.content)
      .join("");
    expect(rebuilt.trim()).toBe("hello there world");
  });

  it("stops early when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const chunks = [];
    for await (const chunk of simulateStream("hello there", "sim-model", controller.signal)) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(0);
  });
});
