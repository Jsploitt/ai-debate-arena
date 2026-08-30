import { describe, expect, it } from "vitest";
import { PRE_ROLL_SECONDS, encodeWavPcm16, padChannels, withLeadingSilence } from "./audioPad";

describe("padChannels", () => {
  it("prepends the right number of silent frames and keeps the samples", () => {
    const [padded] = padChannels([new Float32Array([0.5, -0.5, 1])], 1000, 0.35);
    expect(padded.length).toBe(350 + 3);
    expect(Array.from(padded.slice(0, 350)).every((s) => s === 0)).toBe(true);
    expect(Array.from(padded.slice(350))).toEqual([0.5, -0.5, 1]);
  });

  it("pads every channel independently", () => {
    const padded = padChannels([new Float32Array([0.1]), new Float32Array([0.2])], 100, 0.5);
    expect(padded).toHaveLength(2);
    expect(padded[0].length).toBe(51);
    expect(padded[1].length).toBe(51);
    expect(padded[0][50]).toBeCloseTo(0.1);
    expect(padded[1][50]).toBeCloseTo(0.2);
  });

  it("rounds the pad length to whole frames", () => {
    const [padded] = padChannels([new Float32Array(0)], 24000, PRE_ROLL_SECONDS);
    expect(padded.length).toBe(Math.round(24000 * PRE_ROLL_SECONDS));
  });
});

describe("encodeWavPcm16", () => {
  const header = (buf: ArrayBuffer) => {
    const view = new DataView(buf);
    const tag = (offset: number) =>
      String.fromCharCode(...new Uint8Array(buf.slice(offset, offset + 4)));
    return {
      riff: tag(0),
      wave: tag(8),
      fmt: tag(12),
      format: view.getUint16(20, true),
      channels: view.getUint16(22, true),
      sampleRate: view.getUint32(24, true),
      byteRate: view.getUint32(28, true),
      blockAlign: view.getUint16(32, true),
      bitsPerSample: view.getUint16(34, true),
      data: tag(36),
      dataSize: view.getUint32(40, true),
    };
  };

  it("writes a valid mono 16-bit PCM header", () => {
    const buf = encodeWavPcm16([new Float32Array([0, 0.5])], 24000);
    expect(header(buf)).toEqual({
      riff: "RIFF",
      wave: "WAVE",
      fmt: "fmt ",
      format: 1,
      channels: 1,
      sampleRate: 24000,
      byteRate: 48000,
      blockAlign: 2,
      bitsPerSample: 16,
      data: "data",
      dataSize: 4,
    });
    expect(buf.byteLength).toBe(44 + 4);
  });

  it("encodes full-scale samples and clamps out-of-range values", () => {
    const buf = encodeWavPcm16([new Float32Array([0, 1, -1, 2, -2])], 8000);
    const view = new DataView(buf);
    const samples = [0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true));
    expect(samples).toEqual([0, 0x7fff, -0x8000, 0x7fff, -0x8000]);
  });

  it("interleaves stereo channels frame by frame", () => {
    const buf = encodeWavPcm16([new Float32Array([1, 1]), new Float32Array([-1, -1])], 8000);
    expect(header(buf).channels).toBe(2);
    expect(header(buf).blockAlign).toBe(4);
    const view = new DataView(buf);
    const samples = [0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true));
    expect(samples).toEqual([0x7fff, -0x8000, 0x7fff, -0x8000]);
  });
});

describe("withLeadingSilence", () => {
  it("returns the original blob unpadded where WebAudio is unavailable", async () => {
    // The node test environment has no OfflineAudioContext, so this exercises
    // the no-WebAudio guard. The in-browser decode-failure catch degrades the
    // same way but is not reachable from this environment.
    const original = new Blob(["not audio"], { type: "audio/wav" });
    const result = await withLeadingSilence(original);
    expect(result.blob).toBe(original);
    expect(result.padSeconds).toBe(0);
  });
});
