import re

with open('src/lib/export/exportVideo.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the opts signature
content = content.replace('file: File;', 'files: File[];')

# Rewrite the core function
start_idx = content.find('export async function exportBurnedVideo(opts: {')
end_idx = content.find('/* ---------- caption file exports ---------- */')

if start_idx != -1 and end_idx != -1:
    new_func = """export async function exportBurnedVideo(opts: {
  files: File[];
  blocks: CaptionBlock[];
  style: CaptionStyle;
  quality: ExportQuality;
  fps?: number;
  sharpen?: boolean;
  onProgress: (value: number, label: string) => void;
  signal?: AbortSignal;
}): Promise<Blob> {
  const { files, blocks, style, quality, onProgress } = opts;
  const fps = opts.fps ?? 30;
  const preset = QUALITY_PRESETS[quality];

  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;

  // Mount in DOM for fast hardware-accelerated frame decoding
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.style.position = "fixed";
  video.style.top = "0";
  video.style.opacity = "0.001";
  video.style.pointerEvents = "none";
  video.style.width = "1px";
  video.style.height = "1px";
  document.body.appendChild(video);

  const urls = files.map(f => URL.createObjectURL(f));

  try {
    const metas: { url: string; duration: number; start: number }[] = [];
    let totalDuration = 0;
    let maxW = 0, maxH = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Unsupported video file."));
      });
      if (i === 0) {
         maxW = video.videoWidth;
         maxH = video.videoHeight;
      }
      const d = video.duration || 0;
      metas.push({ url, duration: d, start: totalDuration });
      totalDuration += d;
    }

    if (totalDuration <= 0) {
      throw new Error("These videos have invalid duration metadata.");
    }

    const shortEdge = Math.min(maxW, maxH);
    const scale = preset.height / shortEdge;

    const outH = Math.round((maxH * scale) / 2) * 2;
    const outW = Math.round((maxW * scale) / 2) * 2;
    const totalFrames = Math.max(1, Math.floor(totalDuration * fps));

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
    const audioBuffers: AudioBuffer[] = [];
    let sampleRate = 48000;
    let channels = 0;
    
    const ac = new AudioContext();
    try {
      for (const file of files) {
         try {
            const buf = await ac.decodeAudioData(await file.arrayBuffer());
            audioBuffers.push(buf);
            if (buf.numberOfChannels > channels) channels = Math.min(2, buf.numberOfChannels);
            sampleRate = buf.sampleRate;
         } catch {
            audioBuffers.push(ac.createBuffer(1, 1, 48000));
         }
      }
    } finally {
      void ac.close();
    }
    const hasAudio = channels > 0;

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
      latencyMode: "quality",
    });

    let currentMetaIdx = 0;
    video.src = metas[0].url;

    for (let i = 0; i < totalFrames; i++) {
      if (opts.signal?.aborted) throw new Error("Export cancelled");
      const t = i / fps;
      
      // Determine which video we are in
      let metaIdx = metas.findIndex(m => t >= m.start && t < m.start + m.duration);
      if (metaIdx === -1) metaIdx = metas.length - 1;
      
      if (metaIdx !== currentMetaIdx) {
        currentMetaIdx = metaIdx;
        video.src = metas[metaIdx].url;
        await new Promise<void>(r => { video.onloadedmetadata = () => r(); video.onerror = () => r(); });
      }

      const localT = t - metas[currentMetaIdx].start;
      await seek(video, localT);

      ctx.drawImage(video, 0, 0, outW, outH);
      drawCaptions(ctx, outW, outH, t, blocks, style);
      drawWatermark(ctx, outW, outH, style);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(t * 1_000_000),
        duration: Math.round(1_000_000 / fps),
      });
      videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      while (videoEncoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 5));
      }

      const pct = Math.round(((i + 1) / totalFrames) * 100);
      const progressValue = pct / 100;
      onProgress(progressValue, `Downloading… ${pct}%`);

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
      const frameSize = 4096;
      
      // Concat logic
      let globalOffset = 0;
      
      for (const buf of audioBuffers) {
        const length = buf.length;
        const planes: Float32Array[] = [];
        for (let c = 0; c < channels; c++) {
           planes.push(c < buf.numberOfChannels ? buf.getChannelData(c) : new Float32Array(length));
        }

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
            timestamp: Math.round((globalOffset / sampleRate) * 1_000_000),
            data,
          });
          audioEncoder.encode(audioData);
          audioData.close();
          globalOffset += count;
        }
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
    urls.forEach(u => URL.revokeObjectURL(u));
    video.remove();
  }
}

"""
    
    new_content = content[:start_idx] + new_func + content[end_idx:]
    with open('src/lib/export/exportVideo.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Updated successfully')
else:
    print('Could not find start/end indices')
