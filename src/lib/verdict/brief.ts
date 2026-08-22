/**
 * The winner's executive brief.
 *
 * After the judge returns a final scorecard, the *winning debater's own model*
 * fills one of four HTML templates — one per judge persona. The result is a
 * self-contained document that differs with every debate and every winner.
 *
 * Two rules shape everything here:
 *
 * 1. **Every number on the page is real.** The score bars are the judge's own
 *    per-criterion scores for the winning side, and the topic, winner name and
 *    persona come from the live scorecard. The model never supplies a figure.
 * 2. **The model never asserts a world fact.** Debaters routinely invent
 *    statistics mid-argument ("Stanford, 2023"), so the transcript is not a
 *    source of truth. The prompt therefore bans numbers, dates, named studies,
 *    companies and people outright, and asks for a qualitative account of what
 *    was argued. That is what keeps the brief defensible in front of a room.
 */

import { z } from "zod";

import { streamChat } from "../debate/ollamaClient";
import { CRITERIA, PERSONAS, type Persona, type PersonaId } from "../personas";
import type {
  ChatMessage,
  DebateLanguage,
  DebateMessage,
  DebaterConfig,
  JudgeCriterion,
  JudgeScorecard,
  Side,
} from "../debate/types";

import ceoTemplate from "./templates/ceo.html?raw";
import cfoTemplate from "./templates/cfo.html?raw";
import cmoTemplate from "./templates/cmo.html?raw";
import ctoTemplate from "./templates/cto.html?raw";

const TEMPLATES: Record<PersonaId, string> = {
  ceo: ceoTemplate,
  cfo: cfoTemplate,
  cmo: cmoTemplate,
  cto: ctoTemplate,
};

/**
 * The twelve prose fields a template exposes. Everything else is real data.
 *
 * Lengths are normalised rather than required. A model that returns three
 * bullets instead of four is common and entirely recoverable — insisting on
 * exactly four threw away eleven good fields over one missing bullet, and the
 * whole document fell back to its generic wording.
 */
const slots = z
  .array(z.unknown())
  .transform((items) =>
    Array.from({ length: 4 }, (_, i) => (typeof items[i] === "string" ? (items[i] as string) : "")),
  );

export const briefFieldsSchema = z.object({
  next: slots,
  reasons: slots,
  watch: slots,
  verdict: z.string().catch(""),
});

export type BriefFields = z.infer<typeof briefFieldsSchema>;

/**
 * Per-persona guidance for each slot, lifted from the placeholder text the
 * templates shipped with.
 *
 * Three originals asked for a calendar date ("Key milestone or check-in date").
 * Those are reworded as checkpoints: a date would be invented, and an invented
 * date is exactly the kind of detail that gets corrected from the audience.
 */
const HINTS: Record<PersonaId, { next: string[]; reasons: string[]; watch: string[] }> = {
  ceo: {
    next: [
      "the first step to greenlight and kick off execution",
      "the kind of team or function that should own delivery",
      "the milestone that marks real progress (a checkpoint, never a date)",
      "the signal that would trigger a strategy review",
    ],
    reasons: [
      "the long-term strategic upside of this proposal",
      "how it strengthens the competitive position",
      "the nature of the risk taken, and why it is justified",
      "its effect on the organisation's execution capacity",
    ],
    watch: [
      "the impact on board and shareholder decisions",
      "whether company-wide priorities need reshuffling",
      "how long strategic results realistically take to appear",
      "the alignment needed across department heads before rollout",
    ],
  },
  cfo: {
    next: [
      "the budget approval or funding step required first",
      "the financial milestone to hit before scaling further",
      "the metric to track spend against, and how often",
      "the point at which the plan gets re-evaluated",
    ],
    reasons: [
      "the strongest financial case and expected return",
      "how financial risk was addressed",
      "why it beats the alternative on return and cost",
      "its effect on near-term cash flow",
    ],
    watch: [
      "whether additional funding or budget reallocation is needed",
      "the financial assumptions that should be verified before approval",
      "the best timing for execution given liquidity",
      "any tax or reporting implications to flag early",
    ],
  },
  cmo: {
    next: [
      "the first campaign or content piece to launch",
      "the channel and audience to test with first",
      "the trigger for the first public touchpoint (a readiness condition, never a date)",
      "the signal that means it is time to scale up",
    ],
    reasons: [
      "why it lands directly with the target audience",
      "the expected benefit to the brand's story",
      "the growth and reach opportunity it unlocks",
      "how it stands out from what competitors offer",
    ],
    watch: [
      "the best channels for launch and the priority audience",
      "the metrics that will measure campaign success",
      "any brand perception risk that should be monitored",
      "timing relative to competitor campaigns or events",
    ],
  },
  cto: {
    next: [
      "the first build or setup task to start with",
      "the kind of team or engineer that should own implementation",
      "what a first working version has to demonstrate (a condition, never a date)",
      "the check needed before wider rollout",
    ],
    reasons: [
      "the soundness of the technical approach and architecture",
      "how scalability and reliability concerns were handled",
      "why it is the lowest-risk, most maintainable path",
      "how well it fits the current systems and stack",
    ],
    watch: [
      "the engineering effort realistically required to implement",
      "any dependency on external tools or vendors",
      "the testing and monitoring plan after launch",
      "the rollback plan if issues surface post-launch",
    ],
  },
};

