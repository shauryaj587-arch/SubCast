import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import { cn } from "@/lib/utils";
import { DEFAULT_VIDEO_FILTERS, type VideoFilters } from "@/lib/captions/types";

export const FILTER_PRESETS: {
  id: string;
  name: string;
  emoji: string;
  filters: VideoFilters;
}[] = [
  {
    id: "normal",
    name: "Original",
    emoji: "✨",
    filters: DEFAULT_VIDEO_FILTERS,
  },
  {
    id: "vibrant",
    name: "Vibrant",
    emoji: "🔥",
    filters: {
      brightness: 105,
      contrast: 115,
      saturate: 135,
      warmth: 0,
      grayscale: 0,
      preset: "vibrant",
    },
  },
  {
    id: "warm",
    name: "Warm",
    emoji: "☀️",
    filters: {
      brightness: 102,
      contrast: 108,
      saturate: 112,
      warmth: 22,
      grayscale: 0,
      preset: "warm",
    },
  },
  {
    id: "cinematic",
    name: "Moody",
    emoji: "🎬",
    filters: {
      brightness: 96,
      contrast: 122,
      saturate: 90,
      warmth: 12,
      grayscale: 0,
      preset: "cinematic",
    },
  },
  {
    id: "bw",
    name: "B&W",
    emoji: "🖤",
    filters: {
      brightness: 100,
      contrast: 125,
      saturate: 0,
      warmth: 0,
      grayscale: 100,
      preset: "bw",
    },
  },
];

