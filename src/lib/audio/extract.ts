/** Client-side audio prep: decode the video's audio track, resample to 16 kHz
 *  mono, split it into speech-friendly chunks and encode each chunk as WAV. */

export type AudioChunk = {
  index: number;
  start: number;
  end: number;
  /** first/last moment with meaningful energy inside the chunk (absolute seconds) */
  speechStart: number;
  speechEnd: number;
  /** raw per-frame RMS energy across the speech window */
  energy: Float32Array;
  /** duration of one energy frame, in seconds */
  frameDur: number;
  blob: Blob;
};

const TARGET_RATE = 16000;


export async function decodeToMono16k(file: File | Blob): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();
  const AC: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const tmp = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await tmp.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    void tmp.close();
  }
  const length = Math.ceil((decoded.duration * TARGET_RATE) | 0) || 1;
  const offline = new OfflineAudioContext(1, length, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

function rms(samples: Float32Array, from: number, to: number) {
  let sum = 0;
  const a = Math.max(0, from);
  const b = Math.min(samples.length, to);
  for (let i = a; i < b; i++) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, b - a));
}

/** Split at the quietest point inside a window so words are never cut in half. */
export function planChunks(
  samples: Float32Array,
  opts: { min?: number; target?: number; max?: number } = {},
) {
  const min = (opts.min ?? 10) * TARGET_RATE;
  const target = (opts.target ?? 20) * TARGET_RATE;
  const max = (opts.max ?? 26) * TARGET_RATE;
  const win = Math.round(0.03 * TARGET_RATE);
  const bounds: number[] = [0];
  let pos = 0;
  while (samples.length - pos > max) {
    let bestIdx = pos + target;
    let bestVal = Infinity;
    for (let i = pos + min; i < pos + max; i += win) {
      const v = rms(samples, i, i + win);
      if (v < bestVal) {
        bestVal = v;
        bestIdx = i;
      }
    }
    bounds.push(bestIdx);
    pos = bestIdx;
  }
  bounds.push(samples.length);
  return bounds;
}

export function encodeWav(samples: Float32Array, sampleRate = TARGET_RATE): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function buildAudioChunks(file: File | Blob): Promise<AudioChunk[]> {
  const samples = await decodeToMono16k(file);
  // Keep the transcript window short enough that a change in speaking rate
  // cannot accumulate into a multi-word drift. Boundaries still land at the
  // quietest point, so requests do not cut through words.
  const bounds = planChunks(samples, { min: 5, target: 8, max: 11 });
  const chunks: AudioChunk[] = [];
  const win = Math.round(0.03 * TARGET_RATE);
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i] ?? 0;
    const b = bounds[i + 1] ?? samples.length;
    const slice = samples.slice(a, b);
    // A file-wide threshold over-trims quiet sections after a loud section.
    // Adapt trimming to this chunk so every phrase keeps its real onset.
    const trimGate = Math.max(0.001, rms(slice, 0, slice.length) * 0.08);
    // trim silence for better word timing
    let s = 0;
    let e = slice.length;
    while (s < slice.length && rms(slice, s, s + win) < trimGate) s += win;
    while (e > s + win && rms(slice, e - win, e) < trimGate) e -= win;
    if (s >= e) {
      s = 0;
      e = slice.length;
    }
    // Keep raw RMS here. A global gate is unreliable when clips have music or
    // changing volume; timing applies an adaptive per-chunk noise floor later.
    const frames = Math.max(1, Math.ceil((e - s) / win));
    const energy = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      const v = rms(slice, s + f * win, s + (f + 1) * win);
      energy[f] = v;
    }

    chunks.push({
      index: i,
      start: a / TARGET_RATE,
      end: b / TARGET_RATE,
      speechStart: (a + s) / TARGET_RATE,
      speechEnd: (a + e) / TARGET_RATE,
      energy,
      frameDur: win / TARGET_RATE,
      blob: encodeWav(slice),
    });
  }
  return chunks;
}

