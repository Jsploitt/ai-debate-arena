import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Gavel, Download, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AgentStage,
  CloudBubble,
  Nameplate,
  ScoreBanner,
  TopicRail,
} from "@/components/arena/stage";
import { CastRail } from "@/components/arena/CastRail";
import { characterById, randomCastPatch, slotArt } from "@/lib/characters";
import { useDebateRuntime } from "@/components/arena/DebateRuntimeProvider";
import { VerdictBrief } from "@/components/arena/VerdictBrief";
import { useSettings } from "@/components/arena/SettingsProvider";
import {
  agentMood,
  cloudText,
  effectiveRound,
  focusSide,
  leanPercent,
  runtimeLabel,
  runtimeState,
  scoredTurnsDelivered,
  speakingSide,
} from "@/lib/debate/presentation";
import {
  DEFAULT_PERSONA_ID,
  PERSONAS,
  PERSONA_LIST,
  criterionLabel,
  personaForWeights,
  type PersonaId,
} from "@/lib/personas";
import { downloadVerdictPdf, verdictDocFromScorecard } from "@/lib/pdf";

const TITLE = "AI Debate Arena — Two Local LLMs, One Executive Judge";
const DESCRIPTION =
  "Pick a motion, appoint a CFO, CTO, CMO or CEO judge, and watch two locally hosted models debate it live under the spotlight.";

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
  component: ArenaHome,
});

const TOPICS_ROW_1 = [
  "Replace sales with AI agents",
  "Go fully remote, close offices",
  "Open-source the core product",
  "Ban meetings over 15 minutes",
  "Leave the public cloud",
  "Four-day work week",
  "Kill the free tier",
  "Acquire our competitor",
  "Freeze hiring, automate",
  "Rebrand for a new market",
];

const TOPICS_ROW_2 = [
  "Pay everyone the same salary",
  "Halve marketing, fund R&D",
  "Launch in three countries",
  "Make all documents public",
  "Scrap annual reviews",
  "Build our own AI models",
  "Sunset the oldest product",
  "Usage-based pricing",
  "Outsource all support",
  "Go public in 18 months",
];

const TOPICS_ROW_1_AR = [
  "استبدال فريق المبيعات بوكلاء ذكاء اصطناعي",
  "العمل عن بعد بالكامل وإغلاق المكاتب",
  "فتح المصدر للمنتج الأساسي",
  "منع الاجتماعات التي تتجاوز ربع ساعة",
  "مغادرة السحابة العامة",
  "أسبوع عمل من أربعة أيام",
];

const TOPICS_ROW_2_AR = [
  "توحيد الرواتب بين جميع الموظفين",
  "تقليص التسويق لتمويل البحث والتطوير",
  "إتاحة جميع المستندات للجميع",
  "إلغاء التقييمات السنوية",
  "بناء نماذج ذكاء اصطناعي خاصة بنا",
  "التسعير حسب الاستخدام",
];