/**
 * The four criteria whose scores drive the bars, heaviest weight first.
 *
 * Taking the persona's own top four means a CFO brief is bar-charted on
 * Evidence and a CTO brief on Logic, matching what each judge actually
 * weighted the debate on.
 */
export function barCriteria(persona: Persona): JudgeCriterion[] {
  return [...CRITERIA]
    .map((c) => c.key)
    .sort((a, b) => (persona.weights[b] ?? 0) - (persona.weights[a] ?? 0))
    .slice(0, 4);
}

function criterionLabelOf(key: JudgeCriterion): string {
  return CRITERIA.find((c) => c.key === key)?.label ?? key;
}

/**
 * Turn a slot hint into wording that can stand in the document itself.
 *
 * The hints are written to instruct the model, so they carry a leading article
 * and the occasional aside to it. Dropping both leaves a serviceable noun
 * phrase — which is what a checklist bullet is anyway.
 */
function asFallback(hint: string): string {
  const clean = hint
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/^(the|a|an)\s+/i, "")
    .trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** The side whose model writes the brief. A draw is written by the pro side. */
export function briefAuthorSide(scorecard: JudgeScorecard): Side {
  return scorecard.winner === "beta" ? "beta" : "alpha";
}

const BAN = [
  "Never write a number in ANY form — not as digits, not spelled out in words, not as a percentage, currency amount, duration, multiple or date.",
  "Do NOT name any real or invented company, product, country, institution, study, report or person.",
  "Do NOT repeat statistics or citations that appeared in the debate — debaters invent them, and repeating one as fact is how this document gets contradicted in the room.",
  "Write about what was argued and what should happen next, in plain qualitative terms.",
].join("\n");

const NUMERALS =
  "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|half|double|triple|dozen";

const QUANTIFIED =
  "percent|per cent|point|times|fold|x|month|months|week|weeks|day|days|year|years|quarter|quarters|dollar|dollars|riyal|riyals|euro|euros|basis|bps";

/**
 * Detect a figure the model invented.
 *
 * Two passes, because a bare instruction is not enough: asked for no digits,
 * a model will write "five point three times return" instead. Digits, percent
 * signs and currency marks are rejected outright; a spelled-out numeral is
 * rejected when a unit follows it closely, which is what turns a word into a
 * claim. Plain "one of the strongest" survives, and should.
 */
export function hasFabricatedNumber(text: string): boolean {
  if (/[0-9%$£€¥₹﷼]/.test(text)) return true;
  return new RegExp(`\\b(?:${NUMERALS})\\b(?:\\s+\\w+){0,2}\\s+\\b(?:${QUANTIFIED})\\b`, "i").test(
    text,
  );
}

/** Every field that still carries an invented figure. */
export function fabricatedFields(fields: BriefFields): string[] {
  return [...fields.next, ...fields.reasons, ...fields.watch, fields.verdict].filter(
    hasFabricatedNumber,
  );
}

