/**
 * Executive judge personas, ported from the reference design.
 *
 * These are a *weight preset and presentation* layer only. `src/lib/debate/judge.ts`
 * remains the single scoring authority — the reference's own `weightedTotal` is
 * deliberately not ported, because two scorers would eventually disagree.
 *
 * Picking a persona writes `settings.judge.weights`, so the choice changes the
 * real weights sent to the judge rather than only relabelling the UI.
 */

import type { JudgeCriterion } from "./debate/types";

export type PersonaId = "cfo" | "cto" | "cmo" | "ceo";

/** Presentation labels, in the reference's display order. */
export const CRITERIA = [
  { key: "Logic", label: "Logic & Coherence" },
  { key: "Evidence", label: "Evidence & Support" },
  { key: "Rebuttal", label: "Rebuttal Strength" },
  { key: "Persuasion", label: "Persuasiveness" },
  { key: "Clarity", label: "Clarity & Organization" },
] as const satisfies ReadonlyArray<{ key: JudgeCriterion; label: string }>;

export type Persona = {
  id: PersonaId;
  title: string;
  name: string;
  personality: string;
  weights: Record<JudgeCriterion, number>;
  focus: JudgeCriterion;
  doc: string;
  docFraming: string;
};

export const PERSONAS: Record<PersonaId, Persona> = {
  cfo: {
    id: "cfo",
    title: "CFO",
    name: "Chief Financial Officer",
    personality: "Skeptical, numbers-driven, hard to impress with rhetoric alone.",
    weights: { Logic: 1, Evidence: 2.2, Rebuttal: 1, Persuasion: 0.6, Clarity: 1.2 },
    focus: "Evidence",
    doc: "Financial Impact Brief",
    docFraming: "Cost, ROI, risk exposure",
  },
  cto: {
    id: "cto",
    title: "CTO",
    name: "Chief Technology Officer",
    personality: "Analytical, cares about feasibility and internal consistency.",
    weights: { Logic: 2.2, Evidence: 1.2, Rebuttal: 1.1, Persuasion: 0.5, Clarity: 1 },
    focus: "Logic",
    doc: "Technical Feasibility Memo",
    docFraming: "Implementation risk, scalability, tradeoffs",
  },
  cmo: {
    id: "cmo",
    title: "CMO",
    name: "Chief Marketing Officer",
    personality: "Reads the room, values compelling delivery and audience impact.",
    weights: { Logic: 0.8, Evidence: 0.8, Rebuttal: 1, Persuasion: 2.4, Clarity: 1 },
    focus: "Persuasion",
    doc: "Campaign & Positioning Brief",
    docFraming: "Audience impact, brand risk, market timing",
  },
  ceo: {
    id: "ceo",
    title: "CEO",
    name: "Chief Executive Officer",
    personality: "Wants the bottom line fast, low tolerance for rambling.",
    weights: { Logic: 1.2, Evidence: 1.2, Rebuttal: 1.1, Persuasion: 1.1, Clarity: 1.8 },
    focus: "Clarity",
    doc: "Executive Summary Decision Brief",
    docFraming: "Short, bottom-line-first, decisive",
  },
};

export const PERSONA_LIST = Object.values(PERSONAS);

export const DEFAULT_PERSONA_ID: PersonaId = "cfo";

export function criterionLabel(key: JudgeCriterion): string {
  return CRITERIA.find((c) => c.key === key)?.label ?? key;
}

/**
 * Which persona a given set of judge weights corresponds to, or null when the
 * user has hand-tuned weights in the configuration panel. Lets the persona
 * picker reflect the real settings rather than tracking its own copy.
 */
export function personaForWeights(weights: Record<JudgeCriterion, number>): PersonaId | null {
  for (const persona of PERSONA_LIST) {
    const matches = CRITERIA.every(
      (c) => Math.abs((weights?.[c.key] ?? 1) - persona.weights[c.key]) < 0.001,
    );
    if (matches) return persona.id;
  }
  return null;
}
