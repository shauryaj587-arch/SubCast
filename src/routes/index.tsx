import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CAPTION_PRESETS, DEFAULT_PRESET_ID } from "@/lib/captions/presets";
import type { CaptionStyle, CaptionWord, TranscriptLanguage } from "@/lib/captions/types";
import { generateSubtitles, groupIntoBlocks, retimeBlockText } from "@/lib/transcribe";
import { UploadStage } from "@/components/studio/UploadStage";
import { CaptionCanvas } from "@/components/studio/CaptionCanvas";
import { PresetGallery } from "@/components/studio/PresetGallery";
import { DesignPanel } from "@/components/studio/DesignPanel";
import { EditingToolsPanel } from "@/components/studio/EditingToolsPanel";
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

type StudioSnapshot = {
  words: CaptionWord[];
  clipRange: { start: number; end: number };
  bgMusicFile: File | null;
  bgMusicVolume: number;
  originalVolume: number;
  bgMusicLoop: boolean;
};

function Studio() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<TranscriptLanguage>("hinglish");
  const [words, setWords] = useState<CaptionWord[]>([]);
  const [clipRange, setClipRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const [originalWords, setOriginalWords] = useState<CaptionWord[]>([]);
  const [bgMusicFile, setBgMusicFile] = useState<File | null>(null);
  const [bgMusicVolume, setBgMusicVolume] = useState(0.3);
  const [originalVolume, setOriginalVolume] = useState(1.0);
  const [bgMusicLoop, setBgMusicLoop] = useState(true);

  // Unified global studio history (tracks captions, trim, music, volume, etc.)
  const [history, setHistory] = useState<{
    past: StudioSnapshot[];
    present: StudioSnapshot | null;
    future: StudioSnapshot[];
  }>({ past: [], present: null, future: [] });

  const historyRef = useRef<{
    past: StudioSnapshot[];
    present: StudioSnapshot | null;
    future: StudioSnapshot[];
  }>({ past: [], present: null, future: [] });

  const snapshotRef = useRef<StudioSnapshot>({
    words: [],
    clipRange: { start: 0, end: 0 },
    bgMusicFile: null,
    bgMusicVolume: 0.3,
    originalVolume: 1.0,
    bgMusicLoop: true,
  });

  const recordSnapshot = useCallback((patch: Partial<StudioSnapshot>) => {
    const prev = snapshotRef.current;
    const next: StudioSnapshot = {
      words: patch.words !== undefined ? patch.words : prev.words,
      clipRange: patch.clipRange !== undefined ? patch.clipRange : prev.clipRange,
      bgMusicFile: patch.bgMusicFile !== undefined ? patch.bgMusicFile : prev.bgMusicFile,
      bgMusicVolume: patch.bgMusicVolume !== undefined ? patch.bgMusicVolume : prev.bgMusicVolume,
      originalVolume:
        patch.originalVolume !== undefined ? patch.originalVolume : prev.originalVolume,
      bgMusicLoop: patch.bgMusicLoop !== undefined ? patch.bgMusicLoop : prev.bgMusicLoop,
    };
    snapshotRef.current = next;

    if (patch.words !== undefined) setWords(next.words);
    if (patch.clipRange !== undefined) setClipRange(next.clipRange);
    if (patch.bgMusicFile !== undefined) setBgMusicFile(next.bgMusicFile);
    if (patch.bgMusicVolume !== undefined) setBgMusicVolume(next.bgMusicVolume);
    if (patch.originalVolume !== undefined) setOriginalVolume(next.originalVolume);
    if (patch.bgMusicLoop !== undefined) setBgMusicLoop(next.bgMusicLoop);

    const h = historyRef.current;
    const past = h.present ? [...h.past, h.present] : h.past;
    const newPast = past.length > 50 ? past.slice(past.length - 50) : past;
    const newHistory = { past: newPast, present: next, future: [] };
    historyRef.current = newHistory;
    setHistory(newHistory);
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const bgMusicRef = useRef<HTMLAudioElement>(null);

  const applySnapshot = useCallback((target: StudioSnapshot) => {
    snapshotRef.current = target;
    setWords(target.words);
    setClipRange(target.clipRange);
    setBgMusicFile(target.bgMusicFile);
    setBgMusicVolume(target.bgMusicVolume);
    setOriginalVolume(target.originalVolume);
    setBgMusicLoop(target.bgMusicLoop);

    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = target.clipRange.start;
    }
    setTime(0);
    setPlaying(false);
    if (bgMusicRef.current) {
      bgMusicRef.current.pause();
      bgMusicRef.current.currentTime = 0;
    }
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const target = h.past[h.past.length - 1]!;
    const newPast = h.past.slice(0, h.past.length - 1);
    const newFuture = h.present ? [h.present, ...h.future] : h.future;

    const newHistory = { past: newPast, present: target, future: newFuture };
    historyRef.current = newHistory;
    setHistory(newHistory);
    applySnapshot(target);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const target = h.future[0]!;
    const newFuture = h.future.slice(1);
    const newPast = h.present ? [...h.past, h.present] : h.past;

    const newHistory = { past: newPast, present: target, future: newFuture };
    historyRef.current = newHistory;
    setHistory(newHistory);
    applySnapshot(target);
  }, [applySnapshot]);

  // Global keyboard shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y or Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const dispatchWords = useCallback(
    (action: CaptionWord[] | ((prev: CaptionWord[]) => CaptionWord[]), saveHistory = true) => {
      const prevWords = snapshotRef.current.words;
      const nextWords = typeof action === "function" ? action(prevWords) : action;
      if (nextWords === prevWords) return;

      if (saveHistory) {
        recordSnapshot({ words: nextWords });
      } else {
        snapshotRef.current.words = nextWords;
        setWords(nextWords);
      }
    },
    [recordSnapshot],
  );

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

  const [tab, setTab] = useState<"presets" | "design" | "tools">("presets");
  const [mobilePanel, setMobilePanel] = useState<"design" | "transcript" | null>(null);
  const [status, setStatus] = useState<{
    busy: boolean;
    value: number;
    label: string;
    error?: string;
  }>({
    busy: false,
    value: 0,
    label: "",
  });
  const [showExport, setShowExport] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [aspect, setAspect] = useState(9 / 16);

  const bgMusicUrl = useMemo(
    () => (bgMusicFile ? URL.createObjectURL(bgMusicFile) : null),
    [bgMusicFile],
  );

  useEffect(() => () => void (bgMusicUrl && URL.revokeObjectURL(bgMusicUrl)), [bgMusicUrl]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = originalVolume;
    }
  }, [originalVolume]);

  useEffect(() => {
    if (bgMusicRef.current) {
      bgMusicRef.current.volume = bgMusicVolume;
    }
  }, [bgMusicVolume]);

  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const blocks = useMemo(
    () => groupIntoBlocks(words, style.wordsPerBlock),
    [words, style.wordsPerBlock],
  );

  const clipDuration = useMemo(
    () => (clipRange.end > clipRange.start ? clipRange.end - clipRange.start : duration),
    [clipRange, duration],
  );

  const isTrimmedFromOriginal = useMemo(
    () =>
      duration > 0 &&
      (clipRange.start > 0.05 || (clipRange.end > 0 && clipRange.end < duration - 0.05)),
    [clipRange, duration],
  );

  const runTranscription = useCallback(
    async (f: File, lang: TranscriptLanguage) => {
      setStatus({ busy: true, value: 0.02, label: "Preparing" });
      try {
        const result = await generateSubtitles(f, lang, (value, label) =>
          setStatus({ busy: true, value, label }),
        );
        const initialSnap: StudioSnapshot = {
          words: result,
          clipRange:
            snapshotRef.current.clipRange.end > 0
              ? snapshotRef.current.clipRange
              : duration > 0
                ? { start: 0, end: duration }
                : { start: 0, end: 0 },
          bgMusicFile: snapshotRef.current.bgMusicFile,
          bgMusicVolume: snapshotRef.current.bgMusicVolume,
          originalVolume: snapshotRef.current.originalVolume,
          bgMusicLoop: snapshotRef.current.bgMusicLoop,
        };
        snapshotRef.current = initialSnap;
        historyRef.current = { past: [], present: initialSnap, future: [] };
        setWords(result);
        setOriginalWords(result);
        setHistory({ past: [], present: initialSnap, future: [] });
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
    [duration],
  );

  const start = useCallback(
    (f: File) => {
      setFile(f);
      setWords([]);
      setOriginalWords([]);
      setClipRange({ start: 0, end: 0 });
      setBgMusicFile(null);
      const cleanSnap: StudioSnapshot = {
        words: [],
        clipRange: { start: 0, end: 0 },
        bgMusicFile: null,
        bgMusicVolume: 0.3,
        originalVolume: 1.0,
        bgMusicLoop: true,
      };
      snapshotRef.current = cleanSnap;
      historyRef.current = { past: [], present: null, future: [] };
      setHistory({ past: [], present: null, future: [] });
      void runTranscription(f, language);
    },
    [language, runTranscription],
  );

  const patch = (p: Partial<CaptionStyle>) => setStyle((s) => ({ ...s, ...p }));

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    const target = Math.max(0, Math.min(t, clipDuration));
    v.currentTime = clipRange.start + target;
    setTime(target);
    if (bgMusicRef.current && bgMusicUrl) {
      const bg = bgMusicRef.current;
      const bgDur = bg.duration;
      if (bgDur && bgDur > 0) {
        bg.currentTime = bgMusicLoop ? target % bgDur : target;
      }
    }
  };

  const applyTrim = (cutStart: number, cutEnd: number) => {
    const currentClip = snapshotRef.current.clipRange;
    const actualStart = currentClip.start + cutStart;
    const actualEnd = currentClip.start + cutEnd;
    const currentWords = snapshotRef.current.words;
    const keptWords = currentWords
      .filter((w) => w.end > cutStart && w.start < cutEnd)
      .map((w) => ({
        ...w,
        start: Math.max(0, w.start - cutStart),
        end: Math.max(0.05, w.end - cutStart),
      }));

    recordSnapshot({
      clipRange: { start: actualStart, end: actualEnd },
      words: keptWords,
    });

    // Pause and jump video player to the new start
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = actualStart;
    }
    setTime(0);
    setPlaying(false);
    if (bgMusicRef.current) {
      bgMusicRef.current.pause();
      bgMusicRef.current.currentTime = 0;
    }
  };

  const resetToOriginal = () => {
    recordSnapshot({
      clipRange: { start: 0, end: duration },
      words: originalWords.length > 0 ? originalWords : snapshotRef.current.words,
    });
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
    setTime(0);
    setPlaying(false);
    if (bgMusicRef.current) {
      bgMusicRef.current.pause();
      bgMusicRef.current.currentTime = 0;
    }
  };

  const handleBgMusicFileChange = useCallback(
    (f: File | null) => {
      recordSnapshot({ bgMusicFile: f });
    },
    [recordSnapshot],
  );

  const handleBgMusicVolumeChange = useCallback((vol: number) => {
    snapshotRef.current.bgMusicVolume = vol;
    setBgMusicVolume(vol);
  }, []);

  const handleOriginalVolumeChange = useCallback((vol: number) => {
    snapshotRef.current.originalVolume = vol;
    setOriginalVolume(vol);
  }, []);

  const handleBgMusicLoopChange = useCallback(
    (loop: boolean) => {
      recordSnapshot({ bgMusicLoop: loop });
    },
    [recordSnapshot],
  );

  const editWord = (id: string, text: string, saveHistory = true) =>
    dispatchWords((ws) => ws.map((w) => (w.id === id ? { ...w, text } : w)), saveHistory);

  const deleteWord = (id: string) => dispatchWords((ws) => ws.filter((w) => w.id !== id));

  const rewriteBlock = (blockId: string, text: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const replacement = retimeBlockText(block, text);
    dispatchWords((ws) => {
      const firstIdx = ws.findIndex((w) => w.id === block.words[0]!.id);
      if (firstIdx < 0) return ws;
      return [...ws.slice(0, firstIdx), ...replacement, ...ws.slice(firstIdx + block.words.length)];
    });
  };

  const shiftBlock = (blockId: string, delta: number) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const ids = new Set(block.words.map((w) => w.id));
    dispatchWords((ws) =>
      ws.map((w) =>
        ids.has(w.id)
          ? { ...w, start: Math.max(0, w.start + delta), end: Math.max(0.1, w.end + delta) }
          : w,
      ),
    );
  };

  const deleteBlock = (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const ids = new Set(block.words.map((w) => w.id));
    dispatchWords((ws) => ws.filter((w) => !ids.has(w.id)));
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
    dispatchWords((ws) => [...ws, ...fresh].sort((a, b) => a.start - b.start));
  };

  const bulkReplace = (find: string, replace: string) => {
    if (!find) return;
    dispatchWords((ws) =>
      ws.map((w) => {
        if (w.text.toLowerCase().includes(find.toLowerCase())) {
          // Case insensitive replacement
          const reg = new RegExp(find, "gi");
          return { ...w, text: w.text.replace(reg, replace) };
        }
        return w;
      }),
    );
  };

  if (!file || !url) {
    return <UploadStage language={language} onLanguage={setLanguage} onFile={start} />;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex items-center gap-4">
          <Logo />
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <span className="max-w-[220px] truncate text-xs text-muted-foreground">
              {file.name}
            </span>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runTranscription(file, language)}
            disabled={status.busy}
          >
            Re-transcribe
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFile(null);
              setWords([]);
              setOriginalWords([]);
              setClipRange({ start: 0, end: 0 });
              setBgMusicFile(null);
            }}
          >
            New video
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setMobilePanel("design")}
          >
            Style
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setMobilePanel("transcript")}
            disabled={!words.length}
          >
            Captions
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowExport(true)}
            disabled={!words.length || status.busy}
          >
            Export
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* left: designs & tools */}
        <aside className="hidden w-[310px] shrink-0 flex-col border-r border-border lg:flex">
          <div className="flex gap-1 border-b border-border p-2.5">
            {[
              { id: "presets", label: "Designs" },
              { id: "design", label: "Fine-tune" },
              { id: "tools", label: "Editing tools" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as "presets" | "design" | "tools")}
                className={cn(
                  "flex-1 truncate rounded-lg px-2 py-1.5 text-xs font-medium capitalize transition-colors text-center",
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-surface-2",
                )}
              >
                {t.label}
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
            ) : tab === "design" ? (
              <DesignPanel style={style} onChange={patch} />
            ) : (
              <EditingToolsPanel
                clipDuration={clipDuration}
                isTrimmedFromOriginal={isTrimmedFromOriginal}
                onApplyTrim={applyTrim}
                onResetToOriginal={resetToOriginal}
                onSeek={seek}
                bgMusicFile={bgMusicFile}
                bgMusicVolume={bgMusicVolume}
                originalVolume={originalVolume}
                bgMusicLoop={bgMusicLoop}
                onBgMusicFileChange={handleBgMusicFileChange}
                onBgMusicVolumeChange={handleBgMusicVolumeChange}
                onOriginalVolumeChange={handleOriginalVolumeChange}
                onBgMusicLoopChange={handleBgMusicLoopChange}
              />
            )}
          </div>
        </aside>

        {/* center: preview */}
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 p-4">
          <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
            <div className="relative h-full max-h-full">
              <CaptionCanvas
                videoRef={videoRef}
                blocks={blocks}
                style={style}
                aspect={aspect}
                clipStart={clipRange.start}
                onChangeStyle={patch}
              />
              {status.busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/78 backdrop-blur-sm">
                  <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${status.value * 100}%` }}
                    />
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
                setClipRange((prev) => {
                  const next =
                    prev.end === 0 || prev.end > v.duration ? { start: 0, end: v.duration } : prev;
                  snapshotRef.current.clipRange = next;
                  if (
                    historyRef.current.present &&
                    historyRef.current.present.clipRange.end === 0
                  ) {
                    historyRef.current.present.clipRange = next;
                  }
                  return next;
                });
                setAspect(v.videoWidth / v.videoHeight);
              }}
              onTimeUpdate={(e) => {
                const raw = e.currentTarget.currentTime;
                if (clipRange.end > 0 && raw >= clipRange.end) {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = clipRange.start;
                  setTime(0);
                  setPlaying(false);
                  if (bgMusicRef.current) {
                    bgMusicRef.current.pause();
                    bgMusicRef.current.currentTime = 0;
                  }
                } else if (raw < clipRange.start) {
                  e.currentTarget.currentTime = clipRange.start;
                  setTime(0);
                } else {
                  setTime(Math.max(0, Math.min(clipDuration, raw - clipRange.start)));
                }
              }}
              onPlay={() => {
                setPlaying(true);
                if (bgMusicRef.current && bgMusicUrl) {
                  const bg = bgMusicRef.current;
                  bg.volume = bgMusicVolume;
                  const bgDur = bg.duration;
                  if (bgDur && bgDur > 0) {
                    const rel = Math.max(0, (videoRef.current?.currentTime ?? 0) - clipRange.start);
                    bg.currentTime = bgMusicLoop ? rel % bgDur : rel;
                  }
                  void bg.play().catch(() => {});
                }
              }}
              onPause={() => {
                setPlaying(false);
                bgMusicRef.current?.pause();
              }}
            />
            {bgMusicUrl && (
              <audio
                ref={bgMusicRef}
                src={bgMusicUrl}
                loop={bgMusicLoop}
                preload="auto"
                className="pointer-events-none absolute h-px w-px opacity-0"
              />
            )}
          </div>

          <div className="flex w-full max-w-2xl items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
            <Button
              variant="primary"
              size="icon"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                if (v.paused) {
                  if (
                    clipRange.end > 0 &&
                    (v.currentTime >= clipRange.end || v.currentTime < clipRange.start)
                  ) {
                    v.currentTime = clipRange.start;
                    setTime(0);
                  }
                  void v.play();
                } else {
                  v.pause();
                }
              }}
            >
              {playing ? "❚❚" : "▶"}
            </Button>
            <span className="font-mono text-[11px] text-muted-foreground">{time.toFixed(1)}s</span>
            <input
              type="range"
              min={0}
              max={clipDuration || 0}
              step={0.02}
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Seek"
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
            />
            <span className="font-mono text-[11px] text-muted-foreground">
              {(clipDuration || 0).toFixed(1)}s
            </span>
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
            onUndo={undo}
            onRedo={redo}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            onBulkReplace={bulkReplace}
          />
        </aside>
      </div>

      {mobilePanel && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-background/70 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={mobilePanel === "design" ? "Caption styles" : "Edit captions"}
        >
          <div className="max-h-[82vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-background p-4 shadow-[var(--shadow-lift)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold">
                {mobilePanel === "design" ? "Caption style" : "Edit captions"}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobilePanel(null)}
                aria-label="Close panel"
              >
                ✕
              </Button>
            </div>
            {mobilePanel === "design" ? (
              <>
                <div className="mb-3 flex gap-2">
                  <Button
                    variant={tab === "presets" ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setTab("presets")}
                  >
                    Designs
                  </Button>
                  <Button
                    variant={tab === "design" ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setTab("design")}
                  >
                    Fine-tune
                  </Button>
                  <Button
                    variant={tab === "tools" ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setTab("tools")}
                  >
                    Tools
                  </Button>
                </div>
                {tab === "presets" ? (
                  <PresetGallery
                    activeId={presetId}
                    onPick={(p) => {
                      setPresetId(p.id);
                      setStyle(p.style);
                    }}
                  />
                ) : tab === "design" ? (
                  <DesignPanel style={style} onChange={patch} />
                ) : (
                  <EditingToolsPanel
                    clipDuration={clipDuration}
                    isTrimmedFromOriginal={isTrimmedFromOriginal}
                    onApplyTrim={applyTrim}
                    onResetToOriginal={resetToOriginal}
                    onSeek={seek}
                    bgMusicFile={bgMusicFile}
                    bgMusicVolume={bgMusicVolume}
                    originalVolume={originalVolume}
                    bgMusicLoop={bgMusicLoop}
                    onBgMusicFileChange={handleBgMusicFileChange}
                    onBgMusicVolumeChange={handleBgMusicVolumeChange}
                    onOriginalVolumeChange={handleOriginalVolumeChange}
                    onBgMusicLoopChange={handleBgMusicLoopChange}
                  />
                )}
              </>
            ) : (
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
                onUndo={undo}
                onRedo={redo}
                canUndo={history.past.length > 0}
                canRedo={history.future.length > 0}
                onBulkReplace={bulkReplace}
              />
            )}
          </div>
        </div>
      )}

      {showExport && (
        <ExportPanel
          file={file}
          blocks={blocks}
          style={style}
          trimStart={clipRange.start}
          trimEnd={clipRange.end || duration}
          duration={duration}
          bgMusicFile={bgMusicFile}
          bgMusicVolume={bgMusicVolume}
          originalVolume={originalVolume}
          bgMusicLoop={bgMusicLoop}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
