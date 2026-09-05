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

        const words: CaptionWord[] = [];
        for (const chunk of result.chunks) {
          if (chunk.timestamp && chunk.timestamp[0] !== null && chunk.timestamp[1] !== null) {
            const text = chunk.text.trim();
            if (text) {
              const start = Number(chunk.timestamp[0].toFixed(3));
              let end = Number(chunk.timestamp[1].toFixed(3));
              
              if (end - start > 0.8) {
                end = start + 0.8;
              }

              words.push({
                id: nextId(),
                text: text,
                start: start,
                end: end,
              });
            }
          }
        }
        
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