export function buildBriefMessages({
  persona,
  topic,
  scorecard,
  authorSide,
  names,
  messages,
  language = "en",
}: {
  persona: Persona;
  topic: string;
  scorecard: JudgeScorecard;
  authorSide: Side;
  names: Record<Side, string>;
  messages: DebateMessage[];
  language?: DebateLanguage;
}): ChatMessage[] {
  const hints = HINTS[persona.id];
  const stance = authorSide === "alpha" ? "FOR" : "AGAINST";
  const own = messages
    .filter((m) => m.side === authorSide)
    .map((m) => `[Round ${m.round}] ${m.content}`)
    .join("\n\n");
  const other = messages
    .filter((m) => m.side !== authorSide)
    .map((m) => `[Round ${m.round}] ${m.content}`)
    .join("\n\n");

  const languageNote =
    language === "ar"
      ? "\n\nاكتب كل قيم JSON باللغة العربية الفصحى. حافظ على مفاتيح JSON بالإنجليزية كما هي."
      : "";

  const slots = [
    ...hints.next.map((h, i) => `"next"[${i}] — ${h}`),
    ...hints.reasons.map((h, i) => `"reasons"[${i}] — ${h}`),
    ...hints.watch.map((h, i) => `"watch"[${i}] — ${h}`),
    `"verdict" — one sentence in the ${persona.name}'s voice, closing the decision`,
  ].join("\n");

  return [
    {
      role: "system",
      content: [
        `You won a live debate and are now writing the ${persona.doc} that goes on screen behind you.`,
        `It is read by a ${persona.name}, whose concerns are: ${persona.docFraming}. ${persona.personality}`,
        "",
        "Rules — every one of these is load-bearing:",
        BAN,
        "Each field is one short sentence of at most 12 words — they are rendered on a slide and a longer line is cut off. No bullet markers, no headings, no quotation marks.",
        "Respond with a single JSON object and nothing else.",
        languageNote,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      role: "user",
      content: [
        `Resolution: "${topic}"`,
        `You are ${names[authorSide]}, and you argued ${stance} the resolution. The judge ruled in your favour.`,
        "",
        "What you argued:",
        own || "(no turns recorded)",
        "",
        "What your opponent argued:",
        other || "(no turns recorded)",
        "",
        `The judge's closing line was: "${scorecard.verdict}"`,
        "",
        "Fill exactly these slots:",
        slots,
        "",
        'Return JSON of the shape {"next":[4 strings],"reasons":[4 strings],"watch":[4 strings],"verdict":"string"}.',
      ].join("\n"),
    },
  ];
}

/**
 * Every balanced `{…}` block in a model response, outermost first.
 *
 * Taking only the first one loses whenever the model reasons out loud before
 * answering and its reasoning happens to contain a brace — the parse then
 * locks onto a fragment of the scratchpad and the real object right after it
 * is never examined. Two of five live runs failed exactly that way.
 */
export function extractJsonObjects(raw: string): unknown[] {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const found: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          found.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          // Not valid on its own; a later block may still be.
        }
        start = -1;
      }
    }
  }
  return found;
}

/** True when at least one slot actually carries text. */
function hasContent(fields: BriefFields): boolean {
  return [...fields.next, ...fields.reasons, ...fields.watch, fields.verdict].some(
    (value) => value.trim().length > 0,
  );
}

export function parseBriefFields(raw: string): BriefFields | null {
  for (const candidate of extractJsonObjects(raw)) {
    const parsed = briefFieldsSchema.safeParse(candidate);
    if (parsed.success && hasContent(parsed.data)) return parsed.data;
  }
  return null;
}

/**
 * Ollama structured-outputs schema for the brief. Constrained decoding is what
 * actually makes local models fill the template: prompt-only JSON held up so
 * poorly on the arena's models that the brief usually fell back to its generic
 * wording. Endpoints that do not understand `format` ignore it, and the
 * prompt + parse + retry chain below still stands for those.
 */
const BRIEF_FORMAT = {
  type: "object",
  properties: {
    next: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
    reasons: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
    watch: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
    verdict: { type: "string" },
  },
  required: ["next", "reasons", "watch", "verdict"],
} as const;

/**
 * The brief is filled at a fixed moderate temperature rather than the
 * debater's own. A character tuned hot for the stage (Fahad runs at 1.1)
 * drifts out of any structured format; the brief needs the character's voice
 * from the prompt, not the character's sampling.
 */
const BRIEF_TEMPERATURE = 0.4;

