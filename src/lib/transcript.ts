/**
 * Markdown transcript + scorecard export.
 *
 * `buildTranscriptMarkdown` is pure so it can be tested without a DOM; the
 * download half is isolated in `downloadMarkdown`, which is the only part that
 * touches browser APIs and must therefore only run in an event handler.
 */

import { JUDGE_CRITERIA } from "./debate/judge";
import type { ArenaSettings, DebateMessage, JudgeScorecard } from "./debate/types";

export function buildTranscriptMarkdown({
  topic,
  messages,
  scorecard,
  settings,
  simulated,
  now = new Date(),
}: {
  topic: string;
  messages: DebateMessage[];
  scorecard: JudgeScorecard | null;
  settings: ArenaSettings;
  simulated: boolean;
  now?: Date;
}): string {
  const names = { alpha: settings.alpha.name, beta: settings.beta.name };

  const lines: string[] = [
    "# AI Debate Arena — Transcript",
    "",
    `**Resolution:** ${topic || "(none)"}`,
    `**Mode:** ${simulated ? "Simulation" : "Live local API"}`,
    `**Debate language:** ${settings.language === "ar" ? "Arabic" : "English"}`,
    `**Generated:** ${now.toLocaleString()}`,
    "",
  ];

  for (const message of messages) {
    const name = names[message.side];
    const model = message.side === "alpha" ? settings.alpha.model : settings.beta.model;
    lines.push(`## Round ${message.round} — ${name} (${model})`);
    if (message.reasoning) {
      lines.push(`> Reasoning: ${message.reasoning.replace(/\n/g, " ")}`);
    }
    lines.push("", message.content);
    if (message.telemetry) {
      lines.push(
        "",
        `_TTFT ${message.telemetry.ttftMs}ms · ${message.telemetry.tokensPerSec} tok/s · ${message.telemetry.tokens} tokens_`,
      );
    }
    lines.push("");
  }

  if (scorecard) {
    const heading = [
      "## AI Judge Scorecard",
      scorecard.simulated ? " (heuristic)" : "",
      scorecard.interim ? " — provisional (debate in progress)" : "",
    ].join("");

    lines.push(
      heading,
      "",
      `| Criterion | Weight | ${names.alpha} | Why | ${names.beta} | Why |`,
      "| --- | --- | --- | --- | --- | --- |",
    );

    for (const criterion of JUDGE_CRITERIA) {
      const weight = scorecard.weights?.[criterion] ?? 1;
      lines.push(
        `| ${criterion} | ×${weight} | ${(scorecard.alpha.scores[criterion] ?? 0).toFixed(1)} | ${
          scorecard.alpha.reasons?.[criterion] ?? ""
        } | ${(scorecard.beta.scores[criterion] ?? 0).toFixed(1)} | ${
          scorecard.beta.reasons?.[criterion] ?? ""
        } |`,
      );
    }

    lines.push(
      `| **Total** | | **${scorecard.alpha.total.toFixed(1)}** | | **${scorecard.beta.total.toFixed(1)}** | |`,
      "",
      `**Winner:** ${
        scorecard.winner === "tie"
          ? "Draw"
          : scorecard.winner === "alpha"
            ? names.alpha
            : names.beta
      }`,
      "",
      scorecard.verdict,
      "",
    );
  }

  return lines.join("\n");
}

/** Browser-only. Call from an event handler, never during render. */
export function downloadMarkdown(markdown: string, filename: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    // Revoke on the next tick: revoking synchronously can cancel the download
    // in some browsers before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
