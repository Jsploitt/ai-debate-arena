import { describe, expect, it } from "vitest";

import {
  barCriteria,
  briefAuthorSide,
  briefFilename,
  extractJsonObjects,
  fabricatedFields,
  hasFabricatedNumber,
  parseBriefFields,
  renderBrief,
  simulateBriefFields,
  type BriefFacts,
  type BriefFields,
} from "./brief";
import { PERSONAS } from "../personas";
import type { JudgeScorecard } from "../debate/types";

describe("hasFabricatedNumber", () => {
  it("flags bare digits, percents and currency marks", () => {
    expect(hasFabricatedNumber("Revenue grew 12 percent.")).toBe(true);
    expect(hasFabricatedNumber("Costs fell $500 last quarter.")).toBe(true);
    expect(hasFabricatedNumber("A clean 90% pass rate.")).toBe(true);
  });

  it("flags a spelled-out numeral immediately followed by a unit", () => {
    expect(hasFabricatedNumber("We saw five percent growth.")).toBe(true);
    expect(hasFabricatedNumber("Ready within three months.")).toBe(true);
  });

  it("allows a spelled-out numeral used qualitatively", () => {
    expect(hasFabricatedNumber("This was one of the strongest arguments made.")).toBe(false);
  });

  it("allows plain qualitative prose with no figures", () => {
    expect(hasFabricatedNumber("The case rested on durability and trust.")).toBe(false);
  });
});

describe("fabricatedFields", () => {
  it("collects every offending field across next/reasons/watch/verdict", () => {
    const fields: BriefFields = {
      next: ["Fine.", "Grew 12 percent.", "", ""],
      reasons: ["Also fine.", "", "", ""],
      watch: ["", "", "$500 exposure.", ""],
      verdict: "Solid close.",
    };
    expect(fabricatedFields(fields)).toEqual(["Grew 12 percent.", "$500 exposure."]);
  });

  it("returns an empty list when nothing is fabricated", () => {
    const fields: BriefFields = {
      next: ["Fine.", "", "", ""],
      reasons: ["", "", "", ""],
      watch: ["", "", "", ""],
      verdict: "All qualitative.",
    };
    expect(fabricatedFields(fields)).toEqual([]);
  });
});

describe("extractJsonObjects", () => {
  it("parses a single well-formed object", () => {
    const objs = extractJsonObjects('{"a":1}');
    expect(objs).toEqual([{ a: 1 }]);
  });

  it("skips model scratch text before the real JSON object", () => {
    const raw = 'Sure, here is the object: {"a": 1, "b": "two"}';
    expect(extractJsonObjects(raw)).toEqual([{ a: 1, b: "two" }]);
  });

  it("recovers a valid object even when an earlier brace fragment is unparsable", () => {
    const raw = '<think>let me consider { not json </think>{"a": 1}';
    expect(extractJsonObjects(raw)).toEqual([{ a: 1 }]);
  });

  it("ignores braces inside string values", () => {
    const raw = '{"note": "use { and } carefully"}';
    expect(extractJsonObjects(raw)).toEqual([{ note: "use { and } carefully" }]);
  });

  it("returns an empty array when there is no JSON at all", () => {
    expect(extractJsonObjects("no braces here")).toEqual([]);
  });
});

describe("parseBriefFields", () => {
  it("parses a complete, well-formed payload", () => {
    const raw = JSON.stringify({
      next: ["a", "b", "c", "d"],
      reasons: ["e", "f", "g", "h"],
      watch: ["i", "j", "k", "l"],
      verdict: "Ship it.",
    });
    const fields = parseBriefFields(raw);
    expect(fields).not.toBeNull();
    expect(fields!.next).toEqual(["a", "b", "c", "d"]);
    expect(fields!.verdict).toBe("Ship it.");
  });

  it("pads a short array to four slots instead of rejecting it", () => {
    const raw = JSON.stringify({
      next: ["only one"],
      reasons: [],
      watch: ["x", "y"],
      verdict: "Fine.",
    });
    const fields = parseBriefFields(raw);
    expect(fields).not.toBeNull();
    expect(fields!.next).toEqual(["only one", "", "", ""]);
    expect(fields!.reasons).toEqual(["", "", "", ""]);
  });

  it("returns null when nothing in the response has any content", () => {
    const raw = JSON.stringify({ next: [], reasons: [], watch: [], verdict: "" });
    expect(parseBriefFields(raw)).toBeNull();
  });

  it("returns null for unparseable garbage", () => {
    expect(parseBriefFields("not json at all")).toBeNull();
  });
});

