/**
 * The one place a debate turn's visible words are decided.
 *
 * Models leak. Over this project we have seen, on stage and in the voice
 * queue: `<think>` blocks, `<think>` closed with a stray `>`, `<think>` never
 * closed at all, `[Thinking: …]` prose preambles, "Okay, the user wants me
 * to…" planning, and a turn signing off with "(47 words)". Each was patched
 * with a new pattern, and each time a new shape appeared.
 *
 * The permanent answer is not a better filter, it is to stop the model from
 * being *able* to emit anything but the argument. Debate turns are requested
 * with Ollama's constrained decoding against `TURN_SCHEMA`, so the grammar
 * itself only permits `{"argument": "…"}` — a preamble or a trailing note has
 * nowhere to go. `readArgument` below turns that JSON back into plain text
 * while it is still arriving, so the stage keeps streaming word by word.
 *
 * The pattern-based `stripMeta` remains, but as a second line rather than the
 * first: it catches meta the model writes *inside* the argument string, which
 * no schema can prevent.
 */

/** Constrained-decoding schema for one spoken turn. */
export const TURN_SCHEMA = {
  type: "object",
  properties: { argument: { type: "string" } },
  required: ["argument"],
} as const;

/**
 * Pull the in-progress `argument` value out of partial JSON.
 *
 * Called on every chunk, against text that is usually incomplete — anything
 * from `{ "argu` to the closed object. Returns the words decoded so far, so
 * the audience sees the turn build up rather than appear all at once.
 */
export function readArgument(raw: string): string {
  const key = raw.indexOf('"argument"');
  if (key === -1) return "";

  // Find the opening quote of the value, after the key and its colon.
  const colon = raw.indexOf(":", key + 10);
  if (colon === -1) return "";
  let i = colon + 1;
  while (i < raw.length && /\s/.test(raw[i])) i++;
  if (raw[i] !== '"') return "";
  i++;

  let out = "";
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\") {
      const next = raw[i + 1];
      // A trailing backslash means the escape is still arriving; stop here
      // rather than emitting a stray character that the next chunk rewrites.
      if (next === undefined) break;
      const simple: Record<string, string> = {
        '"': '"',
        "\\": "\\",
        "/": "/",
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
      };
      if (next === "u") {
        if (i + 5 >= raw.length) break;
        out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      out += simple[next] ?? next;
      i += 2;
      continue;
    }
    if (ch === '"') break; // value closed
    out += ch;
    i++;
  }
  return out;
}

/**
 * Strip meta the model wrote *inside* its own argument.
 *
 * Constrained decoding cannot stop this — `"(47 words)"` is a perfectly legal
 * string. Kept deliberately narrow: only trailing self-annotation, so an
 * ordinary parenthetical mid-sentence survives untouched.
 */
export function stripMeta(text: string): string {
  return text
    .replace(/\s*[([]\s*(?:approx\.?\s*)?\d+\s*words?\s*[)\]]\s*$/i, "")
    .replace(/\s*[([]\s*word count[^)\]]*[)\]]\s*$/i, "")
    .replace(/\s*\[(?:thinking|reasoning|note)[^\]]*\]\s*$/i, "")
    .trimEnd();
}

/** Everything the stage, the voice queue and the judge should ever see. */
export function spokenText(rawJson: string): string {
  return stripMeta(readArgument(rawJson));
}
