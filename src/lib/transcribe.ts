import { decodeToMono16k } from "@/lib/audio/extract";
import type { CaptionBlock, CaptionWord, TranscriptLanguage } from "@/lib/captions/types";

let uid = 0;
const nextId = () => `w${++uid}`;
const PAUSE = 0.28;

export function groupIntoBlocks(words: CaptionWord[], perBlock: number): CaptionBlock[] {
  const blocks: CaptionBlock[] = [];
  const size = Math.max(1, Math.round(perBlock));
  const groups: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  
  for (const w of words) {
    const prev = current[current.length - 1];
    if (prev && (w.start - prev.end > PAUSE || current.length >= size)) {
      groups.push(current);
      current = [];
    }
    current.push(w);
  }
  if (current.length) groups.push(current);

  for (const slice of groups) {
    const first = slice[0]!;
    const last = slice[slice.length - 1]!;
    const next = words[words.indexOf(last) + 1];
    const hold = Math.min(0.22, next ? Math.max(0, next.start - last.end) : 0.22);
    blocks.push({
      id: `b${first.id}`,
      start: first.start,
      end: Math.max(last.end + hold, first.start + 0.4),
      words: slice,
    });
  }
  return blocks;
}

export function retimeBlockText(block: CaptionBlock, text: string): CaptionWord[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const span = Math.max(0.3, block.end - block.start);
  const weights = tokens.map((t) => Math.max(2, t.length) + 1.4);
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = block.start;
  return tokens.map((t, i) => {
    const dur = (span * (weights[i] ?? 1)) / total;
    const w: CaptionWord = {
      id: nextId(),
      text: t,
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + dur).toFixed(3)),
    };
    cursor += dur;
    return w;
  });
}

