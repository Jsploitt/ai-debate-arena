import { useEffect, useState } from "react";
import { QrCode } from "./QrCode";
import { CHARACTERS } from "@/lib/arena/characters";
import { cn } from "@/lib/utils";
import type { DebateSummary } from "@/lib/arena/summary";

/**
 * The shareable export: one embedded page, bullets only, rendered in place in
 * the same fullscreen view — no new tab, nothing for a visitor to dismiss.
 * It holds for `seconds`, then the arena resets itself.
 */
export function VerdictExport({
  summary,
  qrValue,
  arabic = false,
  seconds = 30,
  onDone,
}: {
  summary: DebateSummary;
  qrValue: string;
  arabic?: boolean;
  seconds?: number;
  onDone: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(timer);
          onDone();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [onDone]);

  const winnerColor = summary.winner === "tie" ? "var(--steel)" : CHARACTERS[summary.winner].color;

  return (
    // Opaque, not translucent: a see-through panel ghosts the stage through the
    // QR while it fades in, and a half-readable QR is a QR nobody scans.
    <div
      className="arena-rise absolute inset-0 z-40 flex flex-col bg-surface-0 px-16 py-12"
      dir={arabic ? "rtl" : "ltr"}
    >
      <div className="arena-flag-rule mb-8 w-full rounded-full" />

      <header className="flex items-baseline justify-between gap-8">
        <div className="min-w-0">
          <p className="arena-label text-steel/70">{arabic ? "الحكم النهائي" : "Final verdict"}</p>
          <h2
            className={cn(
              "mt-2 font-display text-display-l font-bold leading-none",
              arabic && "font-kufi",
            )}
            style={{ color: winnerColor }}
          >
            {summary.winner === "tie"
              ? arabic
                ? "تعادل"
                : "Draw"
              : arabic
                ? `فاز ${summary.winnerName}`
                : `${summary.winnerName} wins`}
          </h2>
        </div>
        <p className="flex shrink-0 items-baseline gap-3 font-mono text-display-m font-bold">
          <span style={{ color: CHARACTERS.alpha.color }}>{summary.totals.alpha.toFixed(1)}</span>
          <span className="text-steel/40 text-title">—</span>
          <span style={{ color: CHARACTERS.beta.color }}>{summary.totals.beta.toFixed(1)}</span>
        </p>
      </header>

      <p
        className={cn(
          "mt-5 font-display text-display-m font-semibold text-foreground/85",
          arabic && "font-kufi text-right",
        )}
      >
        {summary.topic}
      </p>

      {summary.verdict && (
        <p
          className={cn(
            "mt-5 max-w-[68ch] border-l-2 pl-5 text-body-l leading-relaxed text-steel",
            arabic && "border-l-0 border-r-2 pl-0 pr-5 font-kufi text-right",
          )}
          style={{ borderColor: winnerColor }}
        >
          {summary.verdict}
        </p>
      )}

      <div className="mt-10 flex flex-1 items-center gap-16 overflow-hidden">
        <ul className="flex-1 space-y-5">
          {summary.bullets.slice(0, 8).map((bullet, i) => (
            <li
              key={i}
              className={cn(
                "arena-rise flex gap-4 text-body-l leading-snug",
                arabic && "font-kufi",
              )}
              style={{ animationDelay: `${120 + i * 70}ms` }}
            >
              <span
                className="mt-[0.5em] block size-2.5 shrink-0 rotate-45"
                style={{ backgroundColor: winnerColor }}
              />
              <span className="text-foreground/90">{bullet}</span>
            </li>
          ))}
        </ul>

        <div className="flex w-[340px] shrink-0 flex-col items-center gap-6">
          <div className="rounded-2xl border border-hairline bg-[#F4F8FC] p-5">
            <QrCode value={qrValue} size={286} />
          </div>
          <p className={cn("text-center text-body-l text-steel", arabic && "font-kufi")}>
            {arabic ? "امسح الرمز لأخذ الملخص معك" : "Scan to take the summary with you"}
          </p>
        </div>
      </div>

      <footer className="mt-8 flex items-center gap-5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full transition-[width] duration-1000 ease-linear"
            style={{
              width: `${(remaining / seconds) * 100}%`,
              backgroundColor: winnerColor,
            }}
          />
        </div>
        <p className="arena-label shrink-0 text-steel/70">
          {arabic ? `إعادة خلال ${remaining}ث` : `Resetting in ${remaining}s`}
        </p>
      </footer>
    </div>
  );
}
