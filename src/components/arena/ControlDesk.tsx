import { Download, Mic, MicOff, Pause, Play, RotateCcw, SkipForward, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SAMPLE_TOPICS, SAMPLE_TOPICS_AR } from "@/lib/debate/presets";
import { cn } from "@/lib/utils";
import type { DebateLanguage } from "@/lib/debate/types";
import type { Phase } from "@/lib/debate/useDebate";

export function ControlDesk({
  value,
  onValueChange,
  phase,
  onStart,
  onPause,
  onResume,
  onNextTurn,
  onReset,
  onDownload,
  language,
  onLanguageChange,
  voiceEnabled,
  onVoiceEnabledChange,
}: {
  value: string;
  onValueChange: (v: string) => void;
  phase: Phase;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onNextTurn: () => void;
  onReset: () => void;
  onDownload: () => void;
  language: DebateLanguage;
  onLanguageChange: (lang: DebateLanguage) => void;
  voiceEnabled: boolean;
  onVoiceEnabledChange: (enabled: boolean) => void;
}) {
  const running = phase === "running";
  const isArabic = language === "ar";
  const topics = isArabic ? SAMPLE_TOPICS_AR : SAMPLE_TOPICS;

  return (
    <div className="arena-panel space-y-3 rounded-2xl p-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Input
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) onStart();
            }}
            dir={isArabic ? "rtl" : "ltr"}
            placeholder={isArabic ? "أدخل موضوع المناظرة…" : "Enter the debate resolution…"}
            className={cn(
              "h-14 border-primary/40 bg-background/70 px-5 text-lg shadow-[0_0_30px_-14px_var(--primary)] focus-visible:ring-primary md:text-xl",
              isArabic && "text-right",
            )}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            className="h-14 px-6 text-base font-semibold"
            onClick={onStart}
            disabled={!value.trim()}
          >
            <Swords className="size-5" />
            Start Debate
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-14"
            onClick={running ? onPause : onResume}
            disabled={phase === "idle" || phase === "finished"}
          >
            {running ? <Pause className="size-5" /> : <Play className="size-5" />}
            {running ? "Pause" : "Resume"}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-14"
            onClick={onNextTurn}
            disabled={phase === "idle" || phase === "finished" || running}
          >
            <SkipForward className="size-5" />
            Next Turn
          </Button>
          <Button size="lg" variant="outline" className="h-14" onClick={onReset}>
            <RotateCcw className="size-5" />
            Reset Arena
          </Button>
          <Button size="lg" variant="outline" className="h-14" onClick={onDownload}>
            <Download className="size-5" />
            Transcript
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
          Debate language:
        </span>
        <div className="flex overflow-hidden rounded-full border border-border/70">
          {(["en", "ar"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => onLanguageChange(lang)}
              aria-pressed={language === lang}
              className={cn(
                "px-3 py-1 text-xs font-medium transition-colors",
                language === lang
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {lang === "en" ? "English" : "العربية"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onVoiceEnabledChange(!voiceEnabled)}
          aria-pressed={voiceEnabled}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs tracking-[0.12em] uppercase transition-colors",
            voiceEnabled
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border/70 bg-muted/40 text-muted-foreground hover:text-foreground",
          )}
        >
          {voiceEnabled ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
          Generate voice {voiceEnabled ? "on" : "off"}
        </button>

        <span className="ml-2 font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
          Suggested:
        </span>
        {topics.map((topic) => (
          <button
            key={topic}
            onClick={() => onValueChange(topic)}
            dir={isArabic ? "rtl" : "ltr"}
            className="rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            {topic}
          </button>
        ))}
      </div>
    </div>
  );
}
