import { describe, expect, it } from "vitest";

import {
  CRITERIA,
  DEFAULT_PERSONA_ID,
  PERSONAS,
  PERSONA_LIST,
  criterionLabel,
  personaForWeights,
} from "./personas";

describe("criterionLabel", () => {
  it("returns the display label for a known criterion", () => {
    expect(criterionLabel("Logic")).toBe("Logic & Coherence");
  });

  it("falls back to the raw key for an unknown criterion", () => {
    // @ts-expect-error deliberately passing an invalid key to exercise the fallback
    expect(criterionLabel("Unknown")).toBe("Unknown");
  });
});

describe("personaForWeights", () => {
  it("matches a persona's own weights exactly", () => {
    expect(personaForWeights(PERSONAS.cto.weights)).toBe("cto");
  });

  it("matches within floating point tolerance", () => {
    const nudged = { ...PERSONAS.cfo.weights, Evidence: PERSONAS.cfo.weights.Evidence + 0.0001 };
    expect(personaForWeights(nudged)).toBe("cfo");
  });

  it("returns null for hand-tuned weights that match no persona", () => {
    const custom = { Logic: 3, Evidence: 3, Rebuttal: 3, Clarity: 3, Persuasion: 3 };
    expect(personaForWeights(custom)).toBeNull();
  });
});

describe("PERSONAS registry", () => {
  it("has a distinct id for every persona and a valid default", () => {
    const ids = PERSONA_LIST.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_PERSONA_ID);
  });

  it("defines a weight for every judge criterion, on every persona", () => {
    for (const persona of PERSONA_LIST) {
      for (const criterion of CRITERIA) {
        expect(typeof persona.weights[criterion.key]).toBe("number");
      }
    }
  });
});
