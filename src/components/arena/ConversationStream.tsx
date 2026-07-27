import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ChevronRight,
  Gauge,
  Pause,
  Play,
  Terminal,
  Timer,
} from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DebateLanguage, DebateMessage } from "@/lib/debate/types";

function isHardHitting(text: string) {
  return /(wrong|fails|collapses|nonsense|moat|theatre|blow|dismantle|obsolete)/i.test(text);
}

function MessageBubble({
  message,
  names,
  language = "en",
}: {
  message: DebateMessage;
  names: Record<string, string>;
  language?: DebateLanguage;
}) {
  const isAlpha = message.side === "alpha";
  const rtl = language === "ar";
  return (
    <div
      className={cn(
        "arena-rise flex w-full gap-3",
        isAlpha ? "justify-start" : "justify-end",
        !message.streaming && isHardHitting(message.content) && "arena-shake",
      )}
    >
      <div
        className={cn(
          "w-full max-w-[min(78ch,88%)] rounded-2xl border px-5 py-4",
          isAlpha
            ? "border-alpha/40 bg-alpha-soft"
            : "border-beta/40 bg-beta-soft",
        )}
      >
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs tracking-[0.16em] uppercase">
          <span className={cn("font-semibold", isAlpha ? "text-alpha" : "text-beta")}>
            {names[message.side]}
          </span>
          <span className="text-muted-foreground">Round {message.round}</span>
          {message.telemetry && (
            <span className="flex items-center gap-3 font-mono text-muted-foreground normal-case">
              <span className="flex items-center gap-1">
                <Timer className="size-3" />
                {message.telemetry.ttftMs}ms
              </span>
              <span className="flex items-center gap-1">
                <Gauge className="size-3" />
                {message.telemetry.tokensPerSec} tok/s
              </span>
            </span>
          )}
        </div>

        {message.reasoning && (
          <Collapsible>
            <CollapsibleTrigger className="group mb-3 flex items-center gap-1.5 rounded-md border border-border/70 bg-background/50 px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground">
              <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
              <Terminal className="size-3.5" />
              Reasoning Path
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre dir={rtl ? "rtl" : "ltr"} className="arena-scroll mb-3 max-h-56 overflow-auto rounded-lg border border-border/70 bg-background/80 p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-terminal">
{message.reasoning}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}

        <p
          dir={rtl ? "rtl" : "ltr"}
          className={cn(
            "text-[1.05rem] leading-relaxed text-foreground md:text-lg",
            rtl && "text-right",
          )}
        >
          {message.content}
          {message.streaming && (
            <span className="ml-0.5 inline-block h-5 w-2 translate-y-0.5 animate-pulse bg-primary" />
          )}
        </p>
      </div>
    </div>
  );
}

export function ConversationStream({
  messages,
  names,
  topic,
  language = "en",
}: {
  messages: DebateMessage[];
  names: Record<string, string>;
  topic: string;
  language?: DebateLanguage;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoFollow, setAutoFollow] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const scrollToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    if (!autoFollow) return;
    scrollToLatest();
  }, [messages, autoFollow]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-end gap-2">
        {!autoFollow && !atBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={scrollToLatest}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            <ArrowDownToLine className="size-3.5" />
            Jump to latest
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const next = !autoFollow;
            setAutoFollow(next);
            if (next) scrollToLatest();
          }}
          aria-pressed={autoFollow}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors",
            autoFollow
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border bg-card/70 text-muted-foreground hover:text-foreground",
          )}
        >
          {autoFollow ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          Auto-follow {autoFollow ? "on" : "off"}
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="arena-scroll flex-1 space-y-4 overflow-y-auto overscroll-contain px-1 py-2"
      >
        {messages.length === 0 ? (
          <div className="grid h-full min-h-56 place-items-center rounded-2xl border border-dashed border-border/70 text-center">
            <div className="max-w-lg px-6">
              <p className="text-lg font-medium text-muted-foreground">
                The arena is silent. Enter a resolution below and start the debate.
              </p>
              <p className="mt-2 font-mono text-sm text-muted-foreground/70">
                Two locally hosted models. Zero data leaves this workstation.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div
              dir={language === "ar" ? "rtl" : "ltr"}
              className="mx-auto w-fit rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-center font-mono text-sm text-primary"
            >
              {language === "ar" ? "الطرح: " : "RESOLUTION: "}
              {topic}
            </div>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} names={names} language={language} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

