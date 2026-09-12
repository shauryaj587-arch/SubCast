import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { drawCaptions, drawWatermark } from "@/lib/captions/renderer";
import type { CaptionBlock, CaptionStyle, ExportQuality } from "@/lib/captions/types";

export const QUALITY_PRESETS: Record<
  ExportQuality,
  { label: string; height: number; bitrate: number; note: string }
> = {
  "720": { label: "720p", height: 720, bitrate: 5_000_000, note: "Fast, social-ready" },
  "1080": { label: "1080p", height: 1080, bitrate: 12_000_000, note: "Recommended for reels" },
  "1440": { label: "2K enhanced", height: 1440, bitrate: 22_000_000, note: "Upscaled, sharpest text" },
};

const CODEC_CANDIDATES = ["avc1.640034", "avc1.4d0034", "avc1.42E034", "avc1.4d0028"];

export function exportSupported() {
  return typeof window !== "undefined" && "VideoEncoder" in window && "AudioEncoder" in window;
}

async function pickCodec(width: number, height: number, bitrate: number, framerate: number) {
  for (const codec of CODEC_CANDIDATES) {
    try {
      const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate });
      if (support.supported) return codec;
    } catch {
      /* try next */
    }
  }
  return null;
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const target = Math.min(time, Math.max(0, video.duration - 0.001));
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && Math.abs(video.currentTime - target) < 0.0005) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video frame decoding timed out."));
    }, 10_000);
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      window.clearTimeout(timeout);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not read a frame from this video."));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = target;
  });
}

export async function exportBurnedVideo(opts: {
  file: File;
  blocks: CaptionBlock[];
  style: CaptionStyle;
  quality: ExportQuality;
  fps?: number;
  sharpen?: boolean;
  onProgress: (value: number, label: string) => void;
  signal?: AbortSignal;
}): Promise<Blob> {
  const { file, blocks, style, quality, onProgress } = opts;
  const fps = opts.fps ?? 30;
  const preset = QUALITY_PRESETS[quality];

  const url = URL.createObjectURL(file);
  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Unsupported video file."));
  });
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    throw new Error("This video has invalid duration metadata. Please re-export the source video first.");
  }

  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  const shortEdge = Math.min(srcW, srcH);
  const scale = preset.height / shortEdge;
  
  const outH = Math.round((srcH * scale) / 2) * 2;
  const outW = Math.round((srcW * scale) / 2) * 2;
  const duration = video.duration;
  const totalFrames = Math.max(1, Math.floor(duration * fps));

  const codec = await pickCodec(outW, outH, preset.bitrate, fps);
  if (!codec) throw new Error("This browser cannot encode MP4 video.");

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas rendering is unavailable in this browser.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // ---- audio (decoded up-front so we can mux it alongside video) ----
  onProgress(0.02, "Preparing audio");
  let audioBuffer: AudioBuffer | null = null;
  const ac = new AudioContext();
  try {
    audioBuffer = await ac.decodeAudioData(await file.arrayBuffer());
  } catch {
    audioBuffer = null;
  } finally {
    void ac.close();
  }
  const hasAudio = !!audioBuffer && audioBuffer.numberOfChannels > 0;
  const channels = hasAudio ? Math.min(2, audioBuffer!.numberOfChannels) : 0;
  const sampleRate = hasAudio ? audioBuffer!.sampleRate : 48000;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: outW, height: outH },
    ...(hasAudio ? { audio: { codec: "aac" as const, numberOfChannels: channels, sampleRate } } : {}),
    fastStart: "in-memory",
  });

  videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("[export] video encoder", e),
  });
  videoEncoder.configure({
    codec,
    width: outW,
    height: outH,
    bitrate: preset.bitrate,
    framerate: fps,
    latencyMode: "quality",
  });

    for (let i = 0; i < totalFrames; i++) {
      if (opts.signal?.aborted) throw new Error("Export cancelled");
      const t = i / fps;
      await seek(video, t);
      ctx.drawImage(video, 0, 0, outW, outH);
      drawCaptions(ctx, outW, outH, t, blocks, style);
      drawWatermark(ctx, outW, outH, style);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(t * 1_000_000), duration: Math.round(1_000_000 / fps) });
      videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      // Drain encoder queue to prevent backpressure lag in the exported video
      if (videoEncoder.encodeQueueSize > 5) {
        await new Promise((r) => setTimeout(r, 0));
      }

      if (i % 8 === 0) {
        const pct = Math.round(((i + 1) / totalFrames) * 100);
        onProgress(0.05 + 0.82 * (i / totalFrames), `Downloading… ${pct}%`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await videoEncoder.flush();
    videoEncoder.close();

    if (hasAudio && audioBuffer) {
      onProgress(0.9, "Encoding audio");
       audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error("[export] audio encoder", e),
      });
      audioEncoder.configure({ codec: "mp4a.40.2", numberOfChannels: channels, sampleRate, bitrate: 160_000 });
      const frameSize = 4096;
      const planes: Float32Array[] = [];
      for (let c = 0; c < channels; c++) planes.push(audioBuffer.getChannelData(c));
      const length = audioBuffer.length;
      for (let offset = 0; offset < length; offset += frameSize) {
        const count = Math.min(frameSize, length - offset);
        const data = new Float32Array(count * channels);
        for (let c = 0; c < channels; c++) {
          data.set(planes[c]!.subarray(offset, offset + count), c * count);
        }
        const audioData = new AudioData({
          format: "f32-planar",
          sampleRate,
          numberOfFrames: count,
          numberOfChannels: channels,
          timestamp: Math.round((offset / sampleRate) * 1_000_000),
          data,
        });
        audioEncoder.encode(audioData);
        audioData.close();
      }
      await audioEncoder.flush();
       audioEncoder.close();
       audioEncoder = null;
    }

    onProgress(0.97, "Writing MP4");
    muxer.finalize();
    const target = muxer.target as ArrayBufferTarget;
    onProgress(1, "Ready");
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    if (videoEncoder?.state !== "closed") videoEncoder?.close();
    if (audioEncoder?.state !== "closed") audioEncoder?.close();
    URL.revokeObjectURL(url);
  }
}

/* ---------- caption file exports ---------- */

function srtTime(t: number) {
  const ms = Math.floor((t % 1) * 1000);
  const s = Math.floor(t) % 60;
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

export function blocksToSrt(blocks: CaptionBlock[]) {
  return blocks
    .map((b, i) => `${i + 1}\n${srtTime(b.start)} --> ${srtTime(b.end)}\n${b.words.map((w) => w.text).join(" ")}\n`)
    .join("\n");
}

export function blocksToVtt(blocks: CaptionBlock[]) {
  return (
    "WEBVTT\n\n" +
    blocks
      .map(
        (b) =>
          `${srtTime(b.start).replace(",", ".")} --> ${srtTime(b.end).replace(",", ".")}\n${b.words
            .map((w) => w.text)
            .join(" ")}\n`,
      )
      .join("\n")
  );
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
