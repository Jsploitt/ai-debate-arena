import { useCallback, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Download,
  Gavel,
  Home,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AGENT_ART, AgentStage, ScoreBanner } from "@/components/arena/stage";
import { ConfigPanel } from "@/components/arena/ConfigPanel";
import {
  HttpMonitor,
  Kicker,
  ScorecardPanel,
  StatusRail,
  TelemetryPanel,
  TranscriptPanel,
} from "@/components/arena/panels";
import { useSettings } from "@/components/arena/SettingsProvider";
import { useDebateSession } from "@/components/arena/DebateProvider";
import {
  agentMood,
  effectiveRound,
  leanPercent,
  runtimeLabel,
  runtimeState,
  speakingSide,
} from "@/lib/debate/presentation";
import { SAMPLE_TOPICS, SAMPLE_TOPICS_AR } from "@/lib/debate/presets";
import { DEFAULT_PERSONA_ID, PERSONAS, personaForWeights } from "@/lib/personas";
import { buildTranscriptMarkdown, downloadMarkdown } from "@/lib/transcript";

const TITLE = "Control Arena — AI Debate Arena";
const DESCRIPTION =
  "The instrumented debate arena: live transcript, streamed reasoning, weighted judge scorecard, telemetry, raw HTTP monitor and full runtime configuration.";

export const Route = createFileRoute("/arena")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: ControlArena,
});

