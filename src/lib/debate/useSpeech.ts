import { useCallback, useEffect, useRef, useState } from "react";
import { withLeadingSilence } from "./audioPad";
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
  // Bumped by stop(). A playNext that awaited across a stop()/restart must
  // not play its stale clip over the new session or resurrect its message id
  // into the just-cleared revealedIds.
  const sessionRef = useRef(0);
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

  /**
   * The voiceless fallback: pace the reveal at reading speed instead of
   * revealing the turn instantly.
   *
   * This is what keeps simulation mode (and any dead TTS service) looking
   * like a debate. Every piece of stage choreography — the spotlight, the
   * speaking mood, the word-by-word reveal, the "thinking" state on the other
   * side — is derived from this queue whenever voice sync is on. The old
   * behaviour marked a failed turn revealed immediately, so `speakingId`
   * lived for milliseconds: nobody ever lit up, whole turns popped in at
   * once, and the debate read as broken. Now a failed synthesis simply plays
   * silently at roughly speech pace.
   */
  const silentReveal = useCallback((item: QueueItem) => {
    const words = item.text.trim().split(/\s+/).filter(Boolean).length;
    // Paced like the streaming client, not like speech: simulateStream emits
    // a word every ~18-63ms (~40ms average), and the voiceless reveal should
    // feel like watching that stream, not like waiting out a phantom reading.
    const durationMs = Math.max(800, words * 42);
    const started = performance.now();
    return new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        // stop() flips playingRef; a toggle-off clears tts.enabled. Either way
        // this reveal is over.
        if (!playingRef.current || !settingsRef.current.tts.enabled) {
          clearInterval(timer);
          resolve();
          return;
        }
        const fraction = (performance.now() - started) / durationMs;
        if (fraction >= 1) {
          setRevealFraction(1);
          clearInterval(timer);
          resolve();
        } else {
          setRevealFraction(fraction);
        }
      }, 50);
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
    const session = sessionRef.current;
    setSpeakingId(next.id);
    setRevealFraction(0);

    // True only when real audio actually played to its end; every failure
    // shape (fetch failed, decode error, autoplay blocked) degrades to the
    // silent paced reveal instead of skipping the turn.
    let spoken = false;
    try {
      const s = settingsRef.current;
      // One voice service for both languages, and the speaker's own voice
      // either way — the Arabic path used to drop the voice entirely, so both
      // debaters shared one narrator.
      const raw = await synthesizeSpeech(next.text, s.tts.endpointEn, s[next.side].voice);
      // An idle audio sink swallows the first few hundred milliseconds of
      // playback while it wakes up — the debate's opening word was inaudible.
      // The pre-roll absorbs the wake-up; padSeconds keeps the reveal synced
      // to the speech rather than to the silence.
      const { blob, padSeconds } = await withLeadingSilence(raw);
      if (session !== sessionRef.current) return;
      const url = URL.createObjectURL(blob);
      const audio = audioRef.current;
      if (audio) {
        spoken = await new Promise<boolean>((resolve) => {
          // Polls the audio clock instead of listening to `timeupdate`: the
          // event only fires a few times a second, which made the typewriter
          // reveal advance in visible lurches. 50ms matches silentReveal.
          const tick = () => {
            const speechDuration = audio.duration - padSeconds;
            if (speechDuration > 0 && Number.isFinite(audio.duration)) {
              setRevealFraction(
                Math.min(1, Math.max(0, (audio.currentTime - padSeconds) / speechDuration)),
              );
            }
          };
          const timer = setInterval(tick, 50);
          const cleanup = () => {
            clearInterval(timer);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("error", onError);
            URL.revokeObjectURL(url);
          };
          const onEnded = () => {
            setRevealFraction(1);
            cleanup();
            resolve(true);
          };
          const onError = () => {
            cleanup();
            resolve(false);
          };
          audio.addEventListener("ended", onEnded);
          audio.addEventListener("error", onError);
          audio.src = url;
          audio.play().catch(() => {
            cleanup();
            resolve(false);
          });
        });
      }
    } catch (err) {
      console.warn("[useSpeech] TTS request failed, revealing silently:", err);
    }

    if (!spoken && playingRef.current && settingsRef.current.tts.enabled) {
      await silentReveal(next);
    }

    if (session !== sessionRef.current) return;
    markRevealed(next.id);
    void playNext();
  }, [markRevealed, silentReveal]);

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
    sessionRef.current++;
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
