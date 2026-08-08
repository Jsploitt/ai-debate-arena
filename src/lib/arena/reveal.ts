/** Reveal whole words only (never cuts mid-word) up to the given fraction. */
export function revealWords(text: string, fraction: number): string {
  if (fraction >= 1) return text;
  if (fraction <= 0) return "";
  const tokens = text.split(/(\s+)/);
  const wordCount = tokens.filter((t) => t.trim()).length;
  const targetWords = Math.floor(wordCount * fraction);
  let seen = 0;
  let out = "";
  for (const token of tokens) {
    if (token.trim()) {
      if (seen >= targetWords) break;
      seen++;
    }
    out += token;
  }
  return out;
}
