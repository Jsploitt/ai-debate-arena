/**
 * The winner's executive brief, on stage.
 *
 * Owns one side effect: when a final scorecard lands, ask the *winning
 * debater's own model* to fill the persona template, then show the result in a
 * scrollable box with a download.
 *
 * Deliberately not part of `useDebate`. The debate lifecycle stays the single
 * runtime owner (AGENTS.md invariant 4); this is a consumer of its output that
 * makes one extra model call of its own, the same way the PDF export is a
 * consumer of the scorecard.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  briefAuthorSide,
  briefFilename,
  buildBriefMessages,
  renderBrief,
  runBriefFill,
  type BriefFacts,
  type BriefFields,
} from "@/lib/verdict/brief";
import type { Persona } from "@/lib/personas";
import type {
  ArenaSettings,
  DebateLanguage,
  DebateMessage,
  JudgeScorecard,
  Side,
} from "@/lib/debate/types";

type Status = "idle" | "writing" | "ready" | "failed";

export function VerdictBrief({
  scorecard,
  persona,
  topic,
  names,
  settings,
  messages,
  language,
  onClose,
}: {
  scorecard: JudgeScorecard;
  persona: Persona;
  topic: string;
  names: Record<Side, string>;
  settings: ArenaSettings;
  messages: DebateMessage[];
  language: DebateLanguage;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [fields, setFields] = useState<BriefFields | null>(null);
  const [attempt, setAttempt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const authorSide = briefAuthorSide(scorecard);
  const winnerScores = scorecard[authorSide].scores;

  const facts: BriefFacts = useMemo(
    () => ({
      personaId: persona.id,
      topic,
      winnerName: scorecard.winner === "tie" ? `${names.alpha} & ${names.beta}` : names[authorSide],
      winnerTag: scorecard.winner === "tie" ? "Draw" : "Winner",
      scores: winnerScores,
      scale: scorecard.scale,
      language,
    }),
    [
      persona.id,
      topic,
      scorecard.winner,
      scorecard.scale,
      names,
      authorSide,
      winnerScores,
      language,
    ],
  );

  // One fill per verdict. `attempt` is the retry handle.
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("writing");
    setFields(null);

    const write = async () => {
      try {
        const chat = buildBriefMessages({
          persona,
          topic,
          scorecard,
          authorSide,
          names,
          messages,
          language,
        });
        const result = await runBriefFill(settings[authorSide], chat, controller.signal);
        if (controller.signal.aborted) return;
        // A null result still renders: the template falls back to its own
        // per-persona prompts, so the brief is never a blank document.
        setFields(result);
        setStatus(result ? "ready" : "failed");
      } catch {
        if (!controller.signal.aborted) setStatus("failed");
      }
    };

    void write();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, scorecard.verdict, persona.id]);

  const html = renderBrief(facts, fields);

  const download = useCallback(() => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = briefFilename(persona.id, topic);
    a.click();
    URL.revokeObjectURL(url);
  }, [html, persona.id, topic]);

  return (
    <div className="arena-panel mx-auto flex h-full max-w-[1500px] flex-col gap-3 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-base tracking-[0.25em] text-primary uppercase">
            {persona.title} · {persona.doc}
          </div>
          <p className="text-sm text-muted-foreground">
            {status === "writing"
              ? `${names[authorSide]} is writing the brief…`
              : status === "failed"
                ? `${names[authorSide]} could not complete the brief — showing the template's own wording.`
                : `${scorecard.winner === "tie" ? "Draw — brief" : "Brief"} written by ${names[authorSide]}. Scores are the ${persona.title}'s own.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAttempt((n) => n + 1)} className="text-base">
            <RefreshCw aria-hidden="true" /> Rewrite
          </Button>
          <Button onClick={download} className="text-base">
            <Download aria-hidden="true" /> Download
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close the brief">
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* The template sizes itself to the viewport it is given, so it is
            rendered at a fixed 16:9 and the box scrolls around it. */}
        <div className="arena-scroll min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-black/40 p-2">
          <div className="relative mx-auto aspect-video h-full max-h-full w-auto max-w-full min-w-[720px]">
            <iframe
              title={`${persona.doc} for ${topic}`}
              srcDoc={html}
              sandbox=""
              className="absolute inset-0 h-full w-full rounded border-0"
            />
            {status === "writing" && (
              <div className="absolute inset-0 flex items-center justify-center gap-3 rounded bg-background/70 text-lg backdrop-blur-sm">
                <Loader2 className="size-6 animate-spin" aria-hidden="true" />
                Writing…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
