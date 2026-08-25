import { describe, expect, it } from "vitest";

import {
  CHARACTERS,
  CHARACTER_LIST,
  castSelectionPatch,
  characterById,
  characterPatchOf,
  isCharacterModified,
  randomCast,
  slotArt,
} from "./characters";
import type { ArenaSettings, DebaterConfig } from "./debate/types";

function debaterConfig(overrides: Partial<DebaterConfig> = {}): DebaterConfig {
  return {
    name: "Custom",
    endpoint: "http://localhost:11434",
    model: "llama3",
    temperature: 0.7,
    topP: 0.9,
    systemPrompt: "Be helpful.",
    thinkingLevel: 0,
    tonePreset: "Custom",
    characterId: null,
    ...overrides,
  };
}

function arenaSettings(overrides: Partial<ArenaSettings> = {}): ArenaSettings {
  return {
    alpha: debaterConfig(),
    beta: debaterConfig({ name: "Other" }),
    rounds: 4,
    mode: "auto",
    contextWindow: 4096,
    judge: {
      enabled: true,
      endpoint: "",
      model: "judge",
      temperature: 0.2,
      systemPrompt: "",
      weights: { Logic: 1, Evidence: 1, Rebuttal: 1, Clarity: 1, Persuasion: 1 },
      scale: 10,
      tieThreshold: 0.4,
      rules: "",
    },
    language: "en",
    tts: { enabled: false, endpointEn: "" },
    ...overrides,
  } as ArenaSettings;
}

describe("characterById", () => {
  it("resolves a known id", () => {
    expect(characterById("fahad")?.id).toBe("fahad");
  });

  it("returns null for null, undefined and unknown ids", () => {
    expect(characterById(null)).toBeNull();
    expect(characterById(undefined)).toBeNull();
    expect(characterById("nobody")).toBeNull();
  });
});

describe("randomCast", () => {
  it("always draws two distinct, valid character ids", () => {
    const ids = new Set(CHARACTER_LIST.map((c) => c.id));
    for (let i = 0; i < 200; i++) {
      const [a, b] = randomCast();
      expect(a).not.toBe(b);
      expect(ids.has(a)).toBe(true);
      expect(ids.has(b)).toBe(true);
    }
  });
});

describe("slotArt", () => {
  it("falls back to the default side art when no character is selected", () => {
    const { flip } = slotArt(debaterConfig({ characterId: null }), "alpha");
    expect(flip).toBe(false);
  });

  it("does not flip a character already facing its native side", () => {
    // fahad's nativeSide is "left", which is alpha's position.
    const { flip } = slotArt(debaterConfig({ characterId: "fahad" }), "alpha");
    expect(flip).toBe(false);
  });

  it("flips a character placed on the opposite side from its native art", () => {
    // fahad is native "left"; placing him at beta ("right") should flip.
    const { flip } = slotArt(debaterConfig({ characterId: "fahad" }), "beta");
    expect(flip).toBe(true);
  });
});

describe("characterPatchOf", () => {
  it("extracts only the personality fields, not model/endpoint", () => {
    const config = debaterConfig({ name: "Fahad", temperature: 1.1 });
    const patch = characterPatchOf(config);
    expect(patch).toEqual({
      name: "Fahad",
      systemPrompt: config.systemPrompt,
      tonePreset: config.tonePreset,
      temperature: 1.1,
      topP: config.topP,
      thinkingLevel: config.thinkingLevel,
      voice: config.voice,
    });
    expect(patch).not.toHaveProperty("model");
    expect(patch).not.toHaveProperty("endpoint");
  });
});

describe("isCharacterModified", () => {
  it("is false for an unselected slot", () => {
    expect(isCharacterModified(debaterConfig({ characterId: null }))).toBe(false);
  });

  it("is false when the config still matches the character's preset exactly", () => {
    const config = { ...debaterConfig(), ...CHARACTERS.fahad.patch, characterId: "fahad" as const };
    expect(isCharacterModified(config)).toBe(false);
  });

  it("is true once any preset field has been hand-tuned", () => {
    const config = {
      ...debaterConfig(),
      ...CHARACTERS.fahad.patch,
      characterId: "fahad" as const,
      temperature: 0.2,
    };
    expect(isCharacterModified(config)).toBe(true);
  });
});

describe("castSelectionPatch", () => {
  it("clears the slot's character on a null selection", () => {
    const settings = arenaSettings({ alpha: debaterConfig({ characterId: "fahad" }) });
    const patch = castSelectionPatch(settings, "alpha", null);
    expect(patch.alpha?.characterId).toBeNull();
  });

  it("seats a fresh character in an unoccupied slot", () => {
    const settings = arenaSettings();
    const patch = castSelectionPatch(settings, "alpha", "noura");
    expect(patch.alpha?.characterId).toBe("noura");
    expect(patch.alpha?.name).toBe(CHARACTERS.noura.patch.name);
    expect(patch.beta).toBeUndefined();
  });

  it("swaps the two slots when the character is already seated on the other side", () => {
    const settings = arenaSettings({
      alpha: debaterConfig({ characterId: "fahad", ...CHARACTERS.fahad.patch }),
      beta: debaterConfig({ characterId: "noura", ...CHARACTERS.noura.patch, name: "Noura" }),
    });
    const patch = castSelectionPatch(settings, "alpha", "noura");
    expect(patch.alpha?.characterId).toBe("noura");
    expect(patch.beta?.characterId).toBe("fahad");
    // The personality that used to be on alpha (fahad's) now lives on beta.
    expect(patch.beta?.name).toBe(CHARACTERS.fahad.patch.name);
  });
});
