import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Download,
  ExternalLink,
  Gavel,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  TerminalSquare,
} from "lucide-react";

import { ConversationStream } from "@/components/arena/ConversationStream";
import { TelemetryPanel } from "@/components/arena/DevConsole";
import { JudgePanel } from "@/components/arena/JudgePanel";
import { SettingsPanel } from "@/components/arena/SettingsPanel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CHARACTERS, characterName } from "@/lib/arena/characters";
import { TOPIC_CATEGORY_LABEL, TOPICS, topicText } from "@/lib/arena/topics";
import { useArenaRemote } from "@/lib/arena/useArenaLink";
import { buildSummary } from "@/lib/arena/summary";
import { DEFAULT_SETTINGS } from "@/lib/debate/presets";
import { cn } from "@/lib/utils";
import type { ArenaSettings, Side } from "@/lib/debate/types";

export const Route = createFileRoute("/control")({
  head: () => ({ meta: [{ title: "Arena Control — staff only" }] }),
  component: ControlView,
});

/**
 * STAFF CONTROL VIEW.
 *
 * Never rendered on the public display: it is a separate route, opened in a
 * second window on the same machine. It holds no debate engine — it mirrors
 * the display's snapshot and posts commands back over BroadcastChannel.
 */
function ControlView() {
  const { snapshot, connected, send } = useArenaRemote();
  const [category, setCategory] = useState<string>("all");

  const settings: ArenaSettings = snapshot?.settings ?? DEFAULT_SETTINGS;
  const arabic = settings.language === "ar";
  const phase = snapshot?.phase ?? "idle";
  const running = phase === "running";

  const names: Record<Side, string> = {
    alpha: characterName("alpha", arabic),
    beta: characterName("beta", arabic),
  };

  const updateSettings = useCallback(
    (patch: Partial<ArenaSettings>) => send({ kind: "settings", patch }),
    [send],
  );

  const topics = useMemo(
    () => (category === "all" ? TOPICS : TOPICS.filter((t) => t.category === category)),
    [category],
  );

  // Markdown transcript stays a staff-only affordance; visitors get the QR.
  const downloadTranscript = useCallback(() => {
    if (!snapshot) return;
    const s = snapshot;
    const summary = buildSummary(s.topic, s.messages, s.scorecard, arabic);
    const lines = [
      "# AI Debate Arena — Transcript",
      "",
      `**Resolution:** ${s.topic || "(none)"}`,
      `**Mode:** ${s.usingSimulation ? "Simulation" : "Live local runtime"}`,
      `**Language:** ${arabic ? "Arabic" : "English"}`,
      `**Generated:** ${new Date().toLocaleString()}`,
      "",
      ...s.messages.flatMap((m) => [
        `## Round ${m.round} — ${names[m.side]}`,
        m.reasoning ? `> Reasoning: ${m.reasoning.replace(/\n/g, " ")}` : "",
        "",
        m.content,
        m.telemetry
          ? `\n_TTFT ${m.telemetry.ttftMs}ms · ${m.telemetry.tokensPerSec} tok/s · ${m.telemetry.tokens} tokens_`
          : "",
        "",
      ]),
      ...(s.scorecard
        ? [
            "## Judge scorecard",
            "",
            `**Winner:** ${summary.winnerName}`,
            "",
            s.scorecard.verdict,
            "",
            "### Summary bullets",
            ...summary.bullets.map((b) => `- ${b}`),
          ]
        : []),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `debate-transcript-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [arabic, names, snapshot]);

  return (
    <div className="min-h-screen bg-surface-0 text-[15px]">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-surface-1/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Arena Control</h1>
          <span className="rounded-full border border-hairline px-2.5 py-0.5 font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground">
            staff only
          </span>
          <span
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase",
              connected ? "border-majed/50 text-majed" : "border-destructive/50 text-destructive",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                connected ? "bg-majed" : "bg-destructive animate-pulse",
              )}
            />
            {connected ? "display connected" : "display not found"}
          </span>
          {snapshot?.usingSimulation && (
            <span className="rounded-full border border-judge/50 px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase text-judge">
              simulation
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => window.open("/", "arena-display", "noopener")}>
            <MonitorPlay className="size-4" />
            Open public display
            <ExternalLink className="size-3.5 opacity-60" />
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Settings2 className="size-4" />
                Configuration
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="arena-scroll w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Arena configuration</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-8">
                <SettingsPanel settings={settings} onChange={updateSettings} />
              </div>
            </SheetContent>
          </Sheet>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">
                <TerminalSquare className="size-4" />
                Developer console
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="arena-scroll w-full overflow-y-auto sm:max-w-2xl">
              <SheetHeader>
                <SheetTitle>Developer console</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-8">
                <TelemetryPanel
                  telemetry={{ alpha: null, beta: null }}
                  contextTokens={0}
                  contextWindow={settings.contextWindow}
                />
                <p className="rounded-lg border border-hairline bg-surface-1 p-3 text-sm text-muted-foreground">
                  The raw HTTP monitor runs in the display window, which owns the runtime
                  connections. Open its devtools for the live request log.
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-5 p-6 xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="space-y-5">
          {/* ---- transport ---- */}
          <div className="rounded-xl border border-hairline bg-surface-1 p-4">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-muted-foreground">
                Now on the display
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {phase} · round {snapshot?.round ?? 0}/{settings.rounds}
              </p>
            </div>
            <p className="mb-4 text-base">
              {snapshot?.topic || <span className="text-muted-foreground">No topic selected</span>}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => send({ kind: running ? "pause" : "resume" })}
                disabled={phase === "idle" || phase === "finished"}
              >
                {running ? <Pause className="size-4" /> : <Play className="size-4" />}
                {running ? "Pause" : "Resume"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => send({ kind: "nextTurn" })}
                disabled={phase === "idle" || phase === "finished" || running}
              >
                <SkipForward className="size-4" />
                Next turn
              </Button>
              <Button variant="secondary" onClick={() => send({ kind: "judge" })}>
                <Gavel className="size-4" />
                Re-score
              </Button>
              <Button variant="outline" onClick={() => send({ kind: "reset" })}>
                <RotateCcw className="size-4" />
                Reset arena
              </Button>
              <Button variant="outline" onClick={() => send({ kind: "showExport" })}>
                Show summary
              </Button>
              <Button
                variant="outline"
                onClick={downloadTranscript}
                disabled={!snapshot?.messages.length}
              >
                <Download className="size-4" />
                Markdown transcript
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
              <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground">
                Language
              </span>
              {(["en", "ar"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => updateSettings({ language: lang })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    settings.language === lang
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-hairline text-muted-foreground hover:text-foreground",
                  )}
                >
                  {lang === "en" ? "English" : "العربية"}
                </button>
              ))}

              <span className="ml-4 font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground">
                Voice
              </span>
              <button
                type="button"
                onClick={() =>
                  updateSettings({ tts: { ...settings.tts, enabled: !settings.tts.enabled } })
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  settings.tts.enabled
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-hairline text-muted-foreground",
                )}
              >
                {settings.tts.enabled ? "on" : "off"}
              </button>

              <span className="ml-4 font-mono text-[11px] tracking-[0.14em] uppercase text-muted-foreground">
                QR payload
              </span>
              {(["text", "url"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateSettings({ share: { ...settings.share, qrMode: mode } })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    settings.share.qrMode === mode
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-hairline text-muted-foreground hover:text-foreground",
                  )}
                  title={
                    mode === "text"
                      ? "Summary encoded in the QR itself — scans with no connectivity"
                      : "QR points at a hosted URL — needs internet on the visitor's phone"
                  }
                >
                  {mode === "text" ? "offline text" : "hosted URL"}
                </button>
              ))}
            </div>
          </div>

          {/* ---- full topic menu (the scroller's staff-side equivalent) ---- */}
          <div className="rounded-xl border border-hairline bg-surface-1 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="mr-2 font-mono text-[11px] tracking-[0.16em] uppercase text-muted-foreground">
                Topic menu
              </p>
              {["all", ...Object.keys(TOPIC_CATEGORY_LABEL)].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    category === key
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-hairline text-muted-foreground hover:text-foreground",
                  )}
                >
                  {key === "all"
                    ? "All"
                    : TOPIC_CATEGORY_LABEL[key as keyof typeof TOPIC_CATEGORY_LABEL]}
                </button>
              ))}
            </div>

            <ul className="arena-scroll max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
              {topics.map((topic) => (
                <li key={topic.id}>
                  <button
                    type="button"
                    disabled={phase !== "idle"}
                    onClick={() => send({ kind: "start", topic: topicText(topic, arabic) })}
                    className="w-full rounded-lg border border-hairline px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="mr-2 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
                      {TOPIC_CATEGORY_LABEL[topic.category]}
                    </span>
                    {topicText(topic, arabic)}
                  </button>
                </li>
              ))}
            </ul>
            {phase !== "idle" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Reset the arena to start a different topic.
              </p>
            )}
          </div>

          {/* ---- full scrolling transcript ---- */}
          <div className="flex h-[520px] flex-col overflow-hidden rounded-xl border border-hairline bg-surface-1 p-4">
            <ConversationStream
              language={settings.language}
              messages={snapshot?.messages ?? []}
              names={names}
              topic={snapshot?.topic ?? ""}
              speakingId={null}
              revealFraction={1}
              revealedIds={new Set()}
              syncActive={false}
            />
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-hairline bg-surface-1 p-4">
            <p className="mb-3 font-mono text-[11px] tracking-[0.16em] uppercase text-muted-foreground">
              Speaker state
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(["alpha", "beta"] as Side[]).map((side) => (
                <div key={side} className="rounded-lg border border-hairline p-3">
                  <p className="text-sm font-semibold" style={{ color: CHARACTERS[side].color }}>
                    {names[side]}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {snapshot?.status[side] ?? "idle"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <JudgePanel
            scorecard={snapshot?.scorecard ?? null}
            judging={snapshot?.judging ?? false}
            names={names}
            onJudge={() => send({ kind: "judge" })}
            canJudge={(snapshot?.messages.length ?? 0) >= 2}
            language={settings.language}
          />
        </aside>
      </main>
    </div>
  );
}