export function EditingToolsPanel({
  clipDuration,
  isTrimmedFromOriginal,
  onApplyTrim,
  onResetToOriginal,
  onSeek,
  bgMusicFile,
  bgMusicVolume,
  originalVolume,
  bgMusicLoop,
  onBgMusicFileChange,
  onBgMusicVolumeChange,
  onOriginalVolumeChange,
  onBgMusicLoopChange,
  videoFilters = DEFAULT_VIDEO_FILTERS,
  onVideoFiltersChange,
}: {
  clipDuration: number;
  isTrimmedFromOriginal: boolean;
  onApplyTrim: (keepStart: number, keepEnd: number) => void;
  onResetToOriginal: () => void;
  onSeek: (time: number) => void;
  bgMusicFile: File | null;
  bgMusicVolume: number;
  originalVolume: number;
  bgMusicLoop: boolean;
  onBgMusicFileChange: (file: File | null) => void;
  onBgMusicVolumeChange: (vol: number) => void;
  onOriginalVolumeChange: (vol: number) => void;
  onBgMusicLoopChange: (loop: boolean) => void;
  videoFilters?: VideoFilters;
  onVideoFiltersChange: (filters: VideoFilters, commitSnapshot?: boolean) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // All categories are collapsed / contracted by default as requested
  const [openTrim, setOpenTrim] = useState(false);
  const [openMusic, setOpenMusic] = useState(false);
  const [openFilters, setOpenFilters] = useState(false);

  const safeDuration = clipDuration > 0 ? clipDuration : 1;
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(safeDuration);

  // Sync sliders when clip duration changes
  useEffect(() => {
    setStart(0);
    setEnd(safeDuration);
  }, [safeDuration]);

  const keepLength = Math.max(0.1, end - start);
  const isPendingCut = start > 0.05 || end < safeDuration - 0.05;

  const startPercent = Math.max(0, Math.min(100, (start / safeDuration) * 100));
  const endPercent = Math.max(0, Math.min(100, (end / safeDuration) * 100));
  const keepPercent = Math.max(0, endPercent - startPercent);

  const isFiltered =
    videoFilters.brightness !== 100 ||
    videoFilters.contrast !== 100 ||
    videoFilters.saturate !== 100 ||
    videoFilters.warmth !== 0 ||
    videoFilters.grayscale !== 0;

  const activePreset = FILTER_PRESETS.find((p) => p.id === videoFilters.preset);

  return (
    <div className="space-y-3">
      {/* ---------------- 1. Video Trimming Category Card ---------------- */}
      <div className="rounded-xl border border-border bg-surface transition-colors shadow-sm overflow-hidden">
        {/* Clickable Header with Animated Arrow */}
        <button
          type="button"
          onClick={() => setOpenTrim((prev) => !prev)}
          className="flex w-full items-center justify-between p-3.5 text-left transition-colors hover:bg-surface-2/60 select-none"
          aria-expanded={openTrim}
        >
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm">
              ✂️
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-foreground">
                Video Trimmer
              </h3>
              <p className="truncate text-[11px] text-muted-foreground">
                Cut start & end points from video
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isTrimmedFromOriginal && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {safeDuration.toFixed(1)}s
              </span>
            )}
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-transform duration-300",
                openTrim ? "rotate-180 text-foreground bg-surface-2" : "rotate-0",
              )}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
        </button>

        {/* Smooth Expand/Contract Animated Container */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
            openTrim
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0 pointer-events-none",
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t border-border/70 p-4 pt-3.5 space-y-4">
              {/* Visual Range Indicator Bar */}
              <div>
                <div className="relative flex h-4 w-full overflow-hidden rounded-full bg-destructive/20 border border-border/60">
                  {/* Cut left indicator */}
                  {startPercent > 0 && (
                    <div
                      className="h-full bg-destructive/30"
                      style={{ width: `${startPercent}%` }}
                      title="This left portion will be cut"
                    />
                  )}
                  {/* Kept middle portion */}
                  <div
                    className="relative h-full bg-primary flex items-center justify-center transition-all duration-75"
                    style={{
                      left: `${startPercent}%`,
                      width: `${keepPercent}%`,
                      position: "absolute",
                    }}
                    title="This portion will be KEPT in the video"
                  >
                    <span className="font-mono text-[9px] font-bold text-primary-foreground drop-shadow-sm select-none">
                      KEPT
                    </span>
                  </div>
                  {/* Cut right indicator */}
                  {endPercent < 100 && (
                    <div
                      className="h-full bg-destructive/30 ml-auto"
                      style={{ width: `${100 - endPercent}%` }}
                      title="This right portion will be cut"
                    />
                  )}
                </div>

                <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span className={start > 0.05 ? "text-destructive font-semibold" : ""}>
                    Cut: {start.toFixed(1)}s
                  </span>
                  <span className="font-semibold text-primary">Keep: {keepLength.toFixed(1)}s</span>
                  <span
                    className={end < safeDuration - 0.05 ? "text-destructive font-semibold" : ""}
                  >
                    Cut: {(safeDuration - end).toFixed(1)}s
                  </span>
                </div>
              </div>

              {/* Start point slider */}
              <div>
                <label className="block">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Start point (In)</span>
                    <span className="font-mono text-[11px] font-semibold text-foreground">
                      {start.toFixed(1)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, end - 0.2)}
                    step={0.1}
                    value={start}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setStart(val);
                      onSeek(val);
                    }}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                  />
                </label>
              </div>

              {/* End point slider */}
              <div>
                <label className="block">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">End point (Out)</span>
                    <span className="font-mono text-[11px] font-semibold text-foreground">
                      {end.toFixed(1)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={Math.min(safeDuration, start + 0.2)}
                    max={safeDuration}
                    step={0.1}
                    value={end}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEnd(val);
                      onSeek(val);
                    }}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                  />
                </label>
              </div>

              {/* Action buttons */}
              <div className="space-y-2 pt-1">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => onApplyTrim(start, end)}
                  disabled={!isPendingCut}
                  className="w-full text-xs font-semibold"
                >
                  ✂️ Trim (Keep {keepLength.toFixed(1)}s)
                </Button>

                {isTrimmedFromOriginal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onResetToOriginal}
                    className="w-full text-xs text-muted-foreground hover:text-foreground"
                  >
                    ↺ Reset to Original Video
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- 2. Background Music Category Card ---------------- */}
      <div className="rounded-xl border border-border bg-surface transition-colors shadow-sm overflow-hidden">
        {/* Clickable Header with Animated Arrow */}
        <button
          type="button"
          onClick={() => setOpenMusic((prev) => !prev)}
          className="flex w-full items-center justify-between p-3.5 text-left transition-colors hover:bg-surface-2/60 select-none"
          aria-expanded={openMusic}
        >
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm">
              🎵
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-foreground">
                Background Music
              </h3>
              <p className="truncate text-[11px] text-muted-foreground">
                Mix music with original video audio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {bgMusicFile && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Active
              </span>
            )}
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-transform duration-300",
                openMusic ? "rotate-180 text-foreground bg-surface-2" : "rotate-0",
              )}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
        </button>

        {/* Smooth Expand/Contract Animated Container */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
            openMusic
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0 pointer-events-none",
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t border-border/70 p-4 pt-3.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/mp3,audio/wav,audio/m4a,audio/aac,audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onBgMusicFileChange(f);
                  e.target.value = "";
                }}
              />

              {!bgMusicFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-2/40 p-5 text-center transition-all hover:border-primary hover:bg-surface-2"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-3 text-lg transition-transform group-hover:scale-110">
                    🎵
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Add Background Music</p>
                    <p className="text-[10px] text-muted-foreground">
                      MP3, WAV, AAC or M4A (100% local)
                    </p>
                  </div>
                </button>
              ) : (
                <div className="space-y-4">
                  {/* Attached file info */}
                  <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 p-2.5">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="truncate text-xs font-medium text-foreground">
                        {bgMusicFile.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {(bgMusicFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onBgMusicFileChange(null)}
                      className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      Remove
                    </Button>
                  </div>

                  {/* Background Music Volume */}
                  <div>
                    <label className="block">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Music Volume</span>
                        <span className="font-mono text-[11px] font-semibold text-foreground">
                          {Math.round(bgMusicVolume * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.02}
                        value={bgMusicVolume}
                        onChange={(e) => onBgMusicVolumeChange(Number(e.target.value))}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                      />
                    </label>
                  </div>

                  {/* Original Video Audio Volume */}
                  <div>
                    <label className="block">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Original Video Volume</span>
                        <span className="font-mono text-[11px] font-semibold text-foreground">
                          {Math.round(originalVolume * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.02}
                        value={originalVolume}
                        onChange={(e) => onOriginalVolumeChange(Number(e.target.value))}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                      />
                    </label>
                  </div>

                  {/* Loop Music Toggle */}
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="text-xs font-medium text-foreground">Loop Music</span>
                      <p className="text-[10px] text-muted-foreground">
                        Repeat track if video is longer
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={bgMusicLoop}
                      onChange={(e) => onBgMusicLoopChange(e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-border text-primary accent-primary"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- 3. Video Filters & Colors Category Card ---------------- */}
      <div className="rounded-xl border border-border bg-surface transition-colors shadow-sm overflow-hidden">
        {/* Clickable Header with Animated Arrow */}
        <button
          type="button"
          onClick={() => setOpenFilters((prev) => !prev)}
          className="flex w-full items-center justify-between p-3.5 text-left transition-colors hover:bg-surface-2/60 select-none"
          aria-expanded={openFilters}
        >
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm">
              🎨
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-foreground">
                Video Filters
              </h3>
              <p className="truncate text-[11px] text-muted-foreground">
                Colors, brightness & cinematic looks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isFiltered && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary capitalize">
                {activePreset ? activePreset.name : "Custom"}
              </span>
            )}
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-transform duration-300",
                openFilters ? "rotate-180 text-foreground bg-surface-2" : "rotate-0",
              )}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
        </button>

        {/* Smooth Expand/Contract Animated Container */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
            openFilters
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0 pointer-events-none",
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t border-border/70 p-4 pt-3.5 space-y-4">
              {/* 1-Click Presets */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-foreground">
                  Cinematic Presets
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {FILTER_PRESETS.map((p) => {
                    const isSelected = videoFilters.preset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onVideoFiltersChange(p.filters, true)}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1 rounded-lg border py-2 px-1 text-center transition-all",
                          isSelected
                            ? "border-primary bg-primary/10 text-primary shadow-xs ring-1 ring-primary/40 font-semibold"
                            : "border-border/70 bg-surface-2/60 text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                        )}
                      >
                        <span className="text-sm">{p.emoji}</span>
                        <span className="text-[10px] leading-tight truncate w-full">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sliders */}
              <div className="space-y-3 pt-1 border-t border-border/50">
                {/* Brightness */}
                <div>
                  <label className="block">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Brightness</span>
                      <span className="font-mono text-[11px] font-semibold text-foreground">
                        {videoFilters.brightness}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={150}
                      step={1}
                      value={videoFilters.brightness}
                      onChange={(e) =>
                        onVideoFiltersChange(
                          { ...videoFilters, brightness: Number(e.target.value), preset: "custom" },
                          false,
                        )
                      }
                      onPointerUp={() =>
                        onVideoFiltersChange({ ...videoFilters, preset: "custom" }, true)
                      }
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                    />
                  </label>
                </div>

                {/* Contrast */}
                <div>
                  <label className="block">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Contrast</span>
                      <span className="font-mono text-[11px] font-semibold text-foreground">
                        {videoFilters.contrast}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={150}
                      step={1}
                      value={videoFilters.contrast}
                      onChange={(e) =>
                        onVideoFiltersChange(
                          { ...videoFilters, contrast: Number(e.target.value), preset: "custom" },
                          false,
                        )
                      }
                      onPointerUp={() =>
                        onVideoFiltersChange({ ...videoFilters, preset: "custom" }, true)
                      }
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                    />
                  </label>
                </div>

                {/* Saturation */}
                <div>
                  <label className="block">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Saturation</span>
                      <span className="font-mono text-[11px] font-semibold text-foreground">
                        {videoFilters.saturate}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      step={2}
                      value={videoFilters.saturate}
                      onChange={(e) =>
                        onVideoFiltersChange(
                          { ...videoFilters, saturate: Number(e.target.value), preset: "custom" },
                          false,
                        )
                      }
                      onPointerUp={() =>
                        onVideoFiltersChange({ ...videoFilters, preset: "custom" }, true)
                      }
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                    />
                  </label>
                </div>

                {/* Warmth */}
                <div>
                  <label className="block">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Warmth (Golden tone)</span>
                      <span className="font-mono text-[11px] font-semibold text-foreground">
                        {videoFilters.warmth}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={videoFilters.warmth}
                      onChange={(e) =>
                        onVideoFiltersChange(
                          { ...videoFilters, warmth: Number(e.target.value), preset: "custom" },
                          false,
                        )
                      }
                      onPointerUp={() =>
                        onVideoFiltersChange({ ...videoFilters, preset: "custom" }, true)
                      }
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                    />
                  </label>
                </div>
              </div>

              {/* Reset button */}
              {isFiltered && (
                <div className="pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onVideoFiltersChange(DEFAULT_VIDEO_FILTERS, true)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground"
                  >
                    ↺ Reset Filters to Original
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
