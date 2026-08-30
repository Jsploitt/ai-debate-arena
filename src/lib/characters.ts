/**
 * The debater cast — named characters that apply a whole configuration preset.
 *
 * This is a *preset and presentation* layer over `DebaterConfig`, in the same
 * spirit as `lib/personas.ts` (which presets the judge's weights). Picking a
 * character writes real settings, so the choice changes the actual prompts and
 * sampling sent to the model rather than only relabelling the UI.
 *
 * Note the deliberate naming: `Character` here, `Persona` in `lib/personas.ts`.
 * Those are the judge personas consumed by `lib/pdf.ts` and are a different
 * concept — keeping the names distinct stops the two from being confused.
 */

import type { ArenaSettings, CharacterId, DebaterConfig, Side } from "./debate/types";
import { FAHAD_ART, KHALID_ART, RANIA_ART, NOURA_ART, type AgentMoodArt } from "./agent-art";

export type { CharacterId };

/**
 * The `DebaterConfig` fields a character owns.
 *
 * `model` and `endpoint` are deliberately excluded. Alpha and Beta are
 * physically separate Ollama instances (:11434 and :11435) with different
 * models loaded, so a character that pinned a model would only be valid in one
 * slot. Keeping characters to personality means any of them can take any side.
 */
export type CharacterPatch = Pick<
  DebaterConfig,
  "name" | "systemPrompt" | "tonePreset" | "temperature" | "topP" | "thinkingLevel" | "voice"
>;

export type Character = {
  id: CharacterId;
  /** Card heading — the archetype, not the name. */
  title: string;
  /** One line of flavour under the heading. */
  blurb: string;
  art: AgentMoodArt;
  /** The direction this art is drawn facing; the stage mirrors it otherwise. */
  nativeSide: "left" | "right";
  patch: CharacterPatch;
};

/**
 * Character system prompts describe *how* someone argues, never *which side*
 * they are on. `useDebate` appends "You argue FOR/AGAINST the resolution" per
 * turn based on the slot, so a stance baked in here would make the character
 * contradict itself when placed on the other side.
 *
 * This is subtler than avoiding the words "for" and "against". An archetype
 * built on scepticism or caution ("questions vague claims", "prefers the
 * reversible option") reads to the model as a *posture toward the resolution*
 * and will quietly override the assigned stance — in testing, Noura and Rania
 * both argued against a motion they had been told to support. Every prompt
 * therefore aims its manner at the opposing argument, and closes with an
 * explicit instruction to commit to whichever side it is given.
 *
 * The "under 50 words" convention matches `TONE_PRESETS` and the engine's own
 * `TURN_WORD_LIMIT` in `useDebate`, which enforces it at a sentence boundary —
 * so turn length stays consistent however a debater is configured.
 */

/** Appended to every character prompt; keeps manner from becoming a stance. */
const COMMIT_TO_SIDE =
  "You will be told which side of the resolution to take. Commit to that side completely and argue it as your own conviction, aiming everything above at the argument facing you — never at your own side.";
export const CHARACTERS: Record<CharacterId, Character> = {
  fahad: {
    id: "fahad",
    title: "The Visionary · Startup founder",
    blurb: "Bold storyteller — paints the win and treats caution as a cost.",
    art: FAHAD_ART,
    nativeSide: "left",
    patch: {
      name: "Fahad",
      systemPrompt: `You are Fahad, a Saudi fintech founder who has raised real money and shipped real product. Argue in vivid narrative: open with the outcome, name the customer, and make the stakes concrete. Reach for momentum, adoption curves and what competitors are already doing. Treat the caution in the other position as a cost. Keep responses under 50 words. ${COMMIT_TO_SIDE}`,
      tonePreset: "Custom",
      temperature: 1.1,
      topP: 0.95,
      thinkingLevel: 0,
      voice: "am_adam",
    },
  },
  noura: {
    id: "noura",
    title: "The Skeptic · Policy analyst",
    blurb: "Data-driven — picks vague claims apart and demands numbers.",
    art: NOURA_ART,
    nativeSide: "right",
    patch: {
      name: "Noura",
      systemPrompt: `You are Noura, a government policy analyst who reviews proposals for a living. Make your own case from figures, timelines and precedent. When the position you are opposing says something unquantified — 'scalable', 'soon', 'significant' — name that vagueness and ask what it means in numbers. Be direct and unimpressed by enthusiasm. Keep responses under 50 words. ${COMMIT_TO_SIDE}`,
      tonePreset: "Custom",
      temperature: 0.35,
      topP: 0.78,
      thinkingLevel: 3,
      voice: "af_kore",
    },
  },
  rania: {
    id: "rania",
    title: "The Diplomat · Family-business heir",
    blurb: "Warm but firm — grants your best point, then shows who pays for it.",
    art: RANIA_ART,
    nativeSide: "left",
    patch: {
      name: "Rania",
      systemPrompt: `You are Rania, second-generation leadership at a family logistics firm that has survived three downturns. Argue from consequence and durability: what your side protects, and what breaks under the position you are opposing — who absorbs it, how it is unwound if wrong. Open EVERY reply by warmly naming the best thing in your opponent's point ("You're right that…", "I'll give you this much…") and then show who pays for it — that concede-then-counter move is your signature; never open with a flat contradiction. Keep responses under 50 words. ${COMMIT_TO_SIDE}`,
      tonePreset: "Custom",
      temperature: 0.65,
      topP: 0.88,
      thinkingLevel: 2,
      voice: "af_sarah",
    },
  },
  khalid: {
    id: "khalid",
    title: "The Advocate · Marketing strategist",
    blurb: "Argues how things feel to real people — in lines that stick.",
    art: KHALID_ART,
    nativeSide: "right",
    patch: {
      name: "Khalid",
      systemPrompt: `You are Khalid, a marketing strategist who judges every idea by whether people will actually use it. Argue from experience, friction and perception: who adopts your side, what they feel at first contact, what they tell others. Redirect the other argument's technical points to their human consequence. Land memorable phrasing. Keep responses under 50 words. ${COMMIT_TO_SIDE}`,
      tonePreset: "Custom",
      temperature: 0.85,
      topP: 0.98,
      thinkingLevel: 1,
      voice: "am_echo",
    },
  },
};