function ArenaHome() {
  const { settings, updateSettings } = useSettings();
  const { debate, speech } = useDebateRuntime();

  const [topic, setTopic] = useState<string | null>(null);
  // The brief opens by itself when the gavel falls, and can be dismissed to
  // put the two debaters back on screen.
  const [showBrief, setShowBrief] = useState(true);
  const activeTopic = debate.topic || topic;

  const isArabic = settings.language === "ar";
  const dir = isArabic ? "rtl" : "ltr";
  const names = useMemo(
    () => ({ alpha: settings.alpha.name, beta: settings.beta.name }),
    [settings.alpha.name, settings.beta.name],
  );

  // Stage art follows the stored character only, so editing a prompt or slider
  // never swaps the avatar mid-session.
  const alphaArt = slotArt(settings.alpha, "alpha");
  const betaArt = slotArt(settings.beta, "beta");

  /**
   * A fresh random cast for every debate, drawn when the stage is reset for a
   * new one (`resetAll`) — deliberately NOT on page load, so a reload keeps
   * whatever cast is already seated. A pick made in the cast switcher
   * afterwards overrides the draw for that debate.
   */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // The persona is derived from the real judge weights rather than tracked
  // separately, so a hand-tuned rubric in the config panel is reflected here
  // instead of being silently overwritten by a stale local copy.
  const personaId: PersonaId | null = personaForWeights(settings.judge.weights);
  const persona = PERSONAS[personaId ?? DEFAULT_PERSONA_ID];

  const speech_ = speech;
  const speaking = speakingSide(debate.status, debate.messages, speech_);
  // Between turns nobody is speaking; the last turn keeps the emphasis so the
  // stage does not flatten in the gaps.
  const focus = focusSide(speaking, debate.messages);
  const state = runtimeState({
    phase: debate.phase,
    status: debate.status,
    health: debate.health,
    messages: debate.messages,
    judging: debate.judging,
    usingSimulation: debate.usingSimulation,
    speech: speech_,
  });

  // The scoreboard the audience sees. The engine's scorecard updates as soon
  // as a turn *generates*, which is well before the audience has heard it —
  // so the raw card is held back until every turn it scored has actually been
  // delivered, and points land right after the speaker finishes.
  const [scorecard, setScorecard] = useState<typeof debate.scorecard>(null);
  useEffect(() => {
    const candidate = debate.scorecard;
    if (!candidate) {
      setScorecard(null);
      return;
    }
    if (scoredTurnsDelivered(candidate, debate.messages, speech_)) {
      setScorecard(candidate);
    }
  }, [debate.scorecard, debate.messages, speech_]);

  const proTotal = scorecard?.alpha.total ?? 0;
  const conTotal = scorecard?.beta.total ?? 0;
  const round = effectiveRound(debate.turnIndex, debate.messages, speech_);

  const proCloud = cloudText("alpha", debate.messages, speech_, settings.language);
  const conCloud = cloudText("beta", debate.messages, speech_, settings.language);

  const started = debate.phase !== "idle" || debate.messages.length > 0;
  const finished = debate.phase === "finished";
  const hasFinalVerdict = finished && !!scorecard && !scorecard.interim;

  // The brief waits for the room to fall silent. Judging finishes well ahead of
  // the voice, so gating on the verdict alone dropped the panel over a debater
  // who was still mid-sentence.
  const stillSpeaking =
    speech_.syncActive &&
    (speech_.speakingId !== null ||
      debate.messages.some((m) => m.content.trim() && !speech_.revealedIds.has(m.id)));
  const briefReady = hasFinalVerdict && !stillSpeaking;

  const rails = useMemo(
    () => (isArabic ? [TOPICS_ROW_1_AR, TOPICS_ROW_2_AR] : [TOPICS_ROW_1, TOPICS_ROW_2]),
    [isArabic],
  );

  const pickPersona = useCallback(
    (id: PersonaId) => {
      // Writes the actual judge weights — this is a real settings change, not a
      // label. Guarded while running so a live debate is not rescored midway.
      updateSettings({ judge: { ...settings.judge, weights: PERSONAS[id].weights } });
    },
    [settings.judge, updateSettings],
  );

  const startDebate = useCallback(() => {
    if (!topic || debate.phase === "running") return;
    void debate.start(topic).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : "The arena could not start.");
    });
  }, [debate, topic]);

  const resetAll = useCallback(() => {
    debate.reset();
    speech.stop();
    setTopic(null);
    setShowBrief(true);
    // The next debate gets a fresh pairing by default; picking in the cast
    // switcher afterwards still overrides it.
    updateSettings(randomCastPatch(settingsRef.current));
  }, [debate, speech, updateSettings]);

  const downloadBrief = useCallback(() => {
    if (!scorecard || !activeTopic) return;
    const doc = verdictDocFromScorecard(scorecard, persona, activeTopic, names);
    downloadVerdictPdf(
      doc,
      persona,
      activeTopic,
      winnerLabel(scorecard.winner, names),
      proTotal,
      conTotal,
    );
  }, [scorecard, persona, activeTopic, names, proTotal, conTotal]);

  return (
    <main className="stage-vignette stage-backdrop flex h-screen flex-col overflow-hidden px-4 py-3">
      <header className="relative z-20 shrink-0 text-center">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-sm tracking-[0.3em] text-muted-foreground uppercase sm:text-base">
            {debate.usingSimulation ? "Simulation" : "Live local models"}
          </span>
          {/* The Control Arena link that used to live here is now the subtle
              corner icon at the bottom of the page — a big labelled link was
              one visitor tap away from derailing the presentation. Choosing
              the cast is the stage-level action that earns this spot. */}
          <CastRail
            settings={settings}
            disabled={debate.phase === "running" || debate.phase === "paused"}
            onChange={updateSettings}
          />
        </div>

        {!started && <h1 className="gold-text text-5xl font-bold sm:text-7xl">AI Debate Arena</h1>}

        {activeTopic && (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
            <span
              dir={dir}
              className="font-display rounded-xl border-2 border-primary/60 bg-primary/10 px-8 py-2 text-3xl font-bold text-primary shadow-[0_0_40px_-10px_var(--primary)] sm:text-4xl"
            >
              {activeTopic}
            </span>
            <Button variant="ghost" onClick={resetAll} className="text-base">
              <RotateCcw aria-hidden="true" /> New
            </Button>
          </div>
        )}

        {started && (
          // Names and the judge are deliberately absent here: the nameplates
          // own identity and the footer's judge chip owns the bench, so the
          // banner is sides, numbers and round only.
          <ScoreBanner
            proTotal={proTotal}
            conTotal={conTotal}
            round={round}
            totalRounds={settings.rounds}
            leanPercent={leanPercent(proTotal, conTotal)}
            provisional={scorecard?.interim}
          />
        )}
      </header>

      <section className="relative min-h-0 flex-1" aria-label="Debate stage">
        {/* The floor: a lit edge at the figures' feet with a wash below it.
            AgentStage lifts the figures onto this line, so the strip beneath
            is visible stage floor rather than empty margin. */}
        <div
          aria-hidden="true"
          className="stage-horizon pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[4.5vh]"
        />
        <AgentStage
          label={`${names.alpha}, arguing for the motion`}
          img={alphaArt.art[agentMood("alpha", speaking, proTotal, conTotal)]}
          flip={alphaArt.flip}
          lit={speaking === "alpha"}
          dim={speaking === "beta"}
          position="left"
        />
        <AgentStage
          label={`${names.beta}, arguing against the motion`}
          img={betaArt.art[agentMood("beta", speaking, conTotal, proTotal)]}
          flip={betaArt.flip}
          lit={speaking === "beta"}
          dim={speaking === "alpha"}
          position="right"
        />

        <Nameplate
          name={names.alpha}
          title={characterById(settings.alpha.characterId)?.title}
          side="alpha"
          model={debate.resolvedModels.alpha ?? settings.alpha.model}
          lit={speaking === "alpha"}
          position="left"
        />
        <Nameplate
          name={names.beta}
          title={characterById(settings.beta.characterId)?.title}
          side="beta"
          model={debate.resolvedModels.beta ?? settings.beta.model}
          lit={speaking === "beta"}
          position="right"
        />

        {/* Covers the whole viewport rather than the stage section: the
            template is a four-panel 16:9 slide, and the section left it with
            barely half the height it needs. */}
        {showBrief && briefReady && (
          <div className="fixed inset-0 z-30 bg-background/85 p-4 backdrop-blur-sm sm:p-8">
            <VerdictBrief
              scorecard={scorecard!}
              persona={persona}
              topic={activeTopic!}
              names={names}
              settings={settings}
              messages={debate.messages}
              language={settings.language}
              onClose={() => setShowBrief(false)}
            />
          </div>
        )}

        <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[74%] flex-col justify-center gap-6 overflow-hidden sm:max-w-[58%]">
          <div className="sr-only" aria-live="polite">
            {runtimeLabel(state, debate.usingSimulation)}
          </div>

          {proCloud && (
            <CloudBubble
              side="alpha"
              active={speaking === "alpha"}
              prominent={focus === "alpha"}
              text={proCloud}
              dir={dir}
            />
          )}
          {conCloud && (
            <CloudBubble
              side="beta"
              active={speaking === "beta"}
              prominent={focus === "beta"}
              text={conCloud}
              dir={dir}
            />
          )}

          {!proCloud && !conCloud && started && (
            <div className="flex items-center justify-center gap-3 text-center text-xl text-muted-foreground">
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              {runtimeLabel(state, debate.usingSimulation)}
            </div>
          )}
        </div>
      </section>

      <footer className="relative z-20 shrink-0">
        {!activeTopic ? (
          <div className="space-y-1">
            <TopicRail topics={rails[0]} onPick={setTopic} />
            <TopicRail topics={rails[1]} onPick={setTopic} reverse />
          </div>
        ) : hasFinalVerdict ? (
          <div className="arena-panel mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-3">
            <div>
              <div className="font-display text-base tracking-[0.25em] text-primary uppercase">
                {persona.title} · {persona.doc}
              </div>
              <p dir={dir} className="mt-1 text-xl text-foreground/90">
                Winner:{" "}
                <span className="text-primary">{winnerLabel(scorecard!.winner, names)}</span> —{" "}
                {scorecard!.verdict}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="lg"
                className="font-display text-base"
                onClick={() => setShowBrief((open) => !open)}
              >
                <FileText aria-hidden="true" /> {showBrief ? "Hide brief" : "Show brief"}
              </Button>
              <Button size="lg" className="font-display text-base" onClick={downloadBrief}>
                <Download aria-hidden="true" /> Download PDF
              </Button>
            </div>
          </div>
        ) : !started ? (
          <div className="mx-auto max-w-5xl">
            <h2 className="sr-only">Appoint a judge</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PERSONA_LIST.map((p) => {
                const active = p.id === personaId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickPersona(p.id)}
                    className={`rounded-xl border px-4 py-3 text-left transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      active
                        ? "border-primary bg-primary/15 shadow-[0_0_24px_-6px_var(--primary)]"
                        : "border-border bg-background/40 hover:border-primary/50"
                    }`}
                  >
                    <div className="font-display text-2xl font-bold text-primary sm:text-3xl">
                      {p.title}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      weights {criterionLabel(p.focus)}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 text-center">
              <Button onClick={startDebate} size="lg" className="font-display text-lg">
                <Gavel aria-hidden="true" /> Begin the debate
              </Button>
            </div>
          </div>
        ) : (
          // Mid-debate the picker collapses to the sitting judge: four dead
          // cards offered a choice that could no longer be made, and the same
          // fact was printed again in the score banner above.
          <div className="arena-panel mx-auto flex max-w-3xl items-center justify-center gap-4 rounded-xl px-6 py-2.5">
            <Gavel className="size-7 shrink-0 text-primary" aria-hidden="true" />
            <div className="text-left">
              <div className="font-display text-xl font-bold text-primary sm:text-2xl">
                {persona.title} presiding
              </div>
              <div className="text-sm text-muted-foreground sm:text-base">
                weights {criterionLabel(persona.focus)} · {persona.docFraming}
                {scorecard?.interim ? " · score is provisional" : ""}
              </div>
            </div>
          </div>
        )}
      </footer>

      <Link
        to="/arena"
        aria-label="Control arena (booth operators)"
        title="Control arena"
        className="fixed right-1.5 bottom-1.5 z-20 rounded-md p-2 text-muted-foreground/40 transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
      </Link>
    </main>
  );
}

function winnerLabel(
  winner: "alpha" | "beta" | "tie",
  names: { alpha: string; beta: string },
): string {
  if (winner === "tie") return "Draw";
  return winner === "alpha" ? names.alpha : names.beta;
}
