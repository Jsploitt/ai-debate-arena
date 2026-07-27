import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Settings2, TerminalSquare } from "lucide-react";
import { ArenaHeader } from "@/components/arena/ArenaHeader";
import { ConversationStream } from "@/components/arena/ConversationStream";
import { ControlDesk } from "@/components/arena/ControlDesk";
import { DebaterStage } from "@/components/arena/DebaterStage";
import { HttpMonitor, TelemetryPanel } from "@/components/arena/DevConsole";
import { JudgePanel } from "@/components/arena/JudgePanel";

import { SettingsPanel } from "@/components/arena/SettingsPanel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "@/lib/debate/presets";
import { useDebate } from "@/lib/debate/useDebate";
import type { ArenaSettings } from "@/lib/debate/types";

const TITLE = "AI Debate Arena — Dell Saudi Arabia Local LLM Showcase";
const DESCRIPTION =
  "Two locally hosted LLMs debate any topic live, with real-time telemetry, streaming reasoning paths and a raw HTTP monitor. Built for the Dell Saudi Arabia Vision 2030 tech showcase.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Arena,
});

function Arena() {
  const [settings, setSettings] = useState<ArenaSettings>(DEFAULT_SETTINGS);
  const [input, setInput] = useState("");

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const updateSettings = useCallback((patch: Partial<ArenaSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const debate = useDebate(settings);

  const downloadTranscript = useCallback(() => {
    const lines = [
      `# AI Debate Arena — Transcript`,
      ``,
      `**Resolution:** ${debate.topic || "(none)"}`,
      `**Mode:** ${debate.usingSimulation ? "Simulation" : "Live Local API"}`,
      `**Debate language:** ${settings.language === "ar" ? "Arabic" : "English"}`,
      `**Generated:** ${new Date().toLocaleString()}`,
      ``,
      ...debate.messages.flatMap((m) => {
        const name = m.side === "alpha" ? settings.alpha.name : settings.beta.name;
        const model = m.side === "alpha" ? settings.alpha.model : settings.beta.model;
        return [
          `## Round ${m.round} — ${name} (${model})`,
          m.reasoning ? `> Reasoning: ${m.reasoning.replace(/\n/g, " ")}` : "",
          ``,
          m.content,
          m.telemetry
            ? `\n_TTFT ${m.telemetry.ttftMs}ms · ${m.telemetry.tokensPerSec} tok/s · ${m.telemetry.tokens} tokens_`
            : "",
          ``,
        ];
      }),
      ...(debate.scorecard
        ? [
            `## AI Judge Scorecard${debate.scorecard.simulated ? " (heuristic)" : ""}${debate.scorecard.interim ? " — provisional (debate in progress)" : ""}`,
            ``,
            `| Criterion | ${settings.alpha.name} | Why | ${settings.beta.name} | Why |`,
            `| --- | --- | --- | --- | --- |`,
            ...(Object.keys(debate.scorecard.alpha.scores) as Array<
              keyof typeof debate.scorecard.alpha.scores
            >).map(
              (c) =>
                `| ${c} | ${debate.scorecard!.alpha.scores[c].toFixed(1)} | ${debate.scorecard!.alpha.reasons?.[c] ?? ""} | ${debate.scorecard!.beta.scores[c].toFixed(1)} | ${debate.scorecard!.beta.reasons?.[c] ?? ""} |`,
            ),
            `| **Total** | **${debate.scorecard.alpha.total.toFixed(1)}** | | **${debate.scorecard.beta.total.toFixed(1)}** | |`,

            ``,
            `**Winner:** ${
              debate.scorecard.winner === "tie"
                ? "Draw"
                : debate.scorecard.winner === "alpha"
                  ? settings.alpha.name
                  : settings.beta.name
            }`,
            ``,
            debate.scorecard.verdict,
            ``,
          ]
        : []),
    ];
    const blob = new Blob([lines.filter((l) => l !== undefined).join("\n")], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `debate-transcript-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [debate.messages, debate.topic, debate.usingSimulation, debate.scorecard, settings]);


  const round = Math.floor(debate.turnIndex / 2) + (debate.turnIndex % 2 === 0 ? 1 : 1);

  return (
    <div className="flex min-h-screen flex-col">
      <ArenaHeader
        alphaState={debate.health.alpha}
        betaState={debate.health.beta}
        alphaModel={debate.resolvedModels.alpha ?? settings.alpha.model}
        betaModel={debate.resolvedModels.beta ?? settings.beta.model}
        judgeModel={debate.resolvedModels.judge ?? settings.judge.model}
        judgeEnabled={settings.judge.enabled}
        simulation={debate.usingSimulation}
      />

      <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-4 px-4 py-4 xl:px-8">
        <div className="flex items-center justify-between gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="lg">
                <Settings2 className="size-5" />
                Configuration
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="arena-scroll w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Arena Configuration</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-8">
                <SettingsPanel settings={settings} onChange={updateSettings} />
              </div>
            </SheetContent>
          </Sheet>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="lg">
                <TerminalSquare className="size-5" />
                Developer Console
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="arena-scroll w-full overflow-y-auto sm:max-w-2xl">
              <SheetHeader>
                <SheetTitle>Developer Console</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-8">
                <TelemetryPanel
                  telemetry={debate.lastTelemetry}
                  contextTokens={debate.contextTokens}
                  contextWindow={settings.contextWindow}
                />
                <div>
                  <p className="mb-2 font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
                    Live HTTP monitor
                  </p>
                  <HttpMonitor logs={debate.logs} />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <DebaterStage
          alpha={settings.alpha}
          beta={settings.beta}
          alphaStatus={debate.status.alpha}
          betaStatus={debate.status.beta}
          active={debate.phase === "running"}
          round={round}
          totalRounds={settings.rounds}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="arena-panel flex h-[52vh] min-h-[380px] flex-col overflow-hidden rounded-2xl p-4">
            <ConversationStream
              language={settings.language}
              messages={debate.messages}
              names={{ alpha: settings.alpha.name, beta: settings.beta.name }}
              topic={debate.topic}
            />
          </div>


          <aside className="arena-scroll flex max-h-[52vh] min-h-[380px] flex-col gap-3 overflow-y-auto overscroll-contain">
            <JudgePanel
              scorecard={debate.scorecard}
              judging={debate.judging}
              names={{ alpha: settings.alpha.name, beta: settings.beta.name }}
              onJudge={() => void debate.judgeDebate()}
              canJudge={debate.messages.length >= 2}
            />
          </aside>
        </div>





        <ControlDesk
          value={input}
          onValueChange={setInput}
          phase={debate.phase}
          onStart={() => void debate.start(input)}
          onPause={debate.pause}
          onResume={debate.resume}
          onNextTurn={() => void debate.nextTurn()}
          onReset={() => {
            debate.reset();
            setInput("");
          }}
          onDownload={downloadTranscript}
          language={settings.language}
          onLanguageChange={(language) => updateSettings({ language })}
        />
      </main>
    </div>
  );
}
