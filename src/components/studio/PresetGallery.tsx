import { useMemo, useState } from "react";
import { CAPTION_PRESETS } from "@/lib/captions/presets";
import type { CaptionPreset } from "@/lib/captions/types";
import { cn } from "@/lib/utils";

const GROUPS = ["All", "Trending", "Bold", "Clean", "Playful", "Editorial"] as const;

export function PresetGallery({
  activeId,
  onPick,
}: {
  activeId: string;
  onPick: (p: CaptionPreset) => void;
}) {
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("All");
  const list = useMemo(
    () => (group === "All" ? CAPTION_PRESETS : CAPTION_PRESETS.filter((p) => p.group === group)),
    [group],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              group === g ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {list.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className={cn(
              "group relative overflow-hidden rounded-xl border p-3 text-center transition-all duration-200",
              activeId === p.id
                ? "border-primary/70 bg-primary/8 shadow-[var(--shadow-glow)]"
                : "border-border bg-surface hover:border-border hover:bg-surface-2",
            )}
          >
            <div className="flex h-12 items-center justify-center">
              <PresetSample preset={p} />
            </div>
            <div className="mt-2 truncate text-[11px] font-medium text-foreground/85">{p.name}</div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{p.style.animation}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PresetSample({ preset }: { preset: CaptionPreset }) {
  const s = preset.style;
  const common = {
    fontFamily: `"${s.fontFamily}", Inter, sans-serif`,
    fontWeight: s.fontWeight,
    textTransform: s.uppercase ? ("uppercase" as const) : ("none" as const),
    WebkitTextStroke: s.strokeWidth > 0 ? `${Math.min(2, s.strokeWidth * 12)}px ${s.strokeColor}` : undefined,
    paintOrder: "stroke fill" as const,
  };
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 px-1 text-[13px] leading-tight"
      style={{
        ...common,
        background: s.blockBg ?? undefined,
        borderRadius: s.blockBg ? 6 : undefined,
        padding: s.blockBg ? "3px 6px" : undefined,
      }}
    >
      <span style={{ color: s.textColor }}>Your</span>
      <span
        style={{
          color: s.highlight === "box" && s.activeBg ? s.activeColor : s.activeColor,
          background: s.highlight === "box" && s.activeBg ? s.activeBg : undefined,
          borderRadius: 4,
          padding: s.highlight === "box" ? "0 3px" : undefined,
          borderBottom: s.highlight === "underline" ? `2px solid ${s.activeColor}` : undefined,
        }}
      >
        words
      </span>
      <span style={{ color: s.textColor }}>here</span>
    </div>
  );
}