async function attemptFill(
  config: DebaterConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<{ fields: BriefFields | null; raw: string }> {
  let raw = "";
  for await (const chunk of streamChat({ ...config, thinkingLevel: 0 }, messages, signal, {
    format: BRIEF_FORMAT,
    temperature: BRIEF_TEMPERATURE,
  })) {
    raw += chunk.content;
  }
  return { fields: parseBriefFields(raw), raw };
}

/**
 * Ask the winning model for the twelve prose fields, then hold it to the
 * no-figures rule.
 *
 * The rule is enforced three times over, because instructions alone measurably
 * do not hold: the prompt states it, a failed first pass is sent back with the
 * offending lines quoted, and `renderBrief` drops any field that still carries
 * a figure. Nothing invented reaches the screen even if the model never
 * complies.
 */
export async function runBriefFill(
  config: DebaterConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<BriefFields | null> {
  let first = await attemptFill(config, messages, signal);
  if (!first.fields) {
    // One retry on an unparseable response. Local models drop out of JSON
    // often enough that a single failure is not evidence the model cannot do
    // it, and the alternative on screen is the template's generic wording.
    first = await attemptFill(
      config,
      [
        ...messages,
        { role: "assistant", content: first.raw.slice(0, 400) },
        {
          role: "user",
          content:
            "That was not valid JSON. Reply with the JSON object only — no prose before or after it, no code fence, no explanation.",
        },
      ],
      signal,
    );
    if (!first.fields) return null;
  }

  const offenders = fabricatedFields(first.fields);
  if (offenders.length === 0) return first.fields;

  const corrective: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: JSON.stringify(first.fields) },
    {
      role: "user",
      content: [
        "Rejected. These lines state figures you invented:",
        ...offenders.map((line) => `- ${line}`),
        "",
        "Rewrite every field with no number in any form — no digits, no spelled-out numerals, no percentages, no currency, no durations, no multiples.",
        "Say what changes and why it matters, not how much or how long. Return JSON only.",
      ].join("\n"),
    },
  ];

  const second = await attemptFill(config, corrective, signal);
  if (second.fields && fabricatedFields(second.fields).length === 0) return second.fields;
  return second.fields ?? first.fields;
}

/**
 * Brief fields for a simulated verdict.
 *
 * A simulated debate has no model endpoint behind it, so the network fill can
 * only fail — and the failure banner is exactly what a booth demo must never
 * show. The simulation tier therefore extends to the brief the same way it
 * already covers the debaters and the judge: pre-written, persona-specific
 * wording that obeys the same rules the model is prompted with (qualitative,
 * no figures, one short line per slot). Only used when `scorecard.simulated`
 * is set AND the real fill failed, so a reachable model always wins.
 */
export function simulateBriefFields({
  persona,
  scorecard,
  names,
}: {
  persona: Persona;
  scorecard: JudgeScorecard;
  names: Record<Side, string>;
}): BriefFields {
  const author = names[briefAuthorSide(scorecard)];
  const tie = scorecard.winner === "tie";

  const SIM: Record<PersonaId, { next: string[]; reasons: string[]; watch: string[] }> = {
    ceo: {
      next: [
        "Greenlight a limited pilot and name a single accountable owner.",
        "Stand up a small cross-functional team to drive delivery.",
        "Treat the pilot's earliest visible win as the go/no-go checkpoint.",
        "Revisit the strategy if early signals contradict the winning case.",
      ],
      reasons: [
        "The winning side tied the proposal to durable strategic advantage.",
        "It sharpens our position against slower-moving competitors.",
        "The risks raised were acknowledged and answered, not waved away.",
        "Execution demands were framed realistically for the organisation.",
      ],
      watch: [
        "Board alignment before any public commitment.",
        "Whether current priorities must shift to fund this.",
        "Strategic results will take patience; hold the course.",
        "Department heads must be aligned before rollout begins.",
      ],
    },
    cfo: {
      next: [
        "Route the proposal through budget approval before any spend.",
        "Fund a contained pilot before committing further capital.",
        "Track spend against plan on a regular review cadence.",
        "Re-evaluate the case once early returns are visible.",
      ],
      reasons: [
        "The winning argument made the stronger case on expected return.",
        "Financial risk was addressed directly rather than dismissed.",
        "It beats the alternative on cost discipline.",
        "Near-term cash impact was argued to stay manageable.",
      ],
      watch: [
        "Whether existing budgets can absorb this or need reallocation.",
        "The financial assumptions behind the winning case need verification.",
        "Timing of execution against current liquidity.",
        "Any tax or reporting implications should be flagged early.",
      ],
    },
    cmo: {
      next: [
        "Launch a small test campaign with the core audience first.",
        "Pick the channel where the message lands hardest.",
        "Go public once the story and assets are ready.",
        "Scale up when audience response clearly validates the message.",
      ],
      reasons: [
        "The winning side told the story the audience actually cares about.",
        "It strengthens the brand narrative rather than diluting it.",
        "It opens clear room for growth and reach.",
        "It positions us apart from competitor messaging.",
      ],
      watch: [
        "Channel mix and the priority audience for launch.",
        "Which engagement signals will define campaign success.",
        "Brand perception risk while the change beds in.",
        "Timing against competitor campaigns and market moments.",
      ],
    },
    cto: {
      next: [
        "Start with a thin working prototype of the riskiest part.",
        "Assign a senior engineer to own the implementation.",
        "An early version must prove the core assumption end to end.",
        "Review reliability and security before any wider rollout.",
      ],
      reasons: [
        "The winning side argued the sounder technical approach.",
        "Scalability and reliability concerns were answered credibly.",
        "It is the more maintainable, lower-risk path.",
        "It fits the current stack without a disruptive rebuild.",
      ],
      watch: [
        "Real engineering effort tends to exceed the debate's framing.",
        "Dependencies on outside tools or vendors.",
        "Testing and monitoring must be in place at launch.",
        "A rollback path if problems surface after release.",
      ],
    },
  };

  const VERDICT: Record<PersonaId, { win: string; tie: string }> = {
    ceo: {
      win: `${author} made the sharper case — proceed, and hold the pace.`,
      tie: "Neither side separated — proceed only with a reversible pilot step.",
    },
    cfo: {
      win: `${author} carried the financial question — approve a contained spend.`,
      tie: "The financial case is unresolved — fund discovery, not commitment.",
    },
    cmo: {
      win: `${author} told the story that will land — take it to market.`,
      tie: "No side owned the narrative — test both framings with the audience.",
    },
    cto: {
      win: `${author} argued the buildable path — prototype it now.`,
      tie: "Feasibility is still open — spike the risky part before deciding.",
    },
  };

  const pools = SIM[persona.id];
  return {
    next: pools.next,
    reasons: pools.reasons,
    watch: pools.watch,
    verdict: tie ? VERDICT[persona.id].tie : VERDICT[persona.id].win,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Trim a model field to one clean sentence fragment fit for a slide.
 *
 * The last line of defence on figures: a field that still states an invented
 * number is discarded here in favour of the template's own wording, so the
 * document is never wrong even when the model refuses to comply.
 */
function tidy(value: string, fallback: string): string {
  const clean = value
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^\s*[-•*\d.)\]]+\s*/, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean || hasFabricatedNumber(clean)) return fallback;
  return clean;
}

