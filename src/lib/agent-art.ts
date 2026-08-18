/**
 * Stage artwork, extracted from `components/arena/stage.tsx` so that
 * `lib/characters.ts` can reference it without a lib -> component import.
 *
 * `stage.tsx` still re-exports `AGENT_ART` in its original shape, so every
 * existing call site keeps working unchanged.
 */

import proPleased from "@/assets/pro-pleased.png";
import proSpeaking from "@/assets/pro-speaking.png";
import proTense from "@/assets/pro-tense.png";
import conPleased from "@/assets/con-pleased.png";
import conSpeaking from "@/assets/con-speaking.png";
import conTense from "@/assets/con-tense.png";

/** The three moods `agentMood()` selects between. */
export type AgentMoodArt = {
  pleased: string;
  speaking: string;
  tense: string;
};

/** Default art for the left-hand slot. Drawn facing right, into the stage. */
export const PRO_ART: AgentMoodArt = {
  pleased: proPleased,
  speaking: proSpeaking,
  tense: proTense,
};

/** Default art for the right-hand slot. Drawn facing left, into the stage. */
export const CON_ART: AgentMoodArt = {
  pleased: conPleased,
  speaking: conSpeaking,
  tense: conTense,
};
