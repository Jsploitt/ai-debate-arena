/** Strip markdown emphasis and collapse whitespace so it isn't read aloud. */
function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*|\*|__|_/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function synthesizeSpeech(
  text: string,
  endpoint: string,
  voice?: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const cleaned = cleanForSpeech(text);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(voice ? { text: cleaned, voice } : { text: cleaned }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`TTS endpoint responded ${res.status} ${res.statusText}`);
  }
  return res.blob();
}
