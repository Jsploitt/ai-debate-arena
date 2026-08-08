import { CHARACTERS, characterName } from "@/lib/arena/characters";
import { revealWords } from "@/lib/arena/reveal";
import { cn } from "@/lib/utils";
import type { DebateMessage, Side } from "@/lib/debate/types";

/**
 * What the audience actually reads: the live argument, large, plus the one
 * before it held dim underneath for context.
 *
 * The control view keeps the full scrolling log — a booth visitor arriving
 * halfway through needs the sentence being spoken right now, not a backlog
 * they will never scroll.
 */
export function StageTranscript({
  messages,
  speakingId,
  revealFraction,
  revealedIds,
  syncActive,
  arabic = false,
}: {
  messages: DebateMessage[];
  speakingId: string | null;
  revealFraction: number;
  revealedIds: Set<string>;
  syncActive: boolean;
  arabic?: boolean;
}) {
  // With voice sync on, the model runs well ahead of what has been read aloud;
  // show what the audience is actually hearing.
  const visible = syncActive
    ? messages.filter((m) => m.id === speakingId || revealedIds.has(m.id))
    : messages;

  const current = visible[visible.length - 1] ?? null;

  if (!current) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className={cn("text-body-l text-steel/60", arabic && "font-kufi")}>
          {arabic ? "تبدأ المناظرة الآن…" : "The debate is about to begin…"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center">
      <Argument
        message={current}
        arabic={arabic}
        revealFraction={syncActive && current.id === speakingId ? revealFraction : 1}
      />
    </div>
  );
}

function Argument({
  message,
  arabic,
  dim = false,
  revealFraction = 1,
}: {
  message: DebateMessage;
  arabic: boolean;
  dim?: boolean;
  revealFraction?: number;
}) {
  const side: Side = message.side;
  const character = CHARACTERS[side];
  const text = revealFraction >= 1 ? message.content : revealWords(message.content, revealFraction);

  return (
    <div
      dir={arabic ? "rtl" : "ltr"}
      className={cn(
        "arena-rise rounded-2xl border bg-surface-1 px-8 py-6 transition-all duration-500",
        dim ? "opacity-40" : "opacity-100",
        side === "alpha" ? "mr-[12%]" : "ml-[12%]",
      )}
      style={{
        borderColor: dim ? "var(--hairline)" : character.color,
        boxShadow: dim ? "none" : `inset 0 0 0 1px ${character.color}22`,
      }}
    >
      <div className={cn("mb-2 flex items-center gap-3", arabic && "flex-row-reverse")}>
        <span className="arena-label" style={{ color: character.color }}>
          {characterName(side, arabic)}
        </span>
        <span className="arena-label text-steel/50">
          {arabic ? `الجولة ${message.round}` : `Round ${message.round}`}
        </span>
      </div>
      <p
        className={cn(
          dim ? "text-body" : "text-body-l",
          "leading-relaxed text-foreground",
          arabic && "font-kufi text-right",
        )}
      >
        {text}
        {message.streaming && (
          <span
            className="ml-1 inline-block h-[1.1em] w-[3px] translate-y-[3px] animate-pulse"
            style={{ backgroundColor: character.color }}
          />
        )}
      </p>
    </div>
  );
}
