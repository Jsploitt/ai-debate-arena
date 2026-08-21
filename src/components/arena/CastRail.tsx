/**
 * The on-stage cast switcher.
 *
 * Lives in the presentation view's top-right corner — the spot the Control
 * Arena link used to occupy — so choosing the debaters is a stage-level
 * affordance rather than something buried in the configuration sheet. It
 * writes the exact same settings patches as the config panel's cast section
 * (`castSelectionPatch` / `randomCastPatch`), so a pick made here shows up
 * live on /arena and vice versa.
 */

import { useState } from "react";
import { Shuffle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CHARACTER_LIST,
  castSelectionPatch,
  characterById,
  randomCastPatch,
} from "@/lib/characters";
import type { ArenaSettings, Side } from "@/lib/debate/types";

function SlotButton({
  settings,
  side,
  disabled,
  onChange,
}: {
  settings: ArenaSettings;
  side: Side;
  disabled?: boolean;
  onChange: (patch: Partial<ArenaSettings>) => void;
}) {
  const [open, setOpen] = useState(false);
  const config = settings[side];
  const selected = characterById(config.characterId);
  const otherId = settings[side === "alpha" ? "beta" : "alpha"].characterId ?? null;
  const sideLabel = side === "alpha" ? "For" : "Against";
  const accent = side === "alpha" ? "text-pro" : "text-con";
  const position = side === "alpha" ? "left" : "right";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex items-center gap-2.5 rounded-xl border border-border bg-background/60 py-1.5 pr-4 pl-1.5 text-left backdrop-blur transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          {selected && (
            <img
              src={selected.art.pleased}
              alt=""
              aria-hidden="true"
              className={`size-11 rounded-lg object-cover object-top ${
                position === selected.nativeSide ? "" : "scale-x-[-1]"
              }`}
            />
          )}
          <span>
            <span
              className={`font-display block text-[10px] tracking-[0.18em] uppercase ${accent}`}
            >
              {sideLabel}
            </span>
            <span className="font-display block text-lg leading-tight font-bold">
              {config.name}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[21rem] p-2">
        <div className="grid grid-cols-2 gap-2">
          {CHARACTER_LIST.map((character) => {
            const active = character.id === selected?.id;
            const onOtherSide = character.id === otherId;
            return (
              <button
                key={character.id}
                type="button"
                aria-pressed={active}
                aria-label={
                  onOtherSide
                    ? `${character.patch.name} — currently on the other side; selecting swaps the two`
                    : character.patch.name
                }
                onClick={() => {
                  onChange(castSelectionPatch(settings, side, character.id));
                  setOpen(false);
                }}
                className={`rounded-xl border p-2 text-left transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                  active
                    ? "border-primary bg-primary/10 shadow-[0_0_24px_-6px_var(--primary)]"
                    : "border-border bg-background/40 hover:border-primary/50"
                }`}
              >
                <img
                  src={character.art.pleased}
                  alt=""
                  aria-hidden="true"
                  className={`h-24 w-full rounded-lg object-cover object-top ${
                    position === character.nativeSide ? "" : "scale-x-[-1]"
                  }`}
                />
                <span className="font-display mt-1.5 block text-base font-bold text-primary">
                  {character.patch.name}
                </span>
                <span className="block text-xs text-foreground/80">{character.title}</span>
                {onOtherSide && (
                  <span className="mt-0.5 block text-[10px] text-primary/80">
                    on the other side — swaps
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CastRail({
  settings,
  disabled,
  onChange,
}: {
  settings: ArenaSettings;
  /** True while a debate is live — the cast is locked mid-debate, as in the config panel. */
  disabled?: boolean;
  onChange: (patch: Partial<ArenaSettings>) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-display mr-1 hidden text-[10px] tracking-[0.25em] text-muted-foreground uppercase lg:block">
        The debaters
      </span>
      <SlotButton settings={settings} side="alpha" disabled={disabled} onChange={onChange} />
      <SlotButton settings={settings} side="beta" disabled={disabled} onChange={onChange} />
      <Button
        variant="outline"
        size="icon"
        disabled={disabled}
        aria-label="Shuffle the cast"
        title="Shuffle the cast"
        onClick={() => onChange(randomCastPatch(settings))}
        className="size-11 rounded-xl"
      >
        <Shuffle aria-hidden="true" />
      </Button>
    </div>
  );
}
