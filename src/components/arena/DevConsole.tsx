import { useEffect, useRef } from "react";
import { Activity, Gauge, Hash, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LogEntry, Side, Telemetry } from "@/lib/debate/types";

function TelemetryCard({
  icon: Icon,
  label,
  value,
  unit,
  accent,
}: {
  icon: typeof Timer;
  label: string;
  value: string | number;
  unit?: string;
  accent: string;
}) {
  return (
    <div className="arena-panel rounded-xl px-4 py-3">
      <p className="flex items-center gap-1.5 truncate text-xs tracking-[0.14em] text-muted-foreground uppercase">
        <Icon className="size-3.5 shrink-0" />
        {label}
      </p>
      <p className={cn("mt-1 truncate font-mono text-xl font-semibold", accent)}>
        {value}
        {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
      </p>
    </div>
  );
}


export function TelemetryPanel({
  telemetry,
  contextTokens,
  contextWindow,
}: {
  telemetry: Record<Side, Telemetry | null>;
  contextTokens: number;
  contextWindow: number;
}) {
  const latest = telemetry.beta ?? telemetry.alpha;
  const totalTokens = (telemetry.alpha?.tokens ?? 0) + (telemetry.beta?.tokens ?? 0);
  const usage = Math.min(100, Math.round((contextTokens / Math.max(contextWindow, 1)) * 100));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <TelemetryCard
          icon={Timer}
          label="Time to first token"
          value={latest?.ttftMs ?? 0}
          unit="ms"
          accent="text-alpha"
        />
        <TelemetryCard
          icon={Gauge}
          label="Generation speed"
          value={latest?.tokensPerSec ?? 0}
          unit="tok/s"
          accent="text-beta"
        />
        <TelemetryCard
          icon={Hash}
          label="Round tokens"
          value={totalTokens}
          accent="text-primary"
        />
        <TelemetryCard
          icon={Activity}
          label="Last turn"
          value={latest?.durationMs ?? 0}
          unit="ms"
          accent="text-chart-4"
        />
      </div>

      <div className="arena-panel rounded-xl px-4 py-3">
        <div className="flex items-center justify-between text-xs tracking-[0.14em] text-muted-foreground uppercase">
          <span>Context window usage</span>
          <span className="font-mono">
            {contextTokens.toLocaleString()} / {contextWindow.toLocaleString()} ({usage}%)
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-alpha via-primary to-beta transition-[width] duration-500"
            style={{ width: `${usage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

const KIND_COLOR: Record<LogEntry["kind"], string> = {
  request: "text-alpha",
  chunk: "text-terminal",
  info: "text-primary",
  error: "text-destructive",
};

export function HttpMonitor({ logs }: { logs: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  return (
    <div className="arena-scroll h-72 overflow-y-auto rounded-xl border border-border bg-background/80 p-3 font-mono text-xs leading-relaxed">
      {logs.length === 0 && (
        <p className="text-muted-foreground">
          $ awaiting traffic — start a debate to stream live HTTP activity…
        </p>
      )}
      {logs.map((entry) => (
        <div key={entry.id} className="mb-1.5 whitespace-pre-wrap">
          <span className="text-muted-foreground">
            [{new Date(entry.ts).toLocaleTimeString()}]{" "}
            <span className="uppercase">{entry.side}</span>{" "}
          </span>
          <span className={KIND_COLOR[entry.kind]}>{entry.text}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
