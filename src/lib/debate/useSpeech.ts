import { useCallback, useEffect, useRef, useState } from "react";
import { synthesizeSpeech } from "./tts";
import type { ArenaSettings, DebateMessage, Side } from "./types";

interface QueueItem {
  id: string;
  side: Side;
  text: string;
}

export interface SpeechOptions {
  /**
   * Whether this instance may actually produce sound. Only the tab driving the
   * session speaks; mirroring tabs take the reveal state off the wire instead,
   * so the audience never hears two tabs reading the same turn at once.
   */
  active?: boolean;
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
export function useSpeech(
  settings: ArenaSettings,
  messages: DebateMessage[],
  options: SpeechOptions = {},
) {
  const { active = true } = options;
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
  const mountedRef = useRef(true);
  // Aborts the in-flight synthesis request; replaced per utterance.
  const requestRef = useRef<AbortController | null>(null);
  // The object URL currently attached to the audio element, so teardown can
  // revoke it even when playback never reached "ended".
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueRef.current = [];
      playingRef.current = false;
      requestRef.current?.abort();
      audio.pause();
      audio.src = "";
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      audioRef.current = null;
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
    // The queue is drained by a self-recursive call, so every re-entry has to
    // re-check that the hook is still alive and still allowed to speak.
    if (!mountedRef.current || !settingsRef.current.tts.enabled) {
      queueRef.current = [];
      playingRef.current = false;
      if (mountedRef.current) {
        setSpeakingId(null);
        setRevealFraction(0);
      }
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
      const controller = new AbortController();
      requestRef.current = controller;
      const blob = await synthesizeSpeech(next.text, endpoint, voice, controller.signal);
      if (!mountedRef.current) return;
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
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
            if (objectUrlRef.current === url) objectUrlRef.current = null;
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
      if (mountedRef.current) {
        console.warn("[useSpeech] TTS request failed, skipping turn:", err);
      }
    }

    if (!mountedRef.current) return;
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

    if (!settings.tts.enabled || !active) return;
    for (const m of messages) {
      if (m.streaming || !m.content.trim() || spokenIdsRef.current.has(m.id)) continue;
      spokenIdsRef.current.add(m.id);
      queueRef.current.push({ id: m.id, side: m.side, text: m.content });
    }
    if (!playingRef.current && queueRef.current.length > 0) void playNext();
  }, [messages, settings.tts.enabled, active, playNext]);

  const stop = useCallback(() => {
    queueRef.current = [];
    playingRef.current = false;
    spokenIdsRef.current.clear();
    requestRef.current?.abort();
    setSpeakingId(null);
    setRevealFraction(0);
    setRevealedIds(new Set());
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  // Stop immediately if voice generation is turned off mid-playback, or if this
  // instance stops being the one allowed to speak.
  useEffect(() => {
    if (!settings.tts.enabled || !active) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.tts.enabled, active]);

  return {
    speakingId,
    revealFraction,
    revealedIds,
    /** True while sync-reveal should apply at all (voice is on). */
    syncActive: settings.tts.enabled,
    stop,
  };
}
