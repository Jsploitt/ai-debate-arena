/**
 * Leading-silence pre-roll for spoken turns.
 *
 * The first word of a debate kept getting swallowed: a TTS clip starts
 * speaking at t=0, but an idle audio sink (PipeWire/PulseAudio
 * suspend-on-idle, Bluetooth wake-up, HDMI receivers) takes a few hundred
 * milliseconds to resume after silence, and whatever plays during that
 * ramp-up never reaches the speaker. The very first turn after page load is
 * always played against a suspended sink, so its opening word was inaudible.
 *
 * The fix is done to the audio itself, not with timers: decode the clip,
 * prepend a short silent pre-roll, and hand playback a WAV in which the
 * speech only begins after the sink has had time to wake. Every turn gets the
 * pre-roll — mid-debate gaps (a slow model, a long judge pass) can suspend
 * the sink again — and as a side effect each speaker gets a natural beat
 * before they begin.
 */

/**
 * How much silence to prepend to each clip. Kokoro already leads with about
 * a third of a second of natural silence and the first word was still being
 * swallowed on this hardware, so the pre-roll has to assume a slow sink
 * (HDMI/DisplayPort receivers can take most of a second to unmute).
 */
export const PRE_ROLL_SECONDS = 0.5;

/** Prepend `seconds` of silence to each channel of raw PCM float samples. */
export function padChannels(
  channels: Float32Array[],
  sampleRate: number,
  seconds: number,
): Float32Array[] {
  const padFrames = Math.round(sampleRate * seconds);
  return channels.map((samples) => {
    const out = new Float32Array(padFrames + samples.length);
    out.set(samples, padFrames);
    return out;
  });
}

/** Encode float channels ([-1, 1], one array per channel) as 16-bit PCM WAV. */
export function encodeWavPcm16(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = Math.max(1, channels.length);
  const frames = channels[0]?.length ?? 0;
  const blockAlign = numChannels * 2;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch]?.[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return buffer;
}

/**
 * Decode an audio blob and return it as a WAV with a silent pre-roll.
 *
 * Browser-only (WebAudio); on the server or on any decode failure the
 * original blob comes back with `padSeconds: 0`, so playback degrades to
 * exactly the old behaviour rather than losing the turn. `padSeconds` tells
 * the caller how much of the clip is silence, so the voice-synced text
 * reveal can keep tracking the actual speech.
 */
export async function withLeadingSilence(
  blob: Blob,
  seconds: number = PRE_ROLL_SECONDS,
): Promise<{ blob: Blob; padSeconds: number }> {
  if (typeof window === "undefined" || typeof OfflineAudioContext === "undefined") {
    return { blob, padSeconds: 0 };
  }
  try {
    // Offline context: decoding must not touch the output device (that is the
    // whole point) and is exempt from autoplay policy.
    const decoder = new OfflineAudioContext(1, 1, 44100);
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      channels.push(decoded.getChannelData(ch));
    }
    const padded = padChannels(channels, decoded.sampleRate, seconds);
    return {
      blob: new Blob([encodeWavPcm16(padded, decoded.sampleRate)], { type: "audio/wav" }),
      padSeconds: seconds,
    };
  } catch {
    return { blob, padSeconds: 0 };
  }
}
