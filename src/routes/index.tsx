import { useCallback, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Gavel, Download, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AgentStage, CloudBubble, ScoreBanner, TopicRail } from "@/components/arena/stage";
import { slotArt } from "@/lib/characters";
import { useDebateRuntime } from "@/components/arena/DebateRuntimeProvider";
import { useSettings } from "@/components/arena/SettingsProvider";
import {
  agentMood,
  cloudText,
  effectiveRound,
  leanPercent,
  runtimeLabel,
  runtimeState,
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

const TITLE = "Arena of Debate — Two Local LLMs, One Executive Judge";
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

  const proTotal = debate.scorecard?.alpha.total ?? 0;
  const conTotal = debate.scorecard?.beta.total ?? 0;
  const round = effectiveRound(debate.turnIndex, debate.messages, speech_);

  const proCloud = cloudText("alpha", debate.messages, speech_, settings.language);
  const conCloud = cloudText("beta", debate.messages, speech_, settings.language);

  const started = debate.phase !== "idle" || debate.messages.length > 0;
  const finished = debate.phase === "finished";
  const hasFinalVerdict = finished && !!debate.scorecard && !debate.scorecard.interim;

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
  }, [debate, speech]);

  const downloadBrief = useCallback(() => {
    if (!debate.scorecard || !activeTopic) return;
    const doc = verdictDocFromScorecard(debate.scorecard, persona, activeTopic, names);
    downloadVerdictPdf(
      doc,
      persona,
      activeTopic,
      winnerLabel(debate.scorecard.winner, names),
      proTotal,
      conTotal,
    );
  }, [debate.scorecard, persona, activeTopic, names, proTotal, conTotal]);

  return (
    <main className="flex h-screen flex-col overflow-hidden px-4 py-3">
      <header className="shrink-0 text-center">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
            {debate.usingSimulation ? "Simulation" : "Live local models"}
          </span>
          <Link
            to="/arena"
            className="font-display inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-3 py-1.5 text-[11px] tracking-[0.2em] text-foreground/85 uppercase backdrop-blur transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            Control arena
          </Link>
        </div>

        {!started && <h1 className="gold-text text-4xl font-bold sm:text-5xl">Arena of Debate</h1>}

        {activeTopic && (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <span
              dir={dir}
              className="font-display rounded-lg border border-primary/50 bg-primary/10 px-6 py-2 text-xl font-semibold text-primary sm:text-2xl"
            >
              {activeTopic}
            </span>
            <Button variant="ghost" size="sm" onClick={resetAll}>
              <RotateCcw aria-hidden="true" /> New
            </Button>
          </div>
        )}

        {started && (
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
        )}
      </header>

      <section className="relative min-h-0 flex-1" aria-label="Debate stage">
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

        <div className="relative z-10 mx-auto flex h-full w-full max-w-[70%] flex-col justify-center gap-4 sm:max-w-[46%]">
          <div className="sr-only" aria-live="polite">
            {runtimeLabel(state, debate.usingSimulation)}
          </div>

          {proCloud && (
            <CloudBubble side="alpha" active={speaking === "alpha"} text={proCloud} dir={dir} />
          )}
          {conCloud && (
            <CloudBubble side="beta" active={speaking === "beta"} text={conCloud} dir={dir} />
          )}

          {!proCloud && !conCloud && started && (
            <div className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {runtimeLabel(state, debate.usingSimulation)}
            </div>
          )}

          {!started && (
            <div className="text-center text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
              {activeTopic ? "Awaiting the gavel" : "Pick a motion"}
            </div>
          )}
        </div>
      </section>

      <footer className="shrink-0">
        {!activeTopic ? (
          <div className="space-y-1">
            <TopicRail topics={rails[0]} onPick={setTopic} />
            <TopicRail topics={rails[1]} onPick={setTopic} reverse />
          </div>
        ) : hasFinalVerdict ? (
          <div className="arena-panel mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-3">
            <div>
              <div className="font-display text-[11px] tracking-[0.25em] text-primary uppercase">
                {persona.title} · {persona.doc}
              </div>
              <p dir={dir} className="mt-1 text-sm text-foreground/90">
                Winner:{" "}
                <span className="text-primary">{winnerLabel(debate.scorecard!.winner, names)}</span>{" "}
                — {debate.scorecard!.verdict}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" className="font-display">
                <Link to="/arena">Full scorecard</Link>
              </Button>
              <Button className="font-display" onClick={downloadBrief}>
                <Download aria-hidden="true" /> Download PDF
              </Button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-5xl">
            <h2 className="sr-only">Appoint a judge</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PERSONA_LIST.map((p) => {
                const active = p.id === personaId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={started}
                    aria-pressed={active}
                    onClick={() => pickPersona(p.id)}
                    className={`rounded-xl border px-3 py-2 text-left transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60 ${
                      active
                        ? "border-primary bg-primary/10 shadow-[0_0_24px_-6px_var(--primary)]"
                        : "border-border bg-background/40 hover:border-primary/50"
                    }`}
                  >
                    <div className="font-display text-lg font-bold text-primary">{p.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      weights {criterionLabel(p.focus)}
                    </div>
                  </button>
                );
              })}
            </div>
            {!started && (
              <div className="mt-2 text-center">
                <Button onClick={startDebate} className="font-display">
                  <Gavel aria-hidden="true" /> Begin the debate
                </Button>
              </div>
            )}
          </div>
        )}
      </footer>
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
