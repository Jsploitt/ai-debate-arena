import { Bot, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DebaterConfig, Side, SpeakerStatus } from "@/lib/debate/types";

const STATUS_LABEL: Record<SpeakerStatus, string> = {
  idle: "Idle",
  thinking: "Thinking",
  speaking: "Speaking",
};

function DebaterAvatar({
  side,
  config,
  status,
}: {
  side: Side;
  config: DebaterConfig;
  status: SpeakerStatus;
}) {
  const isAlpha = side === "alpha";
  const active = status !== "idle";
  const color = isAlpha ? "text-alpha" : "text-beta";
  const border = isAlpha ? "border-alpha/50" : "border-beta/50";
  const glow = isAlpha
    ? "shadow-[0_0_60px_-12px_var(--alpha)]"
    : "shadow-[0_0_60px_-12px_var(--beta)]";

  return (
    <div
      className={cn(
        "arena-panel flex items-center gap-5 rounded-2xl px-5 py-4 transition-shadow duration-500",
        isAlpha ? "flex-row" : "flex-row-reverse text-right",
        active && glow,
      )}
    >
      <div className="relative grid size-20 shrink-0 place-items-center">
        {active && (
          <>
            <span
              className={cn("arena-ring absolute inset-0 rounded-full border-2", border)}
            />
            <span
              className={cn(
                "arena-ring absolute inset-0 rounded-full border-2",
                border,
                "[animation-delay:0.7s]",
              )}
            />
          </>
        )}
        <span
          className={cn(
            "arena-spin-slow absolute inset-1 rounded-full border border-dashed",
            border,
            "opacity-60",
          )}
        />
        <span
          className={cn(
            "grid size-14 place-items-center rounded-full border bg-background/70",
            border,
          )}
        >
          {status === "thinking" ? (
            <BrainCircuit className={cn("size-7 animate-pulse", color)} />
          ) : (
            <Bot className={cn("size-7", color)} />
          )}
        </span>
      </div>

      <div className={cn("min-w-0 flex-1", !isAlpha && "flex flex-col items-end")}>
        <p className={cn("truncate text-xl font-semibold tracking-tight", color)}>{config.name}</p>
        <p className="truncate font-mono text-sm text-muted-foreground">{config.model}</p>
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.16em] uppercase",
            active ? cn(border, color) : "border-border text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full bg-current",
              active && "animate-pulse shadow-[0_0_8px_currentColor]",
            )}
          />
          {STATUS_LABEL[status]}
        </div>
      </div>
    </div>
  );
}

export function DebaterStage({
  alpha,
  beta,
  alphaStatus,
  betaStatus,
  active,
  round,
  totalRounds,
}: {
  alpha: DebaterConfig;
  beta: DebaterConfig;
  alphaStatus: SpeakerStatus;
  betaStatus: SpeakerStatus;
  active: boolean;
  round: number;
  totalRounds: number;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
      <DebaterAvatar side="alpha" config={alpha} status={alphaStatus} />

      <div className="flex flex-col items-center gap-2">
        <div
          className={cn(
            "relative grid size-20 place-items-center rounded-full border-2 border-primary/50 bg-primary/10 text-2xl font-black tracking-widest text-primary",
            active && "arena-flicker shadow-[0_0_40px_-6px_var(--primary)]",
          )}
        >
          VS
          <span className="absolute inset-0 rounded-full border border-primary/20" />
        </div>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          Round {Math.min(round, totalRounds)} / {totalRounds}
        </p>
      </div>

      <DebaterAvatar side="beta" config={beta} status={betaStatus} />
    </div>
  );
}
