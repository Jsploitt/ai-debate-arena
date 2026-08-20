/**
 * Brief-in-a-URL encoding, so a phone can open the winner's brief by scanning
 * a code and nothing has to be stored server-side.
 *
 * The rendered document is around 7 KB — far past what a QR code holds. What
 * travels instead is the *data* (real scores plus the twelve prose fields),
 * roughly 1 KB, deflated and base64url'd into the URL fragment. The `/brief`
 * route re-runs `renderBrief` on it, so the phone sees byte-identical output
 * to the stage. A fragment never reaches a server, so the payload stays local.
 */

import { briefFieldsSchema, type BriefFacts, type BriefFields } from "./brief";

export type BriefPayload = { facts: BriefFacts; fields: BriefFields | null };

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function squeeze(bytes: Uint8Array, mode: "deflate-raw"): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream(mode));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function expand(bytes: Uint8Array, mode: "deflate-raw"): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(mode));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * `z` marks a deflated payload, `u` an uncompressed one. The prefix means an
 * old link keeps working if the compression path is ever swapped out, and it
 * gives browsers without CompressionStream a path that still functions.
 */
export async function encodeBriefPayload(payload: BriefPayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === "undefined") return `u${toBase64Url(json)}`;
  try {
    return `z${toBase64Url(await squeeze(json, "deflate-raw"))}`;
  } catch {
    return `u${toBase64Url(json)}`;
  }
}

export async function decodeBriefPayload(encoded: string): Promise<BriefPayload | null> {
  try {
    const marker = encoded[0];
    const body = fromBase64Url(encoded.slice(1));
    const json = marker === "z" ? await expand(body, "deflate-raw") : body;
    const parsed: unknown = JSON.parse(new TextDecoder().decode(json));
    if (!parsed || typeof parsed !== "object") return null;
    const { facts, fields } = parsed as BriefPayload;
    if (!facts || typeof facts.personaId !== "string") return null;
    // Prose is untrusted at this point — it arrived through a URL — so it goes
    // back through the same schema the model output is held to.
    const checked = fields ? briefFieldsSchema.safeParse(fields) : null;
    return { facts, fields: checked?.success ? checked.data : null };
  } catch {
    return null;
  }
}

/** The absolute URL a phone should open to see this brief. */
export function briefUrl(origin: string, encoded: string): string {
  return `${origin}/brief#${encoded}`;
}
