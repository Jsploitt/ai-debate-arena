import type { Side } from "@/lib/debate/types";

/**
 * The four expression states every character must render distinctly. These are
 * poses, not opacity levels — see `Character.tsx` for how each one changes the
 * silhouette, the brow and the mouth.
 */
export type CharacterState = "idle" | "thinking" | "speaking" | "reacting";

export interface Character {
  side: Side;
  /** Latin display name. */
  name: string;
  /** Arabic display name, used when the debate language is Arabic. */
  nameAr: string;
  /** One-line stance label shown under the name. */
  stance: string;
  stanceAr: string;
  /** Red-checked shemagh vs plain white ghutrah — the primary silhouette tell. */
  headdress: "shemagh" | "ghutrah";
  wearsGlasses: boolean;
  beard: "trimmed" | "full";
  /** CSS custom property names driving this character's colour set. */
  color: string;
  colorDeep: string;
  colorSoft: string;
  /** Tailwind text colour class, for callers that need a static class. */
  textClass: string;
}

export const CHARACTERS: Record<Side, Character> = {
  alpha: {
    side: "alpha",
    name: "Faisal",
    nameAr: "فيصل",
    stance: "For the resolution",
    stanceAr: "مؤيد للطرح",
    headdress: "shemagh",
    wearsGlasses: true,
    beard: "trimmed",
    color: "var(--faisal)",
    colorDeep: "var(--faisal-deep)",
    colorSoft: "var(--faisal-soft)",
    textClass: "text-faisal",
  },
  beta: {
    side: "beta",
    name: "Majed",
    nameAr: "ماجد",
    stance: "Against the resolution",
    stanceAr: "معارض للطرح",
    headdress: "ghutrah",
    wearsGlasses: false,
    beard: "full",
    color: "var(--majed)",
    colorDeep: "var(--majed-deep)",
    colorSoft: "var(--majed-soft)",
    textClass: "text-majed",
  },
};

export function characterName(side: Side, arabic: boolean) {
  return arabic ? CHARACTERS[side].nameAr : CHARACTERS[side].name;
}
