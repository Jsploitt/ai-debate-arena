import { describe, expect, it } from "vitest";

import { readArgument, spokenText, stripMeta } from "./spokenText";

describe("readArgument", () => {
  it("reads a complete value", () => {
    expect(readArgument('{"argument": "Free tiers build trust."}')).toBe("Free tiers build trust.");
  });

  it("streams: yields the words decoded so far from partial JSON", () => {
    const full = '{ "argument" : "Free tiers build trust, and that is how you win." }';
    const seen = [];
    for (let i = 1; i <= full.length; i++) seen.push(readArgument(full.slice(0, i)));
    // Monotonic — the stage never shows text it then takes back.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].startsWith(seen[i - 1])).toBe(true);
    }
    expect(seen[seen.length - 1]).toBe("Free tiers build trust, and that is how you win.");
  });

  it("returns nothing before the value has started", () => {
    expect(readArgument("{")).toBe("");
    expect(readArgument('{ "argu')).toBe("");
    expect(readArgument('{ "argument"')).toBe("");
    expect(readArgument('{ "argument" :')).toBe("");
  });

  it("handles escapes, including a quote inside the argument", () => {
    expect(readArgument('{"argument":"He said \\"no\\" firmly."}')).toBe('He said "no" firmly.');
    expect(readArgument('{"argument":"line one\\nline two"}')).toBe("line one\nline two");
    expect(readArgument('{"argument":"caf\\u00e9"}')).toBe("café");
  });

  it("waits rather than emitting half an escape sequence", () => {
    expect(readArgument('{"argument":"caf\\')).toBe("caf");
    expect(readArgument('{"argument":"caf\\u00')).toBe("caf");
  });
});

describe("stripMeta", () => {
  it("removes a trailing self-reported word count", () => {
    expect(stripMeta("Free tiers build trust. (47 words)")).toBe("Free tiers build trust.");
    expect(stripMeta("Free tiers build trust. [47 words]")).toBe("Free tiers build trust.");
    expect(stripMeta("Free tiers build trust. (approx. 47 words)")).toBe("Free tiers build trust.");
  });

  it("leaves an ordinary parenthetical alone", () => {
    const line = "Free tiers (the entry point) build trust.";
    expect(stripMeta(line)).toBe(line);
    expect(stripMeta("We grew by a factor of 3 (a real result).")).toBe(
      "We grew by a factor of 3 (a real result).",
    );
  });

  it("removes a trailing bracketed note", () => {
    expect(stripMeta("Free tiers build trust. [Thinking: keep it short]")).toBe(
      "Free tiers build trust.",
    );
  });

  it("removes a bare unbracketed count sign-off (the qwen3 shape)", () => {
    expect(stripMeta("Paper wins. 46 words, within limit")).toBe("Paper wins.");
    expect(stripMeta("Paper wins. 46 words, within limit.")).toBe("Paper wins.");
    expect(stripMeta("Paper wins.\n46 words")).toBe("Paper wins.");
    expect(stripMeta("Paper wins. Exactly 50 words — under the cap.")).toBe("Paper wins.");
    expect(stripMeta("Paper wins. Word count: 46")).toBe("Paper wins.");
    expect(stripMeta("Paper wins. Within the 50-word limit.")).toBe("Paper wins.");
    expect(stripMeta("Paper wins. That's 49 words.")).toBe("Paper wins.");
  });

  it("removes stacked meta sign-offs in one pass", () => {
    expect(stripMeta("Paper wins. (46 words)\nWithin the limit.")).toBe("Paper wins.");
  });

  it("keeps a real final sentence that mentions words or limits", () => {
    const words = "Cut a thousand words from every report and people read them.";
    expect(stripMeta(words)).toBe(words);
    const limit = "Speed without accuracy is a limit, not a feature.";
    expect(stripMeta(limit)).toBe(limit);
    const midCount = "A 50 words summary beats a memo."; // count leads the sentence but carries meaning
    expect(stripMeta("Paper wins. " + midCount)).toBe("Paper wins. " + midCount);
  });
});

describe("spokenText", () => {
  it("is what the stage, the voice and the judge all see", () => {
    expect(spokenText('{"argument":"Free tiers build trust. (47 words)"}')).toBe(
      "Free tiers build trust.",
    );
  });

  it("never leaks a preamble, because the grammar cannot produce one", () => {
    // Under constrained decoding this is the only shape the model can emit.
    expect(spokenText('{"argument":"Okay, the user wants me to argue."}')).toBe(
      "Okay, the user wants me to argue.",
    );
    // ...and anything outside the object is simply not read.
    expect(spokenText('Okay, the user wants me to{"argument":"Free tiers build trust."}')).toBe(
      "Free tiers build trust.",
    );
  });
});
