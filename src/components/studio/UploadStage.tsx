import { useCallback, useRef, useState } from "react";
import { Logo } from "./Logo";
import { Button } from "./ui";
import type { TranscriptLanguage } from "@/lib/captions/types";

const LANGS: { value: TranscriptLanguage; label: string; hint: string }[] = [
  { value: "en", label: "English", hint: "Latin script" },
  { value: "hi", label: "हिन्दी", hint: "Devanagari" },
  { value: "hinglish", label: "Hinglish", hint: "Roman Hindi + English" },
];

export function UploadStage({
  language,
  onLanguage,
  onFile,
}: {
  language: TranscriptLanguage;
  onLanguage: (l: TranscriptLanguage) => void;
  onFile: (f: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        setError("That file isn't a video. Upload an MP4, MOV or WebM reel.");
        return;
      }
      if (file.size > 400 * 1024 * 1024) {
        setError("Keep it under 400 MB — reels render much faster that way.");
        return;
      }
      setError(null);
      onFile(file);
    },
    [onFile],
  );

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-noise opacity-60" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] glow-bg" aria-hidden="true" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <span className="rounded-full border border-border bg-surface/60 px-3 py-1 text-[11px] text-muted-foreground">
          Auto subtitles · Hindi · English · Hinglish
        </span>
      </header>

      <section className="relative mx-auto max-w-3xl px-6 pb-24 pt-10 text-center">
        <p className="animate-rise text-xs font-medium uppercase tracking-[0.24em] text-primary">
          Subtitles, nothing else
        </p>
        <h1 className="animate-rise mt-5 font-display text-[clamp(2.4rem,6vw,4.1rem)] font-bold leading-[1.02] tracking-tight">
          Auto subtitles that make
          <br />
          <span className="text-gradient-lime">reels stop the scroll</span>
        </h1>
        <p className="animate-rise mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Drop a reel, get precise captions in seconds. Pick from a library of animated
          caption designs, fine-tune every word, then export a burned-in MP4 with enhanced quality.
        </p>

        <div className="animate-rise mx-auto mt-9 max-w-md">
          <div className="mb-3 text-left text-xs text-muted-foreground">Spoken language</div>
          <div className="grid grid-cols-3 gap-2">
            {LANGS.map((l) => (
              <button
                key={l.value}
                onClick={() => onLanguage(l.value)}
                className={`rounded-xl border px-3 py-3 text-left transition-all duration-200 ${
                  language === l.value
                    ? "border-primary/60 bg-primary/10 shadow-[var(--shadow-glow)]"
                    : "border-border bg-surface hover:bg-surface-2"
                }`}
              >
                <div className="text-sm font-semibold">{l.label}</div>
                <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{l.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files[0]);
          }}
          className={`animate-rise mt-6 rounded-2xl border border-dashed p-10 transition-all duration-300 ${
            dragging ? "border-primary bg-primary/8 scale-[1.01]" : "border-border bg-surface/50"
          }`}
        >
          <button
            type="button"
            aria-label="Import video"
            onClick={() => inputRef.current?.click()}
            className="mx-auto mb-4 flex h-12 w-12 animate-pulse-ring cursor-pointer items-center justify-center rounded-full bg-primary/15 transition-colors hover:bg-primary/25"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M12 16V4m0 0L7 9m5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
            </svg>
          </button>

          <p className="text-sm font-medium">Drag your reel here</p>
          <p className="mt-1 text-xs text-muted-foreground">MP4, MOV or WebM · up to 400 MB · stays on your device</p>
          <Button variant="primary" size="lg" className="mt-6" onClick={() => inputRef.current?.click()}>
            Import video
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => accept(e.target.files?.[0])}
          />
          {error && <p className="mt-4 text-xs text-destructive">{error}</p>}
        </div>

        <ul className="mx-auto mt-10 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
          {[
            ["Caption designs", "Word pop, typewriter, bold highlight and more"],
            ["Edit every word", "Fix spellings, rewrite lines, retime blocks"],
            ["Enhanced export", "Burned-in MP4 up to 2K, or download SRT / VTT"],
          ].map(([title, body]) => (
            <li key={title} className="panel p-4">
              <div className="text-xs font-semibold">{title}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{body}</div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