export type BriefFacts = {
  personaId: PersonaId;
  topic: string;
  winnerName: string;
  winnerTag: string;
  /** The winner's own per-criterion scores, used for the bar widths. */
  scores: Partial<Record<JudgeCriterion, number>>;
  scale: number;
  language?: DebateLanguage;
};

/**
 * Substitute real data and the model's prose into a template.
 *
 * Bars are floored at 12% so a genuinely low criterion score still renders as
 * a visible bar rather than reading as a broken element.
 */
export function renderBrief(facts: BriefFacts, fields: BriefFields | null): string {
  const persona = PERSONAS[facts.personaId];
  const hints = HINTS[facts.personaId];
  const criteria = barCriteria(persona);
  const rtl = facts.language === "ar";

  const values: Record<string, string> = {
    lang: rtl ? "ar" : "en",
    dir: rtl ? "rtl" : "ltr",
    topic: escapeHtml(facts.topic),
    winner: escapeHtml(facts.winnerName),
    winnerTag: escapeHtml(facts.winnerTag),
    verdict: escapeHtml(
      tidy(fields?.verdict ?? "", `The decision turns on ${persona.docFraming}.`),
    ),
  };

  for (let i = 0; i < 4; i++) {
    const criterion = criteria[i];
    const score = facts.scores[criterion];
    const pct = typeof score === "number" && facts.scale > 0 ? (score / facts.scale) * 100 : 0;

    values[`next${i + 1}`] = escapeHtml(tidy(fields?.next?.[i] ?? "", asFallback(hints.next[i])));
    values[`watch${i + 1}`] = escapeHtml(
      tidy(fields?.watch?.[i] ?? "", asFallback(hints.watch[i])),
    );
    // The criterion label is prepended so the bar beneath it is self-explaining:
    // without it, a reader would read the bar as a score for the sentence.
    values[`reason${i + 1}`] =
      `<b>${escapeHtml(criterionLabelOf(criterion))}</b> — ` +
      escapeHtml(tidy(fields?.reasons?.[i] ?? "", asFallback(hints.reasons[i])));
    values[`bar${i + 1}`] = String(Math.round(Math.max(12, Math.min(100, pct))));
  }

  return TEMPLATES[facts.personaId].replace(
    /\{\{(\w+)\}\}/g,
    (match, key: string) => values[key] ?? match,
  );
}

/** Filename for the downloaded brief, e.g. `cfo-verdict-four-day-work-week.html`. */
export function briefFilename(personaId: PersonaId, topic: string): string {
  const slug =
    topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "debate";
  return `${personaId}-verdict-${slug}.html`;
}
