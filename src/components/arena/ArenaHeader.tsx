import { Activity, Cpu, Gavel, ShieldCheck, Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionState, Side } from "@/lib/debate/types";

function StatusPill({
  label,
  model,
  state,
  side,
}: {
  label: string;
  model: string;
  state: ConnectionState;
  side: Side;
}) {
  const online = state === "online";
  const checking = state === "checking" || state === "unknown";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
        side === "alpha"
          ? "border-alpha/40 bg-alpha-soft text-alpha"
          : "border-beta/40 bg-beta-soft text-beta",
        !online && "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {checking ? (
        <Loader2 className="size-4 animate-spin" />
      ) : online ? (
        <Wifi className="size-4" />
      ) : (
        <WifiOff className="size-4" />
      )}
      <span className="tracking-wide uppercase">{label}</span>
      <span className="hidden font-mono text-xs opacity-80 md:inline">{model}</span>
      <span
        className={cn(
          "size-2 rounded-full",
          online ? "bg-current shadow-[0_0_10px_currentColor]" : "bg-muted-foreground/60",
        )}
      />
    </div>
  );
}

export function ArenaHeader({
  alphaState,
  betaState,
  alphaModel,
  betaModel,
  judgeModel,
  judgeEnabled,
  simulation,
}: {
  alphaState: ConnectionState;
  betaState: ConnectionState;
  /** Model name reported by the runtime, falling back to the configured name. */
  alphaModel: string;
  betaModel: string;
  judgeModel?: string;
  judgeEnabled?: boolean;
  simulation: boolean;
}) {
  return (
    <header className="arena-geo relative flex flex-wrap items-center justify-between gap-4 border-b border-border/70 bg-background/60 px-6 py-4 backdrop-blur">
      <div className="arena-flag-rule pointer-events-none absolute inset-x-0 top-0" />
      <div className="flex items-center gap-4">
        <div className="relative grid size-11 place-items-center rounded-xl border border-primary/40 bg-gradient-to-br from-primary/20 to-accent/20">
          <Cpu className="size-6 text-primary" />
        </div>

        <div>
          <h1 className="text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
            Dell Saudi Arabia <span className="text-muted-foreground">•</span>{" "}
            <span className="text-primary">AI Debate Arena</span>
          </h1>
          <p className="flex items-center gap-2 text-sm tracking-[0.18em] text-muted-foreground uppercase">
            <ShieldCheck className="size-3.5" />
            Saudi Vision 2030 Tech Demo
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill label="LLM Engine Alpha" model={alphaModel} state={alphaState} side="alpha" />
        <StatusPill label="LLM Engine Beta" model={betaModel} state={betaState} side="beta" />
        {judgeEnabled && judgeModel && (
          <div className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
            <Gavel className="size-4" />
            <span className="tracking-wide uppercase">AI Judge</span>
            <span className="hidden font-mono text-xs opacity-80 md:inline">{judgeModel}</span>
          </div>
        )}
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-widest uppercase",
            simulation
              ? "border-chart-4/50 bg-chart-4/10 text-chart-4"
              : "border-primary/50 bg-primary/10 text-primary",
          )}
        >
          <Activity className="size-3.5" />
          {simulation ? "Simulation Mode" : "Live Local API"}
        </div>
      </div>

    </header>
  );
}