export async function generateSubtitles(
  file: File,
  language: TranscriptLanguage,
  onProgress: (value: number, label: string) => void,
): Promise<CaptionWord[]> {
  onProgress(0.05, "Extracting audio track...");
  
  let audioData: Float32Array;
  try {
    audioData = await decodeToMono16k(file);
  } catch (err) {
    console.error("[transcribe] audio decode failed", err);
    throw new Error(
      "Could not read this video's audio. Make sure the clip actually has sound."
    );
  }

  // Normalize audio to full dynamic range — this dramatically improves
  // transcription accuracy for clips with low recording volume.
  let peak = 0;
  for (let i = 0; i < audioData.length; i++) {
    const abs = Math.abs(audioData[i]!);
    if (abs > peak) peak = abs;
  }
  if (peak > 0.001 && peak < 0.95) {
    const gain = 0.95 / peak;
    for (let i = 0; i < audioData.length; i++) {
      audioData[i] = audioData[i]! * gain;
    }
  }

  const MAX_RETRIES = 3;
  let attempt = 0;

  const tryOnce = (): Promise<CaptionWord[]> => new Promise((resolve, reject) => {
    attempt++;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    
    let isTranscribing = false;
    let timedOut = false;
    
    // Timeout: if model doesn't load in 180s (larger model ~150MB), retry
    const loadTimeout = setTimeout(() => {
      timedOut = true;
      worker.terminate();
      reject(new Error("__RETRY__"));
    }, 180_000);
    
    worker.onmessage = (event) => {
      const { type, info, result, error } = event.data;
      
      if (type === "progress") {
        if (!isTranscribing) {
          if (info.status === "progress") {
            onProgress(0.1 + (info.progress / 100) * 0.4, `Loading AI Model (${info.file})… ${Math.round(info.progress)}%`);
          } else {
             onProgress(0.1, `Loading AI Model…`);
          }
        }
      } else if (type === "init_done") {
        clearTimeout(loadTimeout);
        isTranscribing = true;
        onProgress(0.6, "AI Model ready! Transcribing audio…");
        worker.postMessage({
          type: "transcribe",
          payload: { audioData, language },
        });
      } else if (type === "transcribe_done") {
        onProgress(1.0, "Done");
        worker.terminate();
        
        if (!result.chunks || result.chunks.length === 0) {
          reject(new Error("No speech was detected."));
          return;
        }

        const audioDuration = audioData.length / 16000; // 16kHz sample rate
        const rawWords = collectRawWords(result.chunks);
        const words = sanitizeWords(rawWords, audioDuration);
        
        if (words.length === 0) {
          reject(new Error("No speech was detected."));
        } else {
          resolve(words);
        }
      } else if (type === "error") {
        clearTimeout(loadTimeout);
        worker.terminate();
        reject(new Error(`AI Error: ${error}`));
      }
    };
    
    worker.onerror = () => {
      clearTimeout(loadTimeout);
      worker.terminate();
      reject(new Error("__RETRY__"));
    };

    worker.postMessage({ type: "init" });
  });

  // Retry loop
  while (attempt < MAX_RETRIES) {
    try {
      return await tryOnce();
    } catch (err: any) {
      if (err.message === "__RETRY__" && attempt < MAX_RETRIES) {
        onProgress(0.08, `Loading failed, retrying (${attempt}/${MAX_RETRIES})…`);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not load AI model after multiple attempts. Please check your internet and refresh.");
}

function collectRawWords(chunks: any[]): CaptionWord[] {
  const words: CaptionWord[] = [];
  for (const chunk of chunks) {
    if (chunk.timestamp && chunk.timestamp[0] !== null && chunk.timestamp[1] !== null) {
      const text = chunk.text.trim();
      if (text) {
        words.push({
          id: nextId(),
          text,
          start: Number(chunk.timestamp[0].toFixed(3)),
          end: Number(chunk.timestamp[1].toFixed(3)),
        });
      }
    }
  }
  return words;
}

function sanitizeWords(rawWords: CaptionWord[], audioDuration: number): CaptionWord[] {
  if (rawWords.length === 0) return [];

  // 1. Remove duplicate/repeated phrases that whisper sometimes spits out in a loop
  const deduped: CaptionWord[] = [];
  let lastText = "";
  let repeatCount = 0;
  for (const w of rawWords) {
    if (w.text.toLowerCase() === lastText.toLowerCase()) {
      repeatCount++;
      if (repeatCount > 3) continue; // Skip if repeated more than 3 times in a row
    } else {
      lastText = w.text;
      repeatCount = 0;
    }
    deduped.push(w);
  }

  // 2. Fix overlapping words (a word shouldn't start before the previous one ends)
  for (let i = 1; i < deduped.length; i++) {
    if (deduped[i]!.start < deduped[i - 1]!.end) {
      // Push the start time forward
      deduped[i]!.start = deduped[i - 1]!.end;
      // If end time is now behind start time, push it forward too
      if (deduped[i]!.end <= deduped[i]!.start) {
        deduped[i]!.end = deduped[i]!.start + 0.15;
      }
    }
  }

  // 3. Fix negative timestamps and zero-duration words
  for (const w of deduped) {
    if (w.start < 0) w.start = 0;
    if (w.end <= w.start) w.end = w.start + 0.15; // Give it at least 150ms
    if (w.end - w.start > 0.8) w.end = w.start + 0.8; // Max duration 800ms
  }

  // 4. Fix Hallucinated timestamps (jumping past audio duration or massive gaps)
  let breakIdx = -1;
  for (let i = 1; i < deduped.length; i++) {
    const gap = deduped[i]!.start - deduped[i - 1]!.end;
    if (gap > 2.0 || deduped[i]!.start >= audioDuration) {
      breakIdx = i;
      break;
    }
  }

  if (breakIdx > 0) {
    const lastGoodEnd = deduped[breakIdx - 1]!.end;
    const availableTime = Math.max(0.5, audioDuration - lastGoodEnd);
    const badWords = deduped.slice(breakIdx);
    const totalChars = badWords.reduce((s, w) => s + Math.max(1, w.text.length), 0);

    let cursor = lastGoodEnd + 0.05;
    for (const w of badWords) {
      const fraction = Math.max(1, w.text.length) / totalChars;
      const dur = Math.min(0.8, availableTime * fraction * 0.9);
      w.start = Number(cursor.toFixed(3));
      w.end = Number((cursor + dur).toFixed(3));
      cursor = w.end + 0.02;
    }
  }

  // 5. Final clamp to audio duration
  for (const w of deduped) {
    w.start = Math.min(w.start, audioDuration - 0.1);
    w.end = Math.min(w.end, audioDuration);
    if (w.end <= w.start) w.end = w.start + 0.15;
    
    // Safety check again
    w.start = Number(w.start.toFixed(3));
    w.end = Number(w.end.toFixed(3));
  }

  return deduped;
}
