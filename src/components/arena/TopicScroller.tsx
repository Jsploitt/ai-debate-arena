import { useEffect, useRef, useState } from "react";
import { TOPIC_CATEGORY_LABEL, topicRows, topicText, type Topic } from "@/lib/arena/topics";
import { cn } from "@/lib/utils";

/**
 * Two-row auto-scrolling topic marquee.
 *
 * Top row travels left, bottom row travels right, continuously. Hovering or
 * touching one row pauses only that row, so a visitor can read what caught
 * their eye while the other row keeps inviting attention. Tap targets are
 * sized for a touchscreen, not a mouse.
 */
export function TopicScroller({
  topics,
  onPick,
  arabic = false,
  leaving = false,
}: {
  topics: Topic[];
  onPick: (topic: Topic) => void;
  arabic?: boolean;
  /** Set while the slot is swapping to the perspective cards. */
  leaving?: boolean;
}) {
  const [top, bottom] = topicRows(topics);

  return (
    <div className="relative flex h-full w-full flex-col justify-center gap-5 overflow-hidden">
      <MarqueeRow
        topics={top}
        direction="left"
        onPick={onPick}
        arabic={arabic}
        leaving={leaving}
        durationSec={64}
      />
      <MarqueeRow
        topics={bottom}
        direction="right"
        onPick={onPick}
        arabic={arabic}
        leaving={leaving}
        durationSec={74}
      />

      {/* Edge masks so cards enter and leave rather than pop. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-surface-0 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-surface-0 to-transparent" />
    </div>
  );
}

function MarqueeRow({
  topics,
  direction,
  onPick,
  arabic,
  leaving,
  durationSec,
}: {
  topics: Topic[];
  direction: "left" | "right";
  onPick: (topic: Topic) => void;
  arabic: boolean;
  leaving: boolean;
  durationSec: number;
}) {
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<number | null>(null);

  // A touch pauses the row and holds it long enough to actually read, then
  // releases on its own — nobody at a booth knows to "un-touch" to resume.
  const holdPause = () => {
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    setPaused(true);
    resumeTimer.current = window.setTimeout(() => setPaused(false), 4000);
  };

  useEffect(
    () => () => {
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    },
    [],
  );

  return (
    <div
      className="relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={holdPause}
    >
      <div
        className={cn(
          "flex w-max gap-5",
          leaving && (direction === "left" ? "arena-exit-left" : "arena-exit-right"),
        )}
        style={{
          animationName: leaving
            ? undefined
            : direction === "left"
              ? "arena-marquee-left"
              : "arena-marquee-right",
          animationDuration: `${durationSec}s`,
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        {/* Doubled so the translate(-50%) loop is seamless. */}
        {[0, 1].map((copy) =>
          topics.map((topic) => (
            <TopicCard key={`${copy}-${topic.id}`} topic={topic} onPick={onPick} arabic={arabic} />
          )),
        )}
      </div>
    </div>
  );
}

function TopicCard({
  topic,
  onPick,
  arabic,
}: {
  topic: Topic;
  onPick: (topic: Topic) => void;
  arabic: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(topic)}
      dir={arabic ? "rtl" : "ltr"}
      className={cn(
        "group flex h-[132px] w-[440px] shrink-0 flex-col justify-between rounded-2xl border border-hairline bg-surface-1 px-7 py-5 text-left",
        "transition-all duration-200 hover:border-faisal hover:bg-surface-2 active:scale-[0.98]",
        arabic && "text-right",
      )}
    >
      <span className="arena-label text-steel/70 group-hover:text-faisal">
        {TOPIC_CATEGORY_LABEL[topic.category]}
      </span>
      <span
        className={cn(
          "font-display text-body-l font-semibold leading-tight text-foreground",
          arabic && "font-kufi",
        )}
      >
        {topicText(topic, arabic)}
      </span>
      <span className="arena-flag-rule w-16 rounded-full opacity-60 transition-all duration-300 group-hover:w-32 group-hover:opacity-100" />
    </button>
  );
}
