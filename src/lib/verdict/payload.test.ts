import { describe, expect, it } from "vitest";

import { briefUrl, decodeBriefPayload, encodeBriefPayload, type BriefPayload } from "./payload";

function payload(overrides: Partial<BriefPayload> = {}): BriefPayload {
  return {
    facts: {
      personaId: "cfo",
      topic: "Should we automate support?",
      winnerName: "Alpha Model",
      winnerTag: "FOR",
      scores: { Logic: 8, Evidence: 9, Rebuttal: 7, Clarity: 6, Persuasion: 5 },
      scale: 10,
    },
    fields: {
      next: ["Kick off the pilot.", "", "", ""],
      reasons: ["Strong case.", "", "", ""],
      watch: ["Budget risk.", "", "", ""],
      verdict: "Approve a contained spend.",
    },
    ...overrides,
  };
}

describe("encodeBriefPayload / decodeBriefPayload", () => {
  it("round-trips a full payload byte-for-byte", async () => {
    const original = payload();
    const encoded = await encodeBriefPayload(original);
    const decoded = await decodeBriefPayload(encoded);
    expect(decoded).toEqual(original);
  });

  it("round-trips a payload with null fields", async () => {
    const original = payload({ fields: null });
    const encoded = await encodeBriefPayload(original);
    const decoded = await decodeBriefPayload(encoded);
    expect(decoded).toEqual(original);
  });

  it("produces a URL-safe string with a compression marker prefix", async () => {
    const encoded = await encodeBriefPayload(payload());
    expect(encoded[0]).toMatch(/[zu]/);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("handles non-ASCII prose (Arabic) without corruption", async () => {
    const original = payload({
      fields: {
        next: ["ابدأ التجربة.", "", "", ""],
        reasons: ["حجة قوية.", "", "", ""],
        watch: ["", "", "", ""],
        verdict: "وافق على إنفاق محدود.",
      },
    });
    const encoded = await encodeBriefPayload(original);
    const decoded = await decodeBriefPayload(encoded);
    expect(decoded).toEqual(original);
  });

  it("returns null for garbage input instead of throwing", async () => {
    await expect(decodeBriefPayload("not-a-valid-payload!!!")).resolves.toBeNull();
  });

  it("returns null when facts is missing or malformed", async () => {
    const json = JSON.stringify({ fields: null });
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const b64url = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await expect(decodeBriefPayload(`u${b64url}`)).resolves.toBeNull();
  });

  it("drops fields that fail the brief schema on decode rather than throwing", async () => {
    const json = JSON.stringify({
      facts: payload().facts,
      fields: { next: "not-an-array", reasons: [], watch: [], verdict: 1 },
    });
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const b64url = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const decoded = await decodeBriefPayload(`u${b64url}`);
    expect(decoded).not.toBeNull();
    expect(decoded!.fields).toBeNull();
  });
});

describe("briefUrl", () => {
  it("builds a /brief route URL with the payload in the fragment", () => {
    expect(briefUrl("https://arena.example", "zABC123")).toBe(
      "https://arena.example/brief#zABC123",
    );
  });
});
