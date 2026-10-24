import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { drawCaptions, drawWatermark } from "@/lib/captions/renderer";
import {
  type CaptionBlock,
  type CaptionStyle,
  type ExportQuality,
  type VideoFilters,
  buildFilterString,
} from "@/lib/captions/types";

export const QUALITY_PRESETS: Record<
  ExportQuality,
  { label: string; height: number; bitrate: number; note: string }
> = {
  "720": { label: "720p", height: 720, bitrate: 5_000_000, note: "Fast, social-ready" },
  "1080": { label: "1080p", height: 1080, bitrate: 12_000_000, note: "Recommended for reels" },
  "1440": {
    label: "2K",
    height: 1440,
    bitrate: 22_000_000,
    note: "Sharpest captions, best for large text",
  },
};

const CODEC_CANDIDATES = ["avc1.640034", "avc1.4d0034", "avc1.42E034", "avc1.4d0028"];

export function exportSupported() {
  return typeof window !== "undefined" && "VideoEncoder" in window && "AudioEncoder" in window;
}

async function pickCodec(width: number, height: number, bitrate: number, framerate: number) {
  for (const codec of CODEC_CANDIDATES) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate,
      });
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
    if (
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      Math.abs(video.currentTime - target) < 0.0005
    ) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video frame decoding timed out."));
    }, 15_000);
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      window.clearTimeout(timeout);
    };
    const onSeeked = () => {
      cleanup();
      // Double-rAF ensures the decoded frame is actually composited to the
      // video texture before we drawImage() it onto the export canvas.
      // Note: requestVideoFrameCallback does NOT work here because it only
      // fires while the video is playing, and during export the video is paused.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
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
  trimStart?: number;
  trimEnd?: number;
  videoFilters?: VideoFilters;
  bgMusicFile?: File | null;
  bgMusicVolume?: number;
  originalVolume?: number;
  bgMusicLoop?: boolean;
  onProgress: (value: number, label: string) => void;
  signal?: AbortSignal;
}): Promise<Blob> {
  const {
    file,
    blocks,
    style,
    quality,
    onProgress,
    trimStart,
    trimEnd,
    videoFilters,
    bgMusicFile,
    bgMusicVolume = 0.3,
    originalVolume = 1.0,
    bgMusicLoop = true,
  } = opts;
  const fps = opts.fps ?? 30;
  const preset = QUALITY_PRESETS[quality];

  const url = URL.createObjectURL(file);
  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;

  // Declare video outside try so finally can always clean it up
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  // Mount in DOM for fast hardware-accelerated frame decoding
  video.style.position = "fixed";
  video.style.top = "0";
  video.style.opacity = "0.001";
  video.style.pointerEvents = "none";
  video.style.width = "1px";
  video.style.height = "1px";
  document.body.appendChild(video);

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Unsupported video file."));
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error(
        "This video has invalid duration metadata. Please re-export the source video first.",
      );
    }

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    const shortEdge = Math.min(srcW, srcH);
    const scale = preset.height / shortEdge;

    const outH = Math.round((srcH * scale) / 2) * 2;
    const outW = Math.round((srcW * scale) / 2) * 2;
    const duration = video.duration;
    const effectiveStart = Math.max(0, Math.min(trimStart ?? 0, duration));
    const effectiveEnd = Math.max(effectiveStart + 0.05, Math.min(trimEnd ?? duration, duration));
    const trimmedDuration = effectiveEnd - effectiveStart;
    const totalFrames = Math.max(1, Math.floor(trimmedDuration * fps));

    const codec = await pickCodec(outW, outH, preset.bitrate, fps);
    if (!codec) throw new Error("This browser cannot encode MP4 video.");

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas rendering is unavailable in this browser.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // ---- audio (decoded up-front so we can mix & mux it alongside video) ----
    onProgress(0.02, "Preparing audio");
    let audioBuffer: AudioBuffer | null = null;
    let bgAudioBuffer: AudioBuffer | null = null;
    const ac = new AudioContext({ sampleRate: 48000 });
    try {
      audioBuffer = await ac.decodeAudioData(await file.arrayBuffer());
    } catch {
      audioBuffer = null;
    }
    if (bgMusicFile) {
      try {
        bgAudioBuffer = await ac.decodeAudioData(await bgMusicFile.arrayBuffer());
      } catch {
        bgAudioBuffer = null;
      }
    }
    void ac.close();

    const hasAudio =
      (!!audioBuffer && audioBuffer.numberOfChannels > 0) ||
      (!!bgAudioBuffer && bgAudioBuffer.numberOfChannels > 0);
    const channels = 2; // Always stereo for clean mixing
    const sampleRate = 48000;

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: "avc", width: outW, height: outH },
      ...(hasAudio
        ? { audio: { codec: "aac" as const, numberOfChannels: channels, sampleRate } }
        : {}),
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
      latencyMode: "quality", // "quality" never drops frames; "realtime" can cause lag/stutter
    });

    for (let i = 0; i < totalFrames; i++) {
      if (opts.signal?.aborted) throw new Error("Export cancelled");
      const relTime = i / fps;
      const t = effectiveStart + relTime;
      await seek(video, t);

      const filterStr = buildFilterString(videoFilters);
      if (filterStr && filterStr !== "none") {
        ctx.save();
        ctx.filter = filterStr;
        ctx.drawImage(video, 0, 0, outW, outH);
        ctx.restore();
      } else {
        ctx.drawImage(video, 0, 0, outW, outH);
      }
      drawCaptions(ctx, outW, outH, relTime, blocks, style);
      drawWatermark(ctx, outW, outH, style);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(relTime * 1_000_000),
        duration: Math.round(1_000_000 / fps),
      });
      videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      // Drain encoder queue to prevent backpressure
      while (videoEncoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 5));
      }

      // Unified progress: bar and label always match
      const pct = Math.round(((i + 1) / totalFrames) * 100);
      const progressValue = pct / 100;
      onProgress(progressValue, `Downloading… ${pct}%`);

      // Yield to UI every 8 frames
      if (i % 8 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await videoEncoder.flush();
    videoEncoder.close();

    if (hasAudio) {
      onProgress(0.9, "Encoding audio");
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error("[export] audio encoder", e),
      });
      audioEncoder.configure({
        codec: "mp4a.40.2",
        numberOfChannels: channels,
        sampleRate,
        bitrate: 160_000,
      });

      const totalTrimmedSamples = Math.max(1, Math.floor(trimmedDuration * sampleRate));
      const leftPlane = new Float32Array(totalTrimmedSamples);
      const rightPlane = new Float32Array(totalTrimmedSamples);

      // Mix original audio
      if (audioBuffer && originalVolume > 0) {
        const startSample = Math.floor(effectiveStart * sampleRate);
        const endSample = Math.min(audioBuffer.length, Math.floor(effectiveEnd * sampleRate));
        const origLeft = audioBuffer.getChannelData(0);
        const origRight =
          audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : origLeft;
        const count = Math.min(totalTrimmedSamples, Math.max(0, endSample - startSample));
        for (let i = 0; i < count; i++) {
          const idx = startSample + i;
          if (idx < audioBuffer.length) {
            leftPlane[i] += (origLeft[idx] ?? 0) * originalVolume;
            rightPlane[i] += (origRight[idx] ?? 0) * originalVolume;
          }
        }
      }

      // Mix background music
      if (bgAudioBuffer && bgMusicVolume > 0) {
        const bgLeft = bgAudioBuffer.getChannelData(0);
        const bgRight =
          bgAudioBuffer.numberOfChannels > 1 ? bgAudioBuffer.getChannelData(1) : bgLeft;
        const bgLen = bgAudioBuffer.length;
        if (bgLen > 0) {
          for (let i = 0; i < totalTrimmedSamples; i++) {
            if (!bgMusicLoop && i >= bgLen) break;
            const bgIdx = bgMusicLoop ? i % bgLen : i;
            leftPlane[i] += (bgLeft[bgIdx] ?? 0) * bgMusicVolume;
            rightPlane[i] += (bgRight[bgIdx] ?? 0) * bgMusicVolume;
          }
        }
      }

      // Clamp values to prevent distortion
      for (let i = 0; i < totalTrimmedSamples; i++) {
        leftPlane[i] = Math.max(-1, Math.min(1, leftPlane[i]!));
        rightPlane[i] = Math.max(-1, Math.min(1, rightPlane[i]!));
      }

      const frameSize = 4096;
      for (let offset = 0; offset < totalTrimmedSamples; offset += frameSize) {
        const count = Math.min(frameSize, totalTrimmedSamples - offset);
        const data = new Float32Array(count * channels);
        data.set(leftPlane.subarray(offset, offset + count), 0);
        data.set(rightPlane.subarray(offset, offset + count), count);

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
    video.remove();
  }
}

export function filterAndShiftBlocksForTrim(
  blocks: CaptionBlock[],
  trimStart: number,
  trimEnd: number,
): CaptionBlock[] {
  return blocks
    .filter((b) => b.end > trimStart && b.start < trimEnd)
    .map((b) => {
      const bStart = Math.max(0, b.start - trimStart);
      const bEnd = Math.max(bStart + 0.05, b.end - trimStart);
      const shiftedWords = b.words
        .filter((w) => w.end > trimStart && w.start < trimEnd)
        .map((w) => ({
          ...w,
          start: Math.max(0, w.start - trimStart),
          end: Math.max(Math.max(0, w.start - trimStart) + 0.05, w.end - trimStart),
        }));
      return {
        ...b,
        start: bStart,
        end: bEnd,
        words: shiftedWords.length ? shiftedWords : b.words,
      };
    });
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
    .map(
      (b, i) =>
        `${i + 1}\n${srtTime(b.start)} --> ${srtTime(b.end)}\n${b.words.map((w) => w.text).join(" ")}\n`,
    )
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
