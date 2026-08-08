import type { ReactNode } from "react";
import { Character } from "./Character";
import { CHARACTERS, characterName, type CharacterState } from "@/lib/arena/characters";
import { cn } from "@/lib/utils";
import type { Side } from "@/lib/debate/types";

/**
 * The two characters, one lit and one dormant.
 *
 * The spotlight is applied as a set — scale, glow, and desaturation of the
 * other character — so a visitor glancing at the screen mid-debate knows who
 * is talking without reading a word.
 */
export function CharacterStage({
  states,
  round,
  totalRounds,
  arabic = false,
  compact = false,
  still = false,
  showRound = true,
  center,
}: {
  states: Record<Side, CharacterState>;
  round: number;
  totalRounds: number;
  arabic?: boolean;
  compact?: boolean;
  /** Motion budget: hold the characters still while the rail is settling. */
  still?: boolean;
  /** A round counter before anything has started is noise. */
  showRound?: boolean;
  /** Occupies the column between the two characters when there is no round yet. */
  center?: ReactNode;
}) {
  const speaking: Side | null =
    states.alpha === "speaking" ? "alpha" : states.beta === "speaking" ? "beta" : null;

  return (
    <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-4">
      <Podium
        side="alpha"
        state={states.alpha}
        dormant={speaking === "beta"}
        arabic={arabic}
        compact={compact}
        still={still}
      />

      <div className="flex flex-col items-center gap-2 px-8 pb-6">
        {center}
        {showRound && (
          <>
            <p className="arena-label text-steel/80">{arabic ? "الجولة" : "Round"}</p>
            <p className="font-mono text-display-m font-bold text-foreground">
              {Math.min(round, totalRounds)}
              <span className="text-steel/60">/{totalRounds}</span>
            </p>
          </>
        )}
      </div>

      <Podium
        side="beta"
        state={states.beta}
        dormant={speaking === "alpha"}
        arabic={arabic}
        compact={compact}
        still={still}
      />
    </div>
  );
}

function Podium({
  side,
  state,
  dormant,
  arabic,
  compact,
  still,
}: {
  side: Side;
  state: CharacterState;
  dormant: boolean;
  arabic: boolean;
  compact: boolean;
  still: boolean;
}) {
  const character = CHARACTERS[side];
  const lit = state === "speaking";
  // A recoil nobody can see is not a reaction: hold the desaturation off while
  // this character is actually reacting to the other one.
  const faded = dormant && state !== "reacting";

  return (
    <div
      className={cn("flex flex-col items-center", side === "alpha" ? "items-start" : "items-end")}
    >
      <div
        className="relative transition-all duration-700 ease-out"
        style={{
          transform: `scale(${lit ? "var(--spotlight-scale)" : faded ? "0.95" : "1"})`,
          transformOrigin: side === "alpha" ? "left bottom" : "right bottom",
          filter: faded ? "var(--dormant-filter)" : "none",
        }}
      >
        {/* Spotlight pool. Present only for the speaker. */}
        <div
          className={cn(
            "absolute -inset-x-10 -bottom-8 top-6 -z-10 rounded-full blur-3xl transition-opacity duration-700",
            lit ? "opacity-45" : "opacity-0",
          )}
          style={{ backgroundColor: character.color }}
        />

        <div className={cn(compact ? "h-[240px] w-[190px]" : "h-[340px] w-[270px]")}>
          <Character character={character} state={state} still={still} />
        </div>
      </div>

      <div
        className={cn(
          "mt-2 flex items-center gap-3 transition-opacity duration-700",
          side === "beta" && "flex-row-reverse",
          faded ? "opacity-50" : "opacity-100",
        )}
      >
        <span
          className="block h-8 w-[5px] rounded-full transition-all duration-500"
          style={{
            backgroundColor: character.color,
            boxShadow: lit ? `0 0 18px ${character.color}` : "none",
            opacity: lit ? 1 : 0.5,
          }}
        />
        <div className={cn(side === "beta" && "text-right")}>
          <p
            className="font-display text-display-m font-bold leading-none"
            style={{ color: lit ? character.color : "var(--foreground)" }}
          >
            {characterName(side, arabic)}
          </p>
          <p className="arena-label mt-1.5 text-steel/80">{STATE_LABEL(state, arabic)}</p>
        </div>
      </div>
    </div>
  );
}

function STATE_LABEL(state: CharacterState, arabic: boolean) {
  if (arabic) {
    return { idle: "بانتظار", thinking: "يفكر", speaking: "يتحدث", reacting: "يرد" }[state];
  }
  return { idle: "Waiting", thinking: "Thinking", speaking: "Speaking", reacting: "Reacting" }[
    state
  ];
}
