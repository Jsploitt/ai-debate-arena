import { useEffect, useRef, useState } from "react";
import { PerspectiveCards } from "./PerspectiveCards";
import { TopicScroller } from "./TopicScroller";
import { TOPICS, type Topic } from "@/lib/arena/topics";
import type { JudgeScorecard } from "@/lib/debate/types";

/**
 * One component, two render states, one layout slot.
 *
 * Before a topic is picked this is the scrolling topic wall; after, it is the
 * four judging perspectives. The swap is one orchestrated move: each marquee
 * row keeps travelling in its own direction as it leaves — so it reads as the
 * scroller departing rather than a crossfade — and the cards then rise into
 * the vacated space, staggered.
 */
export function TopicSlot({
  mode,
  onPick,
  scorecard,
  arabic = false,
}: {
  mode: "scroller" | "perspectives";
  onPick: (topic: Topic) => void;
  scorecard: JudgeScorecard | null;
  arabic?: boolean;
}) {
  const [rendered, setRendered] = useState(mode);
  const [leaving, setLeaving] = useState(false);
  const [entering, setEntering] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (mode === rendered) return;
    timers.current.forEach(window.clearTimeout);
    setLeaving(true);
    timers.current = [
      window.setTimeout(() => {
        setLeaving(false);
        setRendered(mode);
        setEntering(true);
      }, 500),
      window.setTimeout(() => setEntering(false), 1100),
    ];
    return () => timers.current.forEach(window.clearTimeout);
  }, [mode, rendered]);

  if (rendered === "perspectives") {
    return <PerspectiveCards scorecard={scorecard} arabic={arabic} entering={entering} />;
  }

  return <TopicScroller topics={TOPICS} onPick={onPick} arabic={arabic} leaving={leaving} />;
}
