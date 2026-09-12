import { useMemo, useState, useEffect } from "react";
import type { CaptionBlock } from "@/lib/captions/types";
import { Button, TextInput } from "./ui";
import { cn } from "@/lib/utils";

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

export function TranscriptPanel({
  blocks,
  currentTime,
  onSeek,
  onRewriteBlock,
  onEditWord,
  onDeleteWord,
  onShiftBlock,
  onDeleteBlock,
  onAddBlock,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onBulkReplace,
}: {
  blocks: CaptionBlock[];
  currentTime: number;
  onSeek: (t: number) => void;
  onRewriteBlock: (blockId: string, text: string) => void;
  onEditWord: (wordId: string, text: string, saveHistory?: boolean) => void;
  onDeleteWord: (wordId: string) => void;
  onShiftBlock: (blockId: string, delta: number) => void;
  onDeleteBlock: (blockId: string) => void;
  onAddBlock: (afterBlockId: string | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onBulkReplace: (find: string, replace: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [mode, setMode] = useState<"words" | "lines">("words");

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          onRedo();
        } else {
          e.preventDefault();
          onUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onRedo]);
  
  const activeId = useMemo(() => {
    const b = blocks.find((x) => currentTime >= x.start - 0.05 && currentTime <= x.end + 0.1);
    return b?.id ?? null;
  }, [blocks, currentTime]);

  const filtered = query
    ? blocks.filter((b) => b.words.some((w) => w.text.toLowerCase().includes(query.toLowerCase())))
    : blocks;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button onClick={onUndo} disabled={!canUndo} className="p-1.5 text-foreground/70 hover:text-white disabled:opacity-30 transition-colors" title="Undo (Ctrl+Z)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            </button>
            <button onClick={onRedo} disabled={!canRedo} className="p-1.5 text-foreground/70 hover:text-white disabled:opacity-30 transition-colors" title="Redo (Ctrl+Y)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
            </button>
          </div>
          <div className="flex shrink-0 gap-1 rounded-lg bg-surface p-1">
            {(["words", "lines"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors",
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <TextInput placeholder="Search words…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button variant="outline" size="sm" onClick={() => setShowReplace(!showReplace)} className="text-xs shrink-0">
            {showReplace ? "Close" : "Replace"}
          </Button>
        </div>

        {showReplace && (
          <div className="flex items-center gap-2 mt-1">
            <TextInput placeholder="Replace with…" value={replaceText} onChange={(e) => setReplaceText(e.target.value)} />
            <Button variant="primary" size="sm" onClick={() => { onBulkReplace(query, replaceText); setReplaceText(""); }} disabled={!query} className="text-xs shrink-0">
              Replace All
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {filtered.map((block) => (
          <div
            key={block.id}
            className={cn(
              "rounded-xl border p-2.5 transition-colors",
              activeId === block.id ? "border-primary/60 bg-primary/8" : "border-border bg-surface",
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                onClick={() => onSeek(block.start)}
                aria-label={`Seek to ${fmt(block.start)}`}
                className="font-mono text-[10px] text-muted-foreground transition-colors hover:text-primary"
              >
                {fmt(block.start)} → {fmt(block.end)}
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onShiftBlock(block.id, -0.1)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  title="Shift 100ms earlier"
                >
                  −.1s
                </button>
                <button
                  onClick={() => onShiftBlock(block.id, 0.1)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  title="Shift 100ms later"
                >
                  +.1s
                </button>
                <button
                  onClick={() => onDeleteBlock(block.id)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                >
                  Del
                </button>
              </div>
            </div>

            {mode === "words" ? (
              <div className="flex flex-wrap items-center gap-1">
                {block.words.map((w) => (
                  <input
                    key={w.id}
                    value={w.text}
                    onChange={(e) => onEditWord(w.id, e.target.value, false)}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) {
                        onDeleteWord(w.id);
                      } else {
                        onEditWord(w.id, e.target.value, true);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                      if (e.key === "Backspace" && !w.text) {
                        e.preventDefault();
                        onDeleteWord(w.id);
                      }
                    }}
                    onFocus={() => onSeek(w.start)}
                    aria-label={`Edit caption word ${w.text}`}
                    size={Math.max(2, w.text.length)}
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[13px] outline-none transition-colors",
                      currentTime >= w.start && currentTime <= w.end
                        ? "border-primary/70 bg-primary/15 text-foreground"
                        : "border-transparent bg-surface-2 text-foreground/85 hover:border-border focus:border-primary/60",
                    )}
                  />
                ))}
                <button
                  onClick={() => onAddBlock(block.id)}
                  className="rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
                  title="Add caption after this block"
                >
                  +
                </button>
              </div>
            ) : (
              <textarea
                defaultValue={block.words.map((w) => w.text).join(" ")}
                key={block.words.map((w) => w.id).join("-")}
                onBlur={(e) => onRewriteBlock(block.id, e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-border bg-surface-2 p-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
              />
            )}
          </div>
        ))}

        {!filtered.length && (
          <p className="py-10 text-center text-xs text-muted-foreground">
            {query ? "No captions match that search." : "No captions yet."}
          </p>
        )}
      </div>

      <div className="border-t border-border p-3">
        <Button variant="outline" size="sm" className="w-full" onClick={() => onAddBlock(blocks[blocks.length - 1]?.id ?? null)}>
          + New Caption
        </Button>
      </div>
    </div>
  );
}
