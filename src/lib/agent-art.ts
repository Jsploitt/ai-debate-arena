/**
 * Stage artwork, keyed by character and mood.
 *
 * Lives here rather than in `components/arena/stage.tsx` so `lib/characters.ts`
 * can reference it without a lib -> component import.
 */

import fahadBase from "@/assets/fahad-base.png";
import fahadSpeaking from "@/assets/fahad-speaking.png";
import fahadPleased from "@/assets/fahad-pleased.png";
import fahadTense from "@/assets/fahad-tense.png";

import khalidBase from "@/assets/khalid-base.png";
import khalidSpeaking from "@/assets/khalid-speaking.png";
import khalidPleased from "@/assets/khalid-pleased.png";
import khalidTense from "@/assets/khalid-tense.png";

import raniaBase from "@/assets/rania-base.png";
import raniaSpeaking from "@/assets/rania-speaking.png";
import raniaPleased from "@/assets/rania-pleased.png";
import raniaTense from "@/assets/rania-tense.png";

import nouraBase from "@/assets/noura-base.png";
import nouraPleased from "@/assets/noura-pleased.png";
import nouraTense from "@/assets/noura-tense.png";

/** One image per state `agentMood()` can return. */
export type AgentMoodArt = {
  base: string;
  speaking: string;
  pleased: string;
  tense: string;
};

/** Drawn facing right — belongs in the left-hand slot. */
export const FAHAD_ART: AgentMoodArt = {
  base: fahadBase,
  speaking: fahadSpeaking,
  pleased: fahadPleased,
  tense: fahadTense,
};

/** Drawn facing left — belongs in the right-hand slot. */
export const KHALID_ART: AgentMoodArt = {
  base: khalidBase,
  speaking: khalidSpeaking,
  pleased: khalidPleased,
  tense: khalidTense,
};

/** Drawn facing right — belongs in the left-hand slot. */
export const RANIA_ART: AgentMoodArt = {
  base: raniaBase,
  speaking: raniaSpeaking,
  pleased: raniaPleased,
  tense: raniaTense,
};

/**
 * Drawn facing left — belongs in the right-hand slot.
 *
 * `speaking` deliberately reuses the base art: her niqab covers her mouth, so
 * there is nothing for a speaking pose to show that base does not already.
 */
export const NOURA_ART: AgentMoodArt = {
  base: nouraBase,
  speaking: nouraBase,
  pleased: nouraPleased,
  tense: nouraTense,
};