export const CHARACTER_LIST = Object.values(CHARACTERS);

/**
 * Resolve a stored id defensively. Returns null for `null` and for ids that no
 * longer exist in the registry, so a removed character degrades to the default
 * side art instead of throwing.
 */
export function characterById(id: string | null | undefined): Character | null {
  if (!id) return null;
  return CHARACTERS[id as CharacterId] ?? null;
}

/**
 * Two *distinct* characters for the alpha and beta slots.
 *
 * A debate between two copies of the same person is never interesting, so the
 * pair is drawn without replacement rather than by rejection sampling: pick
 * alpha uniformly, then pick beta from the remaining n-1 and shift past alpha's
 * index. Every ordered pair of different characters is equally likely, and it
 * cannot loop.
 */
export function randomCast(): [CharacterId, CharacterId] {
  const ids = CHARACTER_LIST.map((c) => c.id);
  const first = Math.floor(Math.random() * ids.length);
  let second = Math.floor(Math.random() * (ids.length - 1));
  if (second >= first) second += 1;
  return [ids[first], ids[second]];
}

/**
 * Which art a slot shows, and whether to mirror it.
 *
 * Driven by the stored `characterId` alone — never by the rest of the config —
 * so hand-tuning a prompt or slider cannot change who is on stage. Falls back
 * to the default side art when no character is selected.
 */
export function slotArt(config: DebaterConfig, side: Side): { art: AgentMoodArt; flip: boolean } {
  const fallback = side === "alpha" ? FAHAD_ART : KHALID_ART;
  const character = characterById(config.characterId);
  if (!character) return { art: fallback, flip: false };

  const position = side === "alpha" ? "left" : "right";
  return { art: character.art, flip: position !== character.nativeSide };
}

/**
 * The personality half of a slot's config — everything a character owns, as it
 * currently stands rather than as the registry defines it. Used when swapping
 * slots so a character carries any hand-tuning with it.
 */
export function characterPatchOf(config: DebaterConfig): CharacterPatch {
  return {
    name: config.name,
    systemPrompt: config.systemPrompt,
    tonePreset: config.tonePreset,
    temperature: config.temperature,
    topP: config.topP,
    thinkingLevel: config.thinkingLevel,
    voice: config.voice,
  };
}

/**
 * The settings patch that seats `id` in a slot — or clears the slot with
 * `null`.
 *
 * Shared by the configuration panel and the on-stage cast switcher, so the
 * two surfaces can never drift: the same rules apply everywhere. Picking a
 * character who is already seated on the *other* side swaps the two slots
 * rather than duplicating them (a debate between two copies of one person is
 * not a debate), and a swap exchanges the personality each slot is actually
 * holding — so anything hand-tuned beforehand travels with its character
 * instead of being silently rebuilt from the registry preset.
 */
export function castSelectionPatch(
  settings: ArenaSettings,
  side: Side,
  id: CharacterId | null,
): Partial<ArenaSettings> {
  const other: Side = side === "alpha" ? "beta" : "alpha";
  const current = settings[side];
  const opposite = settings[other];

  if (id === null) {
    return { [side]: { ...current, characterId: null } } as Partial<ArenaSettings>;
  }

  if (opposite.characterId === id) {
    return {
      [side]: { ...current, ...characterPatchOf(opposite), characterId: id },
      [other]: {
        ...opposite,
        ...characterPatchOf(current),
        characterId: current.characterId ?? null,
      },
    } as Partial<ArenaSettings>;
  }

  return {
    [side]: { ...current, ...CHARACTERS[id].patch, characterId: id },
  } as Partial<ArenaSettings>;
}

/** Draw two different characters and seat them in one settings patch. */
export function randomCastPatch(settings: ArenaSettings): Partial<ArenaSettings> {
  const [first, second] = randomCast();
  return {
    alpha: { ...settings.alpha, ...CHARACTERS[first].patch, characterId: first },
    beta: { ...settings.beta, ...CHARACTERS[second].patch, characterId: second },
  };
}

const EPSILON = 0.001;

/**
 * Whether a slot's live config has drifted from its character's preset.
 *
 * Drives the "modified" badge only — the avatar is driven by the stored
 * `characterId` alone, so hand-tuning a slider never changes who is on stage.
 */
export function isCharacterModified(config: DebaterConfig): boolean {
  const character = characterById(config.characterId);
  if (!character) return false;

  const { patch } = character;
  return (
    config.name !== patch.name ||
    config.systemPrompt !== patch.systemPrompt ||
    config.tonePreset !== patch.tonePreset ||
    config.voice !== patch.voice ||
    Math.abs(config.temperature - patch.temperature) > EPSILON ||
    Math.abs(config.topP - patch.topP) > EPSILON ||
    config.thinkingLevel !== patch.thinkingLevel
  );
}
