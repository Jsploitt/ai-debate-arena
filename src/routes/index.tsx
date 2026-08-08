import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { CharacterStage } from "@/components/arena/CharacterStage";
import { JudgeBanner } from "@/components/arena/JudgeBanner";
import { LeanRail } from "@/components/arena/LeanRail";
import { StageTranscript } from "@/components/arena/StageTranscript";
import { TopicSlot } from "@/components/arena/TopicSlot";
import { VerdictExport } from "@/components/arena/VerdictExport";
import { CHARACTERS, characterName, type CharacterState } from "@/lib/arena/characters";
import { buildSummary, qrPayload } from "@/lib/arena/summary";
import { topicText, type Topic } from "@/lib/arena/topics";
import { useArenaHost } from "@/lib/arena/useArenaLink";
import type { ArenaCommand, ArenaSnapshot } from "@/lib/arena/channel";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "@/lib/debate/presets";
import { useDebate } from "@/lib/debate/useDebate";
import { useSpeech } from "@/lib/debate/useSpeech";
import type { ArenaSettings, Side, SpeakerStatus } from "@/lib/debate/types";

const TITLE = "AI Debate Arena — Dell Technologies Saudi Arabia";
const DESCRIPTION =
  "Two locally hosted models debate live, a third scores every round, and the visitor leaves with the summary. Built for Dell Technologies Saudi Arabia at LEAP 2026.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PublicDisplay,
});

/**
 * THE PUBLIC DISPLAY.
 *
 * This view renders zero staff controls — no settings, no dev console, no
 * start/pause/reset, no free-text input. Everything a visitor can do is touch
 * a topic. The staff control view lives at /control in a second window and
 * talks to this one over BroadcastChannel; this window owns the debate engine
 * so the stage never depends on another process being alive.
 */
