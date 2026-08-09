import { useCallback, useEffect, useRef, useState } from "react";
import { synthesizeSpeech } from "./tts";
import type { ArenaSettings, DebateMessage, Side } from "./types";

interface QueueItem {
  id: string;
  side: Side;
  text: string;
}

/**
 * Speaks each finalized debate turn aloud, one at a time, in order — never
 * overlapping Alpha and Beta. Best-effort only: any fetch/playback failure
 * is swallowed so a broken TTS endpoint never blocks or breaks the text
 * debate (same "never fail on stage" philosophy as the simulation fallback).
 *
 * Also tracks actual audio playback position so the transcript can reveal
 * each turn's text in sync with the voice reading it, rather than at LLM
 * generation speed (which finishes long before the audio does).
 */
export function useSpeech(settings: ArenaSettings, messages: DebateMessage[]) {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [revealFraction, setRevealFraction] = useState(0);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const playingRef = useRef(false);
  const spokenIdsRef = useRef(new Set<string>());
  const wasEnabledRef = useRef(settings.tts.enabled);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  const markRevealed = useCallback((id: string) => {
    setRevealedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const playNext = useCallback(async () => {
    if (!settingsRef.current.tts.enabled) {
      queueRef.current = [];
      playingRef.current = false;
      setSpeakingId(null);
      setRevealFraction(0);
      return;
    }
    const next = queueRef.current.shift();
    if (!next) {
      playingRef.current = false;
      setSpeakingId(null);
      setRevealFraction(0);
      return;
    }
    playingRef.current = true;
    setSpeakingId(next.id);
    setRevealFraction(0);

    try {
      const s = settingsRef.current;
      const ar = s.language === "ar";
      const endpoint = ar ? s.tts.endpointAr : s.tts.endpointEn;
      const voice = ar ? undefined : s[next.side].voice;
      const blob = await synthesizeSpeech(next.text, endpoint, voice);
      const url = URL.createObjectURL(blob);
      const audio = audioRef.current;
      if (audio) {
        await new Promise<void>((resolve) => {
          const onTimeUpdate = () => {
            if (audio.duration > 0 && Number.isFinite(audio.duration)) {
              setRevealFraction(Math.min(1, audio.currentTime / audio.duration));
            }
          };
          const cleanup = () => {
            audio.removeEventListener("ended", onDone);
            audio.removeEventListener("error", onDone);
            audio.removeEventListener("timeupdate", onTimeUpdate);
            URL.revokeObjectURL(url);
          };
          const onDone = () => {
            setRevealFraction(1);
            cleanup();
            resolve();
          };
          audio.addEventListener("ended", onDone);
          audio.addEventListener("error", onDone);
          audio.addEventListener("timeupdate", onTimeUpdate);
          audio.src = url;
          audio.play().catch(() => {
            cleanup();
            resolve();
          });
        });
      }
    } catch (err) {
      console.warn("[useSpeech] TTS request failed, skipping turn:", err);
    }

    markRevealed(next.id);
    void playNext();
  }, [markRevealed]);

  useEffect(() => {
    // If voice just got turned on, don't retroactively hide turns that were
    // already fully visible under the old (instant-display) behaviour.
    if (settings.tts.enabled && !wasEnabledRef.current) {
      setRevealedIds((prev) => {
        const next = new Set(prev);
        for (const m of messages) next.add(m.id);
        return next;
      });
    }
    wasEnabledRef.current = settings.tts.enabled;

    if (!settings.tts.enabled) return;
    for (const m of messages) {
      if (m.streaming || !m.content.trim() || spokenIdsRef.current.has(m.id)) continue;
      spokenIdsRef.current.add(m.id);
      queueRef.current.push({ id: m.id, side: m.side, text: m.content });
    }
    if (!playingRef.current && queueRef.current.length > 0) void playNext();
  }, [messages, settings.tts.enabled, playNext]);

  const stop = useCallback(() => {
    queueRef.current = [];
    playingRef.current = false;
    spokenIdsRef.current.clear();
    setSpeakingId(null);
    setRevealFraction(0);
    setRevealedIds(new Set());
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
  }, []);

  // Stop immediately if voice generation is turned off mid-playback.
  useEffect(() => {
    if (!settings.tts.enabled) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.tts.enabled]);

  return {
    speakingId,
    revealFraction,
    revealedIds,
    /** True while sync-reveal should apply at all (voice is on). */
    syncActive: settings.tts.enabled,
    stop,
  };
}
