import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CAPTION_PRESETS, DEFAULT_PRESET_ID } from "@/lib/captions/presets";
import type { CaptionStyle, CaptionWord, TranscriptLanguage } from "@/lib/captions/types";
import { generateSubtitles, groupIntoBlocks, retimeBlockText } from "@/lib/transcribe";
import { UploadStage } from "@/components/studio/UploadStage";
import { CaptionCanvas } from "@/components/studio/CaptionCanvas";
import { PresetGallery } from "@/components/studio/PresetGallery";
import { DesignPanel } from "@/components/studio/DesignPanel";
import { TranscriptPanel } from "@/components/studio/TranscriptPanel";
import { ExportPanel } from "@/components/studio/ExportPanel";
import { Logo } from "@/components/studio/Logo";
import { Button } from "@/components/studio/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SubCast — Auto Subtitles for Reels (Hindi, English, Hinglish)" },
      {
        name: "description",
        content:
          "Upload a reel and get animated auto subtitles in Hindi, English or Hinglish, with word-level editing and burned-in MP4 export up to 2K.",
      },
      { property: "og:title", content: "SubCast — Auto Subtitles for Reels" },
      {
        property: "og:description",
        content:
          "Auto subtitles for short-form video: Hindi, English and Hinglish, animated caption designs, word-level editing and high-quality MP4 export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

const LANG_LABEL: Record<TranscriptLanguage, string> = {
  en: "English",
  hi: "हिन्दी",
  hinglish: "Hinglish",
};

function Studio() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<TranscriptLanguage>("hinglish");
  const [words, setWords] = useState<CaptionWord[]>([]);
  const [style, setStyle] = useState<CaptionStyle>(
    () => CAPTION_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.style,
  );
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
  const [loaded, setLoaded] = useState(false);

  // Load safely on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("subcast_prefs");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.style) setStyle(parsed.style);
        if (parsed.presetId) setPresetId(parsed.presetId);
      }
    } catch {}
    setLoaded(true);
  }, []);

  // Save on change, but ONLY after initial load completes
  useEffect(() => {
    if (loaded) {
      localStorage.setItem("subcast_prefs", JSON.stringify({ style, presetId }));
    }
  }, [style, presetId, loaded]);

  const [tab, setTab] = useState<"presets" | "design">("presets");
  const [mobilePanel, setMobilePanel] = useState<"design" | "transcript" | null>(null);
  const [status, setStatus] = useState<{ busy: boolean; value: number; label: string; error?: string }>({
    busy: false,
    value: 0,
    label: "",
  });
  const [showExport, setShowExport] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [aspect, setAspect] = useState(9 / 16);
  const videoRef = useRef<HTMLVideoElement>(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const blocks = useMemo(() => groupIntoBlocks(words, style.wordsPerBlock), [words, style.wordsPerBlock]);

  const runTranscription = useCallback(
    async (f: File, lang: TranscriptLanguage) => {
      setStatus({ busy: true, value: 0.02, label: "Preparing" });
      try {
        const result = await generateSubtitles(f, lang, (value, label) =>
          setStatus({ busy: true, value, label }),
        );
        setWords(result);
        setStatus({ busy: false, value: 1, label: "" });
      } catch (e) {
        setStatus({
          busy: false,
          value: 0,
          label: "",
          error: e instanceof Error ? e.message : "Could not generate subtitles.",
        });
      }
    },
    [],
  );

  const start = useCallback(
    (f: File) => {
      setFile(f);
      setWords([]);
      void runTranscription(f, language);
    },
    [language, runTranscription],
  );

  if (!file || !url) {
    return <UploadStage language={language} onLanguage={setLanguage} onFile={start} />;
  }

  const patch = (p: Partial<CaptionStyle>) => setStyle((s) => ({ ...s, ...p }));

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, duration || v.duration || 0));
    setTime(v.currentTime);
  };

  const editWord = (id: string, text: string) =>
    setWords((ws) => ws.map((w) => (w.id === id ? { ...w, text } : w)));

  const deleteWord = (id: string) =>
    setWords((ws) => ws.filter((w) => w.id !== id));

  const rewriteBlock = (blockId: string, text: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const replacement = retimeBlockText(block, text);
    setWords((ws) => {
      const firstIdx = ws.findIndex((w) => w.id === block.words[0]!.id);
      if (firstIdx < 0) return ws;
      return [...ws.slice(0, firstIdx), ...replacement, ...ws.slice(firstIdx + block.words.length)];
    });
  };

  const shiftBlock = (blockId: string, delta: number) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const ids = new Set(block.words.map((w) => w.id));
    setWords((ws) =>
      ws.map((w) =>
        ids.has(w.id) ? { ...w, start: Math.max(0, w.start + delta), end: Math.max(0.1, w.end + delta) } : w,
      ),
    );
  };

  const deleteBlock = (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const ids = new Set(block.words.map((w) => w.id));
    setWords((ws) => ws.filter((w) => !ids.has(w.id)));
  };

  const addBlock = (afterBlockId?: string | null) => {
    let at = time;
    if (afterBlockId) {
      const b = blocks.find((x) => x.id === afterBlockId);
      if (b) at = b.end + 0.1;
    } else {
      const conflict = words.find((w) => w.start <= at && w.end >= at);
      if (conflict) at = conflict.end + 0.1;
    }
    const fresh: CaptionWord[] = ["New", "caption"].map((t, i) => ({
      id: `m${Date.now()}-${i}`,
      text: t,
      start: at + i * 0.5,
      end: at + (i + 1) * 0.5,
    }));
    setWords((ws) => [...ws, ...fresh].sort((a, b) => a.start - b.start));
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex items-center gap-4">
          <Logo />
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <span className="max-w-[220px] truncate text-xs text-muted-foreground">{file.name}</span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">
              {LANG_LABEL[language]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => {
              const lang = e.target.value as TranscriptLanguage;
              setLanguage(lang);
              void runTranscription(file, lang);
            }}
            disabled={status.busy}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-xs outline-none"
            aria-label="Subtitle language"
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
            <option value="hinglish">Hinglish</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => void runTranscription(file, language)} disabled={status.busy}>
            Re-transcribe
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
            New video
          </Button>
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setMobilePanel("design")}>
            Style
          </Button>
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setMobilePanel("transcript")} disabled={!words.length}>
            Captions
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowExport(true)} disabled={!words.length || status.busy}>
            Export
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* left: designs */}
        <aside className="hidden w-[300px] shrink-0 flex-col border-r border-border lg:flex">
          <div className="flex gap-1 border-b border-border p-3">
            {(["presets", "design"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-2",
                )}
              >
                {t === "presets" ? "Caption designs" : "Fine-tune"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === "presets" ? (
              <PresetGallery
                activeId={presetId}
                onPick={(p) => {
                  setPresetId(p.id);
                  setStyle(p.style);
                }}
              />
            ) : (
              <DesignPanel style={style} onChange={patch} />
            )}
          </div>
        </aside>

        {/* center: preview */}
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 p-4">
          <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
            <div className="relative h-full max-h-full">
              <CaptionCanvas videoRef={videoRef} blocks={blocks} style={style} aspect={aspect} />
              {status.busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/78 backdrop-blur-sm">
                  <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${status.value * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{status.label}</p>
                </div>
              )}
            </div>
            <video
              ref={videoRef}
              src={url}
              playsInline
              aria-hidden="true"
              tabIndex={-1}
              className="pointer-events-none absolute h-px w-px opacity-0"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setDuration(v.duration);
                setAspect(v.videoWidth / v.videoHeight);
              }}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
          </div>

          <div className="flex w-full max-w-2xl items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
            <Button
              variant="primary"
              size="icon"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                if (v.paused) void v.play();
                else v.pause();
              }}
            >
              {playing ? "❚❚" : "▶"}
            </Button>
            <span className="font-mono text-[11px] text-muted-foreground">{time.toFixed(1)}s</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.02}
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Seek"
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
            />
            <span className="font-mono text-[11px] text-muted-foreground">{(duration || 0).toFixed(1)}s</span>
          </div>

          {status.error && (
            <p className="max-w-xl rounded-lg bg-destructive/12 px-4 py-2.5 text-center text-xs text-destructive">
              {status.error}
            </p>
          )}
        </main>

        {/* right: transcript */}
        <aside className="hidden w-[330px] shrink-0 border-l border-border lg:block">
          <TranscriptPanel
            blocks={blocks}
            currentTime={time}
            onSeek={seek}
            onEditWord={editWord}
            onDeleteWord={deleteWord}
            onRewriteBlock={rewriteBlock}
            onShiftBlock={shiftBlock}
            onDeleteBlock={deleteBlock}
            onAddBlock={addBlock}
          />
        </aside>
      </div>

      {mobilePanel && (
        <div className="fixed inset-0 z-40 flex items-end bg-background/70 lg:hidden" role="dialog" aria-modal="true" aria-label={mobilePanel === "design" ? "Caption styles" : "Edit captions"}>
          <div className="max-h-[82vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-background p-4 shadow-[var(--shadow-lift)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold">{mobilePanel === "design" ? "Caption style" : "Edit captions"}</h2>
              <Button variant="ghost" size="icon" onClick={() => setMobilePanel(null)} aria-label="Close panel">✕</Button>
            </div>
            {mobilePanel === "design" ? (
              <>
                <div className="mb-3 flex gap-2">
                  <Button variant={tab === "presets" ? "primary" : "outline"} size="sm" onClick={() => setTab("presets")}>Designs</Button>
                  <Button variant={tab === "design" ? "primary" : "outline"} size="sm" onClick={() => setTab("design")}>Fine-tune</Button>
                </div>
                {tab === "presets" ? <PresetGallery activeId={presetId} onPick={(p) => { setPresetId(p.id); setStyle(p.style); }} /> : <DesignPanel style={style} onChange={patch} />}
              </>
            ) : (
              <TranscriptPanel blocks={blocks} currentTime={time} onSeek={seek} onEditWord={editWord} onDeleteWord={deleteWord} onRewriteBlock={rewriteBlock} onShiftBlock={shiftBlock} onDeleteBlock={deleteBlock} onAddBlock={addBlock} />
            )}
          </div>
        </div>
      )}

      {showExport && (
        <ExportPanel file={file} blocks={blocks} style={style} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
}
