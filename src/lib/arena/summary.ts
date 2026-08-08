import { CHARACTERS } from "./characters";
import { perspectiveScores } from "./perspectives";
import type { DebateMessage, JudgeScorecard, Side } from "@/lib/debate/types";

export interface DebateSummary {
  topic: string;
  winner: Side | "tie";
  winnerName: string;
  /** One page, bullets only — never paragraphs. */
  bullets: string[];
  verdict: string;
  totals: Record<Side, number>;
  maxTotal: number;
}

/** First sentence of a turn, trimmed to something readable at a glance. */
function headline(message: DebateMessage, limit = 150): string {
  const text = message.content.replace(/\s+/g, " ").trim();
  const sentence = text.split(/(?<=[.!?؟])\s/)[0] ?? text;
  const picked = sentence.length > 24 ? sentence : text;
  return picked.length > limit ? `${picked.slice(0, limit - 1).trimEnd()}…` : picked;
}

export function buildSummary(
  topic: string,
  messages: DebateMessage[],
  scorecard: JudgeScorecard | null,
  arabic = false,
): DebateSummary {
  const winner = scorecard?.winner ?? "tie";
  const winnerName =
    winner === "tie"
      ? arabic
        ? "تعادل"
        : "Draw"
      : arabic
        ? CHARACTERS[winner].nameAr
        : CHARACTERS[winner].name;

  const bullets: string[] = [];

  // Strongest opening from each side, in the order they spoke.
  for (const side of ["alpha", "beta"] as Side[]) {
    const first = messages.find((m) => m.side === side && m.content.trim());
    if (first) {
      const name = arabic ? CHARACTERS[side].nameAr : CHARACTERS[side].name;
      bullets.push(`${name}: ${headline(first)}`);
    }
  }

  // The last exchange, which is where the debate actually landed.
  const closing = [...messages].reverse().find((m) => m.content.trim());
  if (closing && !messages.slice(0, 2).includes(closing)) {
    const name = arabic ? CHARACTERS[closing.side].nameAr : CHARACTERS[closing.side].name;
    bullets.push(
      `${arabic ? "الختام" : "Closing"} — ${name}: ${headline(closing)}`,
    );
  }

  // Where each perspective landed.
  if (scorecard) {
    for (const reading of perspectiveScores(scorecard)) {
      const label = arabic ? reading.perspective.labelAr : reading.perspective.label;
      const lead =
        reading.leader === "tie"
          ? arabic
            ? "تعادل"
            : "level"
          : arabic
            ? CHARACTERS[reading.leader].nameAr
            : CHARACTERS[reading.leader].name;
      bullets.push(`${label}: ${lead} (${reading.alpha}–${reading.beta})`);
    }
  }

  return {
    topic,
    winner,
    winnerName,
    bullets,
    verdict: scorecard?.verdict ?? "",
    totals: {
      alpha: scorecard?.alpha.total ?? 0,
      beta: scorecard?.beta.total ?? 0,
    },
    maxTotal: scorecard?.maxTotal ?? 50,
  };
}

/**
 * What the QR actually carries.
 *
 * Default is plain text: a visitor's phone is on carrier data, not booth wifi,
 * so a QR pointing at localhost or a LAN address resolves to nothing. A text
 * QR renders in every scanner with zero connectivity, which is the only option
 * that cannot fail on the stand. Staff can switch to URL mode from the control
 * view if the booth gets reliable internet on the day.
 */
export function qrPayload(
  summary: DebateSummary,
  mode: "text" | "url",
  baseUrl: string,
  arabic = false,
): string {
  const lines = [
    arabic ? "مناظرة الذكاء الاصطناعي — ديل" : "Dell AI Debate Arena",
    summary.topic,
    "",
    `${arabic ? "الفائز" : "Winner"}: ${summary.winnerName}`,
    "",
    ...summary.bullets.map((b) => `• ${b}`),
  ];
  const text = lines.join("\n");

  if (mode === "url" && baseUrl.trim()) {
    const encoded = encodeURIComponent(text);
    return `${baseUrl.replace(/[#/]+$/, "")}/#s=${encoded}`;
  }
  return text;
}