function PublicDisplay() {
  const [settings, setSettings] = useState<ArenaSettings>(DEFAULT_SETTINGS);
  const [exportVisible, setExportVisible] = useState(false);

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
  const speech = useSpeech(settings, debate.messages);
  const arabic = settings.language === "ar";

  // ---- what the audience is actually hearing -----------------------------
  // With voice sync on, generation runs far ahead of playback; the stage must
  // follow the voice, not the token stream.
  const effectiveStatus = useCallback(
    (side: Side): SpeakerStatus => {
      if (!speech.syncActive) return debate.status[side];
      const sideMessages = debate.messages.filter((m) => m.side === side);
      if (sideMessages.some((m) => m.id === speech.speakingId)) return "speaking";
      const pending = sideMessages.some(
        (m) =>
          !m.streaming &&
          m.content.trim() &&
          m.id !== speech.speakingId &&
          !speech.revealedIds.has(m.id),
      );
      return pending || debate.status[side] !== "idle" ? "thinking" : "idle";
    },
    [debate.messages, debate.status, speech.revealedIds, speech.speakingId, speech.syncActive],
  );

  const alphaStatus = effectiveStatus("alpha");
  const betaStatus = effectiveStatus("beta");

  // ---- reacting: the listener answers the speaker's handover -------------
  const [reacting, setReacting] = useState<Side | null>(null);
  const lastSpeaker = useRef<Side | null>(null);
  useEffect(() => {
    const speaker: Side | null =
      alphaStatus === "speaking" ? "alpha" : betaStatus === "speaking" ? "beta" : null;
    if (speaker && speaker !== lastSpeaker.current) {
      const listener: Side = speaker === "alpha" ? "beta" : "alpha";
      lastSpeaker.current = speaker;
      setReacting(listener);
      const timer = window.setTimeout(() => setReacting(null), 900);
      return () => window.clearTimeout(timer);
    }
  }, [alphaStatus, betaStatus]);

  const characterState = (side: Side, status: SpeakerStatus): CharacterState =>
    status === "speaking"
      ? "speaking"
      : reacting === side
        ? "reacting"
        : status === "thinking"
          ? "thinking"
          : "idle";

  const states: Record<Side, CharacterState> = {
    alpha: characterState("alpha", alphaStatus),
    beta: characterState("beta", betaStatus),
  };

  // ---- motion budget -----------------------------------------------------
  // When the Mizan rail is settling at a turn boundary, the characters stand
  // still. At most two things move at once, ever.
  const [railSettling, setRailSettling] = useState(false);
  const lastScoreStamp = useRef(0);
  useEffect(() => {
    const stamp = debate.scorecard?.createdAt ?? 0;
    if (stamp && stamp !== lastScoreStamp.current) {
      lastScoreStamp.current = stamp;
      setRailSettling(true);
      const timer = window.setTimeout(() => setRailSettling(false), 900);
      return () => window.clearTimeout(timer);
    }
  }, [debate.scorecard]);

  const round = Math.floor(debate.turnIndex / 2) + 1;
  const effectiveRound = (() => {
    if (!speech.syncActive) return round;
    const speaking = debate.messages.find((m) => m.id === speech.speakingId);
    if (speaking) return speaking.round;
    const lastRevealed = [...debate.messages].reverse().find((m) => speech.revealedIds.has(m.id));
    return lastRevealed?.round ?? 1;
  })();

  const hasTopic = Boolean(debate.topic);
  const finished = debate.phase === "finished";

  // ---- verdict → export → reset -----------------------------------------
  useEffect(() => {
    if (finished && !debate.judging && debate.scorecard && !debate.scorecard.interim) {
      const timer = window.setTimeout(() => setExportVisible(true), 2600);
      return () => window.clearTimeout(timer);
    }
  }, [finished, debate.judging, debate.scorecard]);

  const summary = useMemo(
    () => buildSummary(debate.topic, debate.messages, debate.scorecard, arabic),
    [debate.topic, debate.messages, debate.scorecard, arabic],
  );

  const resetArena = useCallback(() => {
    setExportVisible(false);
    debate.reset();
    speech.stop();
  }, [debate, speech]);

  const pickTopic = useCallback(
    (topic: Topic) => {
      if (debate.phase !== "idle") return;
      void debate.start(topicText(topic, arabic));
    },
    [arabic, debate],
  );

  // ---- control-window link ----------------------------------------------
  const snapshot: ArenaSnapshot = {
    phase: debate.phase,
    topic: debate.topic,
    round: effectiveRound,
    totalRounds: settings.rounds,
    turnIndex: debate.turnIndex,
    messages: debate.messages,
    status: { alpha: alphaStatus, beta: betaStatus },
    scorecard: debate.scorecard,
    judging: debate.judging,
    usingSimulation: debate.usingSimulation,
    health: debate.health as unknown as Record<Side, string>,
    settings,
    exportVisible,
    ts: Date.now(),
  };

  const onCommand = useCallback(
    (command: ArenaCommand) => {
      switch (command.kind) {
        case "start":
          if (command.topic.trim()) void debate.start(command.topic.trim());
          break;
        case "pause":
          debate.pause();
          break;
        case "resume":
          debate.resume();
          break;
        case "nextTurn":
          void debate.nextTurn();
          break;
        case "reset":
          resetArena();
          break;
        case "judge":
          void debate.judgeDebate();
          break;
        case "settings":
          updateSettings(command.patch);
          break;
        case "showExport":
          setExportVisible(true);
          break;
        case "dismissExport":
          setExportVisible(false);
          break;
      }
    },
    [debate, resetArena, updateSettings],
  );

  useArenaHost(snapshot, onCommand);

  const names: Record<Side, string> = {
    alpha: characterName("alpha", arabic),
    beta: characterName("beta", arabic),
  };

  return (
    <div className="arena-kufic relative flex h-screen w-screen flex-col gap-5 overflow-hidden px-12 py-8">
      {/* ---- brand line ---- */}
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-title font-bold tracking-tight text-foreground">
            Dell Technologies
          </span>
          <span className="arena-flag-rule h-[2px] w-24 self-center rounded-full" />
          <span className="arena-label text-steel/80">
            {arabic ? "ساحة المناظرة" : "AI Debate Arena"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <RuntimePill
            simulation={debate.usingSimulation}
            resolving={debate.health.alpha === "unknown" || debate.health.alpha === "checking"}
            arabic={arabic}
          />
        </div>
      </header>

      <JudgeBanner
        scorecard={debate.scorecard}
        judging={debate.judging}
        names={names}
        arabic={arabic}
        dormant={!hasTopic}
      />

      {/* ---- stage ---- */}
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        {hasTopic && (
          <p
            className="shrink-0 text-center font-display text-title font-semibold text-foreground/90"
            dir={arabic ? "rtl" : "ltr"}
          >
            {debate.topic}
          </p>
        )}

        <div className="flex min-h-0 flex-1 items-end gap-8">
          <div className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <CharacterStage
              states={states}
              round={effectiveRound}
              totalRounds={settings.rounds}
              arabic={arabic}
              still={railSettling}
              compact={hasTopic}
              showRound={hasTopic}
              center={
                hasTopic ? null : (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <p className="font-display text-display-l font-bold text-foreground">
                      {arabic ? "اختر موضوعاً" : "Touch a topic"}
                    </p>
                    <p className="text-body-l text-steel">
                      {arabic
                        ? `${CHARACTERS.alpha.nameAr} و${CHARACTERS.beta.nameAr} سيتناظران، والحكم يسجل النقاط`
                        : `${CHARACTERS.alpha.name} and ${CHARACTERS.beta.name} will argue it out — the judge scores every round`}
                    </p>
                    <span className="arena-flag-rule mt-2 w-40 rounded-full" />
                  </div>
                )
              }
            />
          </div>
        </div>

        <LeanRail scorecard={debate.scorecard} settled={finished} arabic={arabic} />

        {hasTopic ? (
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <StageTranscript
              messages={debate.messages}
              speakingId={speech.speakingId}
              revealFraction={speech.revealFraction}
              revealedIds={speech.revealedIds}
              syncActive={speech.syncActive}
              arabic={arabic}
            />
          </div>
        ) : null}
      </div>

      {/* ---- the swap slot ---- */}
      <div className="h-[236px] shrink-0">
        <TopicSlot
          mode={hasTopic ? "perspectives" : "scroller"}
          onPick={pickTopic}
          scorecard={debate.scorecard}
          arabic={arabic}
        />
      </div>

      {/* Dell watermark */}
      <span className="pointer-events-none absolute bottom-3 right-6 font-display text-data font-semibold tracking-[0.3em] text-hairline">
        DELL
      </span>

      {exportVisible && (
        <VerdictExport
          summary={summary}
          qrValue={qrPayload(summary, settings.share.qrMode, settings.share.baseUrl, arabic)}
          arabic={arabic}
          seconds={settings.share.holdSeconds}
          onDone={resetArena}
        />
      )}
    </div>
  );
}

/**
 * Runtime state. Stays neutral until the health check has actually answered —
 * claiming "local runtime" for two seconds and then flipping to "simulation"
 * is the kind of thing a visitor notices and a demo cannot afford.
 */
function RuntimePill({
  simulation,
  resolving,
  arabic,
}: {
  simulation: boolean;
  resolving: boolean;
  arabic: boolean;
}) {
  const tone = resolving
    ? "border-hairline text-steel"
    : simulation
      ? "border-judge/50 bg-judge-soft text-judge"
      : "border-majed/50 text-majed";
  const label = resolving
    ? arabic
      ? "جارٍ الاتصال"
      : "Connecting"
    : simulation
      ? arabic
        ? "وضع المحاكاة"
        : "Simulation"
      : arabic
        ? "تشغيل محلي"
        : "Local runtime";
  return <span className={`arena-label rounded-full border px-4 py-1.5 ${tone}`}>{label}</span>;
}