function ControlArena() {
  const { settings, updateSettings, resetSettings } = useSettings();
  // The same session `/` is looking at — in this tab and in every other tab.
  const {
    debate,
    speech,
    motion: input,
    setMotion: setInput,
    startDebate,
    resetAll,
  } = useDebateSession();

  const [autoFollow, setAutoFollow] = useState(true);

  const names = { alpha: settings.alpha.name, beta: settings.beta.name };
  const isArabic = settings.language === "ar";
  const samples = isArabic ? SAMPLE_TOPICS_AR : SAMPLE_TOPICS;

  const persona = PERSONAS[personaForWeights(settings.judge.weights) ?? DEFAULT_PERSONA_ID];
  const speaking = speakingSide(debate.status, debate.messages, speech);
  const state = runtimeState({
    phase: debate.phase,
    status: debate.status,
    health: debate.health,
    messages: debate.messages,
    judging: debate.judging,
    usingSimulation: debate.usingSimulation,
    speech,
  });

  const proTotal = debate.scorecard?.alpha.total ?? 0;
  const conTotal = debate.scorecard?.beta.total ?? 0;
  const round = effectiveRound(debate.turnIndex, debate.messages, speech);

  const running = debate.phase === "running";
  const started = debate.phase !== "idle" || debate.messages.length > 0;

  const exportTranscript = useCallback(() => {
    const markdown = buildTranscriptMarkdown({
      topic: debate.topic,
      messages: debate.messages,
      scorecard: debate.scorecard,
      settings,
      simulated: debate.usingSimulation,
    });
    downloadMarkdown(markdown, `debate-transcript-${Date.now()}.md`);
  }, [debate.topic, debate.messages, debate.scorecard, debate.usingSimulation, settings]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-4 px-4 py-4 xl:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="gold-text font-display text-2xl font-bold sm:text-3xl">Control Arena</h1>
          <Kicker>Full instrumentation · {persona.title} judging</Kicker>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <Home aria-hidden="true" /> Stage
            </Link>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal aria-hidden="true" /> Configuration
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="arena-scroll w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle className="font-display">Arena configuration</SheetTitle>
                <SheetDescription>
                  Every setting is saved as you change it and restored on reload.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-10">
                <ConfigPanel
                  settings={settings}
                  onChange={updateSettings}
                  onReset={resetSettings}
                  running={running}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <StatusRail
        health={debate.health}
        resolvedModels={debate.resolvedModels}
        names={names}
        simulation={debate.usingSimulation}
        judgeEnabled={settings.judge.enabled}
        statusLabel={runtimeLabel(state, debate.usingSimulation)}
      />

      {/* Stage band — the reference characters, at a height that leaves room
          for the instrumentation below. */}
      <section
        // overflow-hidden clips the absolutely-positioned character art, which
        // would otherwise push the page wider than the viewport. On `/` the
        // h-screen shell already clips it.
        className="relative h-[26vh] min-h-[180px] shrink-0 overflow-hidden rounded-xl sm:h-[34vh]"
        aria-label="Debate stage"
      >
        <AgentStage
          label={`${names.alpha}, arguing for the motion`}
          img={AGENT_ART.alpha[agentMood("alpha", speaking, proTotal, conTotal)]}
          lit={speaking === "alpha"}
          dim={speaking === "beta"}
          position="left"
          compact
        />
        <AgentStage
          label={`${names.beta}, arguing against the motion`}
          img={AGENT_ART.beta[agentMood("beta", speaking, conTotal, proTotal)]}
          lit={speaking === "beta"}
          dim={speaking === "alpha"}
          position="right"
          compact
        />
        <div className="relative z-10 flex h-full items-center justify-center">
          {started ? (
            <ScoreBanner
              names={names}
              proTotal={proTotal}
              conTotal={conTotal}
              round={round}
              totalRounds={settings.rounds}
              personaTitle={persona.title}
              leanPercent={leanPercent(proTotal, conTotal)}
              provisional={debate.scorecard?.interim}
            />
          ) : (
            <p className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
              Enter a motion to begin
            </p>
          )}
        </div>
      </section>

      {/* Transport */}
      <section className="arena-panel space-y-3 rounded-xl p-4" aria-label="Transport controls">
        <div className="flex flex-wrap gap-2">
          <label htmlFor="topic" className="sr-only">
            Motion
          </label>
          <Input
            id="topic"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") startDebate();
            }}
            dir={isArabic ? "rtl" : "ltr"}
            placeholder={isArabic ? "اكتب موضوع المناظرة…" : "Enter a motion to debate…"}
            disabled={started}
            className="min-w-[240px] flex-1"
          />

          <Button
            onClick={startDebate}
            disabled={!input.trim() || started}
            className="font-display"
          >
            <Gavel aria-hidden="true" /> Start
          </Button>

          {running ? (
            <Button variant="outline" onClick={debate.pause}>
              <Pause aria-hidden="true" /> Pause
            </Button>
          ) : (
            <Button variant="outline" onClick={debate.resume} disabled={debate.phase !== "paused"}>
              <Play aria-hidden="true" /> Resume
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => void debate.nextTurn()}
            disabled={debate.phase !== "paused"}
          >
            <SkipForward aria-hidden="true" /> Next turn
          </Button>

          <Button variant="outline" onClick={resetAll} disabled={!started}>
            <RotateCcw aria-hidden="true" /> Reset
          </Button>

          <Button
            variant="outline"
            onClick={exportTranscript}
            disabled={debate.messages.length === 0}
          >
            <Download aria-hidden="true" /> Export
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateSettings({ language: isArabic ? "en" : "ar" })}
            aria-label={`Switch debate language to ${isArabic ? "English" : "Arabic"}`}
          >
            {isArabic ? "العربية" : "English"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const enabled = !settings.tts.enabled;
              if (!enabled) speech.stop();
              updateSettings({ tts: { ...settings.tts, enabled } });
            }}
            aria-pressed={settings.tts.enabled}
          >
            {settings.tts.enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            Voice {settings.tts.enabled ? "on" : "off"}
          </Button>

          {!started && samples.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Kicker>Samples</Kicker>
              {samples.slice(0, 3).map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setInput(sample)}
                  dir={isArabic ? "rtl" : "ltr"}
                  className="rounded-md border border-border bg-background/60 px-2.5 py-1 text-[11px] text-foreground/80 transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {sample}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <TranscriptPanel
          messages={debate.messages}
          names={names}
          topic={debate.topic}
          language={settings.language}
          speakingId={speech.speakingId}
          revealFraction={speech.revealFraction}
          revealedIds={speech.revealedIds}
          syncActive={speech.syncActive}
          autoFollow={autoFollow}
          onAutoFollowChange={setAutoFollow}
        />

        <div className="arena-scroll flex max-h-[52vh] flex-col gap-4 overflow-y-auto overscroll-contain">
          <ScorecardPanel
            scorecard={debate.scorecard}
            judging={debate.judging}
            names={names}
            language={settings.language}
            canJudge={debate.messages.length >= 2}
            judgeEnabled={settings.judge.enabled}
            onJudge={() => void debate.judgeDebate()}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <HttpMonitor logs={debate.logs} />
        <TelemetryPanel
          telemetry={debate.lastTelemetry}
          names={names}
          contextTokens={debate.contextTokens}
          contextWindow={settings.contextWindow}
        />
      </div>
    </div>
  );
}
