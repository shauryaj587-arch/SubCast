import { useRef, useState } from "react";
import type { CaptionBlock, CaptionStyle, ExportQuality } from "@/lib/captions/types";
import {
  QUALITY_PRESETS,
  blocksToSrt,
  blocksToVtt,
  download,
  exportBurnedVideo,
  exportSupported,
} from "@/lib/export/exportVideo";
import { Button } from "./ui";
import { cn } from "@/lib/utils";

export function ExportPanel({
  files,
  blocks,
  style,
  onClose,
}: {
  files: File[];
  blocks: CaptionBlock[];
  style: CaptionStyle;
  onClose: () => void;
}) {
  const [quality, setQuality] = useState<ExportQuality>("1080");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const supported = exportSupported();
  const baseName = files[0]?.name.replace(/\.[^.]+$/, "") || "reel";

  async function run() {
    setBusy(true);
    setError(null);
    setDone(false);
    controller.current = new AbortController();
    try {
      const blob = await exportBurnedVideo({
        files,
        blocks,
        style,
        quality,
        signal: controller.current.signal,
        onProgress: (v, l) => {
          setProgress(v);
          setLabel(l);
        },
      });
      download(blob, `${baseName}-subtitled.mp4`);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
    >
      <div className="panel w-full max-w-md p-6 shadow-[var(--shadow-lift)]">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="export-title" className="font-display text-lg font-bold tracking-tight">
              Export reel
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Captions are burned in, frame by frame, right here in your browser.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={busy}
            aria-label="Close export panel"
          >
            ✕
          </Button>
        </div>

        {busy && (
          <div className="mt-5">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{label}</p>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-destructive/12 p-3 text-xs text-destructive">{error}</p>
        )}
        {done && (
          <p className="mt-4 rounded-lg bg-primary/12 p-3 text-xs text-primary">
            Saved to your downloads.
          </p>
        )}
        {!supported && (
          <p className="mt-4 rounded-lg bg-surface-2 p-3 text-xs text-muted-foreground">
            This browser can't render MP4 locally. Use Chrome or Edge, or download a subtitle file
            below.
          </p>
        )}

        <Button
          variant="primary"
          size="lg"
          className="mt-5 w-full"
          onClick={run}
          disabled={busy || !supported || !blocks.length}
          aria-busy={busy}
        >
          {busy ? "Downloading…" : "Download MP4 with subtitles"}
        </Button>
        {busy && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            onClick={() => controller.current?.abort()}
          >
            Cancel export
          </Button>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              download(new Blob([blocksToSrt(blocks)], { type: "text/plain" }), `${baseName}.srt`)
            }
          >
            Download .SRT
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              download(new Blob([blocksToVtt(blocks)], { type: "text/vtt" }), `${baseName}.vtt`)
            }
          >
            Download .VTT
          </Button>
        </div>
      </div>
    </div>
  );
}
