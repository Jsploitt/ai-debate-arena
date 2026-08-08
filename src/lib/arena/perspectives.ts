import { JUDGE_CRITERIA } from "@/lib/debate/judge";
import type { JudgeCriterion, JudgeScorecard, Side } from "@/lib/debate/types";

/**
 * The four judging perspectives shown once a topic is picked. They occupy the
 * slot the topic scroller vacates.
 *
 * Each perspective is a weighted read of the criteria the judge already
 * returns — nothing here invents a number the judge did not produce.
 */
export type PerspectiveId = "financial" | "technical" | "marketing" | "overall";

export interface Perspective {
  id: PerspectiveId;
  label: string;
  labelAr: string;
  /** What this lens is actually measuring, in plain words a visitor can read. */
  blurb: string;
  blurbAr: string;
  weights: Partial<Record<JudgeCriterion, number>>;
}

export const PERSPECTIVES: Perspective[] = [
  {
    id: "financial",
    label: "Financial",
    labelAr: "مالي",
    blurb: "Cost, risk and evidence behind the numbers",
    blurbAr: "التكلفة والمخاطر والأدلة خلف الأرقام",
    weights: { Evidence: 0.5, Logic: 0.3, Persuasion: 0.2 },
  },
  {
    id: "technical",
    label: "Technical",
    labelAr: "تقني",
    blurb: "Soundness of the engineering argument",
    blurbAr: "متانة الحجة الهندسية",
    weights: { Logic: 0.45, Evidence: 0.35, Rebuttal: 0.2 },
  },
  {
    id: "marketing",
    label: "Marketing",
    labelAr: "تسويقي",
    blurb: "How well the case actually lands",
    blurbAr: "مدى تأثير الطرح على المستمع",
    weights: { Persuasion: 0.5, Clarity: 0.35, Rebuttal: 0.15 },
  },
  {
    id: "overall",
    label: "Overall",
    labelAr: "إجمالي",
    blurb: "All five criteria, evenly weighted",
    blurbAr: "المعايير الخمسة بوزن متساوٍ",
    weights: Object.fromEntries(JUDGE_CRITERIA.map((c) => [c, 1 / JUDGE_CRITERIA.length])),
  },
];

export interface PerspectiveScore {
  perspective: Perspective;
  /** 0–100 per side. */
  alpha: number;
  beta: number;
  leader: Side | "tie";
}

/** Reduce a scorecard to the four perspective readings, normalised to 0–100. */
export function perspectiveScores(
  scorecard: JudgeScorecard | null,
): PerspectiveScore[] {
  return PERSPECTIVES.map((perspective) => {
    if (!scorecard) {
      return { perspective, alpha: 0, beta: 0, leader: "tie" as const };
    }
    const scale = scorecard.scale || 10;
    const read = (side: Side) => {
      let sum = 0;
      let weight = 0;
      for (const [criterion, w] of Object.entries(perspective.weights)) {
        const value = scorecard[side].scores[criterion as JudgeCriterion];
        if (typeof value !== "number") continue;
        sum += (value / scale) * w;
        weight += w;
      }
      return weight > 0 ? Math.round((sum / weight) * 100) : 0;
    };
    const alpha = read("alpha");
    const beta = read("beta");
    return {
      perspective,
      alpha,
      beta,
      leader: alpha === beta ? "tie" : alpha > beta ? "alpha" : "beta",
    };
  });
}