describe("barCriteria", () => {
  it("returns the persona's four highest-weighted criteria, heaviest first", () => {
    const bars = barCriteria(PERSONAS.cfo);
    expect(bars[0]).toBe("Evidence"); // cfo weights Evidence heaviest
    expect(bars).toHaveLength(4);
    expect(bars).not.toContain("Persuasion"); // cfo's lowest weight, dropped
  });

  it("differs by persona focus", () => {
    expect(barCriteria(PERSONAS.cto)[0]).toBe("Logic");
    expect(barCriteria(PERSONAS.cmo)[0]).toBe("Persuasion");
    expect(barCriteria(PERSONAS.ceo)[0]).toBe("Clarity");
  });
});

describe("briefAuthorSide", () => {
  it("is beta only when beta explicitly won", () => {
    expect(briefAuthorSide({ winner: "beta" } as JudgeScorecard)).toBe("beta");
    expect(briefAuthorSide({ winner: "alpha" } as JudgeScorecard)).toBe("alpha");
    expect(briefAuthorSide({ winner: "tie" } as JudgeScorecard)).toBe("alpha");
  });
});

describe("briefFilename", () => {
  it("slugifies the topic and tags the persona", () => {
    expect(briefFilename("cfo", "Should We Adopt a 4-Day Week?")).toBe(
      "cfo-verdict-should-we-adopt-a-4-day-week.html",
    );
  });

  it("falls back to a generic slug for an empty topic", () => {
    expect(briefFilename("cto", "")).toBe("cto-verdict-debate.html");
  });

  it("truncates very long topics", () => {
    const longTopic = "a".repeat(200);
    const filename = briefFilename("ceo", longTopic);
    expect(filename.length).toBeLessThan(80);
  });
});

describe("simulateBriefFields", () => {
  it("returns non-empty, persona-specific fields with no fabricated numbers", () => {
    const scorecard = { winner: "alpha" } as JudgeScorecard;
    const fields = simulateBriefFields({
      persona: PERSONAS.ceo,
      scorecard,
      names: { alpha: "Alpha Model", beta: "Beta Model" },
    });
    expect(fields.next).toHaveLength(4);
    expect(fabricatedFields(fields)).toEqual([]);
    expect(fields.verdict).toContain("Alpha Model");
  });

  it("uses the tie verdict wording when the scorecard is a tie", () => {
    const scorecard = { winner: "tie" } as JudgeScorecard;
    const fields = simulateBriefFields({
      persona: PERSONAS.cfo,
      scorecard,
      names: { alpha: "Alpha Model", beta: "Beta Model" },
    });
    expect(fields.verdict.toLowerCase()).toContain("unresolved");
  });
});

describe("renderBrief", () => {
  const facts: BriefFacts = {
    personaId: "cfo",
    topic: "Should we adopt <b>AI</b> tooling?",
    winnerName: "Alpha Model",
    winnerTag: "FOR",
    scores: { Logic: 8, Evidence: 9, Rebuttal: 7, Clarity: 6, Persuasion: 5 },
    scale: 10,
  };

  it("escapes HTML-sensitive characters from real data", () => {
    const html = renderBrief(facts, null);
    expect(html).toContain("&lt;b&gt;AI&lt;/b&gt;");
    expect(html).not.toContain("<b>AI</b>?");
  });

  it("falls back to hint-derived wording when fields are null", () => {
    const html = renderBrief(facts, null);
    expect(html).not.toContain("{{next1}}");
    expect(html).not.toContain("undefined");
  });

  it("uses model-provided fields when present and clean", () => {
    const fields: BriefFields = {
      next: ["Kick off the pilot.", "", "", ""],
      reasons: ["Strong return profile.", "", "", ""],
      watch: ["Budget reallocation risk.", "", "", ""],
      verdict: "Approve a contained spend.",
    };
    const html = renderBrief(facts, fields);
    expect(html).toContain("Kick off the pilot.");
    expect(html).toContain("Approve a contained spend.");
  });

  it("discards a field that still carries a fabricated number", () => {
    const fields: BriefFields = {
      next: ["Grew by 12 percent already.", "", "", ""],
      reasons: ["", "", "", ""],
      watch: ["", "", "", ""],
      verdict: "",
    };
    const html = renderBrief(facts, fields);
    expect(html).not.toContain("12 percent");
  });

  it("floors bar widths at 12 percent for a genuinely low score", () => {
    const lowFacts: BriefFacts = { ...facts, scores: { Evidence: 0 }, scale: 10 };
    const html = renderBrief(lowFacts, null);
    expect(html).toContain("width:12%");
  });
});
