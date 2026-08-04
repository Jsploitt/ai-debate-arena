import type { JudgeCriterion, JudgeScorecard, Side } from "./types";

export type MemoryResult = "win" | "loss" | "tie";

export interface DebateLesson {
  criterion: JudgeCriterion;
  kind: "improve" | "keep";
  text: string;
}

export interface DebaterMemory {
  /** How many times this side has debated this exact resolution before. */
  timesDebated: number;
  lastResult: MemoryResult;
  /** Rolling coaching notes distilled from past rounds on this topic, oldest first. */
  lessons: DebateLesson[];
  updatedAt: number;
}

type MemoryStore = Record<string, Partial<Record<Side, DebaterMemory>>>;

const STORAGE_KEY = "debate-arena-memory-v1";
const MAX_LESSONS_PER_SIDE = 6;

/** Collapse whitespace/case/trailing punctuation so re-typing the same resolution matches. */
export function normalizeTopic(topic: string): string {
  return topic
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "");
}

function loadStore(): MemoryStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MemoryStore) : {};
  } catch {
    return {};
  }
}

function saveStore(store: MemoryStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable/full — memory just won't persist this session */
  }
}

export function getMemory(topic: string, side: Side): DebaterMemory | null {
  const key = normalizeTopic(topic);
  if (!key) return null;
  return loadStore()[key]?.[side] ?? null;
}

function resultFor(scorecard: JudgeScorecard, side: Side): MemoryResult {
  if (scorecard.winner === "tie") return "tie";
  return scorecard.winner === side ? "win" : "loss";
}

/** Pull 1-2 weak criteria (to work on) and the strongest one (to keep) from a scorecard. */
function deriveLessons(scorecard: JudgeScorecard, side: Side): DebateLesson[] {
  const own = scorecard[side];
  const criteria = Object.keys(own.scores) as JudgeCriterion[];
  if (!criteria.length) return [];
  const ranked = [...criteria].sort((a, b) => own.scores[a] - own.scores[b]);
  const strongest = ranked[ranked.length - 1];
  const weakest = ranked.slice(0, 2).filter((c) => c !== strongest || ranked.length === 1);

  const lessons: DebateLesson[] = [];
  for (const c of weakest) {
    const reason = own.reasons[c]?.trim();
    if (reason) lessons.push({ criterion: c, kind: "improve", text: `${c}: ${reason}` });
  }
  const keepReason = own.reasons[strongest]?.trim();
  if (keepReason)
    lessons.push({ criterion: strongest, kind: "keep", text: `${strongest}: ${keepReason}` });
  return lessons;
}

/** Fold a just-finished debate's scorecard into both sides' persisted memory for this topic. */
export function recordDebateMemory(topic: string, scorecard: JudgeScorecard): void {
  const key = normalizeTopic(topic);
  if (!key) return;
  const store = loadStore();
  const forTopic = store[key] ?? {};
  (["alpha", "beta"] as Side[]).forEach((side) => {
    const prev = forTopic[side];
    const merged = [...(prev?.lessons ?? []), ...deriveLessons(scorecard, side)].slice(
      -MAX_LESSONS_PER_SIDE,
    );
    forTopic[side] = {
      timesDebated: (prev?.timesDebated ?? 0) + 1,
      lastResult: resultFor(scorecard, side),
      lessons: merged,
      updatedAt: Date.now(),
    };
  });
  store[key] = forTopic;
  saveStore(store);
}

/** Render a side's memory as a coaching block to append to its system prompt. Empty string if nothing to say. */
export function lessonsPromptBlock(memory: DebaterMemory | null): string {
  if (!memory || memory.lessons.length === 0) return "";
  const improve = memory.lessons.filter((l) => l.kind === "improve");
  const keep = memory.lessons.filter((l) => l.kind === "keep");
  const times = `${memory.timesDebated} time${memory.timesDebated === 1 ? "" : "s"}`;
  const lines = [
    `You have argued this exact resolution before (${times}, last result: ${memory.lastResult}). Notes from the judge on past rounds:`,
  ];
  if (improve.length) lines.push("Work on:", ...improve.map((l) => `- ${l.text}`));
  if (keep.length) lines.push("Keep doing:", ...keep.map((l) => `- ${l.text}`));
  lines.push(
    "These are coaching notes, not a script or a guarantee — build fresh arguments for this round, just don't repeat the same weaknesses.",
  );
  return lines.join("\n");
}
