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
  currentTurnMessage,
  effectiveRound,
  leanPercent,
  runtimeLabel,
  runtimeState,
  deliveredTurnCount,
  scoredSides,
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
import { ALL_TOPICS } from "@/lib/debate/presets";

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

// Both ticker rows draw from the same catalogue the Control Arena picker
// shows, so the two surfaces always offer identical motions.
const TOPICS_ROW_1 = ALL_TOPICS.slice(0, Math.ceil(ALL_TOPICS.length / 2));
const TOPICS_ROW_2 = ALL_TOPICS.slice(Math.ceil(ALL_TOPICS.length / 2));

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
  // as a turn *generates*, which is well before the audience has heard it.
  // Every candidate is kept, keyed by how many turns it scored, and the one
  // shown is the newest whose turns have all been DELIVERED on stage — so the
  // board moves once at the end of every single turn, even when generation
  // (and therefore judging) runs several turns ahead of the voice. Holding
  // only the latest candidate used to skip turns: turn N's score was
  // superseded by turn N+1's before N had finished being spoken.
  const [scorecard, setScorecard] = useState<typeof debate.scorecard>(null);
  const scoreQueueRef = useRef(new Map<number, NonNullable<typeof debate.scorecard>>());
  useEffect(() => {
    const candidate = debate.scorecard;
    if (!candidate) {
      scoreQueueRef.current.clear();
      setScorecard(null);
      return;
    }
    scoreQueueRef.current.set(candidate.turnsScored ?? 0, candidate);
    const delivered = deliveredTurnCount(debate.messages, speech_);
    let bestCount = -1;
    for (const count of scoreQueueRef.current.keys()) {
      if (count <= delivered && count > bestCount) bestCount = count;
    }
    if (bestCount >= 0) {
      setScorecard(scoreQueueRef.current.get(bestCount)!);
      return;
    }
    // No candidate is fully delivered. Mid-debate that means "hold the last
    // shown card" — but after a route round-trip this component remounts with
    // an empty queue and no last card, and holding meant showing 0.0 until
    // the voice caught up with the newest judgement. Fall back to the least-
    // ahead candidate available rather than a scoreboard reset — but only
    // once something has actually been delivered: at debate start (delivered
    // 0, no previous card) this fallback moved the lean bar mid-speech,
    // before the score digits were even shown.
    if (delivered === 0) return;
    setScorecard((prev) => {
      if (prev) return prev;
      let oldest = Infinity;
      for (const count of scoreQueueRef.current.keys()) oldest = Math.min(oldest, count);
      return Number.isFinite(oldest) ? (scoreQueueRef.current.get(oldest) ?? null) : null;
    });
  }, [debate.scorecard, debate.messages, speech_]);

  // A side with no delivered turn has no score yet, which the board must not
  // render as a zero.
  const scored = scoredSides(debate.messages, speech_);

  const proTotal = scorecard?.alpha.total ?? 0;
  const conTotal = scorecard?.beta.total ?? 0;
  const round = effectiveRound(debate.turnIndex, debate.messages, speech_);

  // The stage shows ONE response at a time — the turn being delivered, or the
  // last one the audience received. Keeping both sides' latest turns on screen
  // together read out of order at the top of each round: pro's NEW turn sat in
  // the upper bubble while con's turn from the PREVIOUS round stayed below it.
  const current = currentTurnMessage(debate.messages, speech_);
  const currentText = current
    ? cloudText(current.side, debate.messages, speech_, settings.language)
    : null;

  // When the turn changes, the finished turn plays a short exit so old
  // dialogue visibly gets pushed up and away rather than vanishing in place.
  const [outgoing, setOutgoing] = useState<{
    id: string;
    side: "alpha" | "beta";
    text: string;
  } | null>(null);
  const lastShownRef = useRef<{ id: string; side: "alpha" | "beta" } | null>(null);
  useEffect(() => {
    const prev = lastShownRef.current;
    lastShownRef.current = current ? { id: current.id, side: current.side } : null;
    if (!current) {
      setOutgoing(null);
      return;
    }
    if (prev && prev.id !== current.id) {
      const prevMessage = debate.messages.find((m) => m.id === prev.id);
      if (prevMessage?.content.trim()) {
        setOutgoing({ id: prev.id, side: prev.side, text: prevMessage.content });
      }
    }
    // The exit only ever fires on a turn change, not on every stream chunk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const started = debate.phase !== "idle" || debate.messages.length > 0;
  const finished = debate.phase === "finished";

  // The deliverable does not exist on screen until the LAST character has
  // finished speaking: every generated turn delivered, nobody mid-reveal, and
  // the final (non-interim) verdict released. Judging finishes well ahead of
  // the voice, so gating on the verdict alone dropped the panel over a
  // debater who was still mid-sentence.
  const allDelivered =
    debate.messages.length > 0 &&
    deliveredTurnCount(debate.messages, speech_) >= debate.messages.length &&
    speech_.speakingId === null;
  const hasFinalVerdict = finished && !!scorecard && !scorecard.interim && allDelivered;

  // Hold the closing tableau for a beat before the verdict takes over the
  // stage — cutting to the result the instant the last word lands leaves the
  // audience no time to register who won or the final score.
  const [verdictRevealed, setVerdictRevealed] = useState(false);
  useEffect(() => {
    if (!hasFinalVerdict) {
      setVerdictRevealed(false);
      return;
    }
    const timer = window.setTimeout(() => setVerdictRevealed(true), 3000);
    return () => window.clearTimeout(timer);
  }, [hasFinalVerdict]);

  const briefReady = hasFinalVerdict && verdictRevealed;

  const rails = [TOPICS_ROW_1, TOPICS_ROW_2];

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
            scored={scored}
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

        <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[74%] flex-col justify-center overflow-hidden sm:max-w-[58%]">
          <div className="sr-only" aria-live="polite">
            {runtimeLabel(state, debate.usingSimulation)}
          </div>

          {/* The previous turn on its way out, pushed up and faded while the
              new turn pops in — decorative, so hidden from assistive tech. */}
          {outgoing && outgoing.id !== current?.id && (
            <div
              key={outgoing.id}
              aria-hidden="true"
              className="bubble-exit pointer-events-none absolute inset-0 flex flex-col justify-center"
              onAnimationEnd={() => setOutgoing(null)}
            >
              <CloudBubble
                side={outgoing.side}
                active={false}
                pop={false}
                text={outgoing.text}
                dir={dir}
              />
            </div>
          )}

          {current && currentText && (
            <CloudBubble
              key={current.id}
              side={current.side}
              active={speaking === current.side}
              prominent
              text={currentText}
              dir={dir}
            />
          )}

          {!currentText && started && (
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
        ) : hasFinalVerdict && verdictRevealed ? (
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
