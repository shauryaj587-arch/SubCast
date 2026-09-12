import { FONT_OPTIONS } from "@/lib/captions/presets";
import type { CaptionAnimation, CaptionBlockAnimation, CaptionStyle, HighlightMode } from "@/lib/captions/types";
import { Button, ColorInput, Field, Segmented, Select, Slider } from "./ui";

const ANIMATIONS: { value: CaptionAnimation; label: string }[] = [
  { value: "none", label: "Normal" },
  { value: "word", label: "Word highlight" },
  { value: "typewriter", label: "Typewriter" },
  { value: "pop", label: "Pop" },
  { value: "fade", label: "Fade in" },
  { value: "shake", label: "Shake" },
  { value: "bounce", label: "Bounce" },
  { value: "slide", label: "Slide up" },
  { value: "flip", label: "Flip in" },
];

const HIGHLIGHTS: { value: HighlightMode; label: string }[] = [
  { value: "color", label: "Color" },
  { value: "box", label: "Box" },
  { value: "underline", label: "Underline" },
  { value: "scale", label: "Scale" },
];

const BLOCK_ANIMATIONS: { value: CaptionBlockAnimation; label: string }[] = [
  { value: "none", label: "No effect" },
  { value: "pop", label: "Pop" },
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide up" },
  { value: "zoom", label: "Soft zoom" },
];

export function DesignPanel({
  style,
  onChange,
}: {
  style: CaptionStyle;
  onChange: (patch: Partial<CaptionStyle>) => void;
}) {
  return (
    <div className="space-y-5">
      <Field label="Font">
        <Select value={style.customFontName ? "CUSTOM" : style.fontFamily} onChange={(v) => {
          if (v !== "CUSTOM") onChange({ fontFamily: v, customFontUrl: null, customFontName: null });
        }}>
          {style.customFontName && <option value="CUSTOM">{style.customFontName} (Custom)</option>}
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        
        <label className="mt-2 flex w-full items-center justify-center gap-2 h-8 rounded border border-dashed border-border bg-surface text-xs text-muted-foreground hover:bg-surface-2 cursor-pointer transition-colors">
          <input 
            type="file" 
            accept=".ttf,.otf,.woff,.woff2" 
            className="hidden" 
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                const url = URL.createObjectURL(file);
                // Extract font name without extension
                const fontName = file.name.split('.').slice(0, -1).join('.');
                
                // Load font dynamically
                try {
                  const font = new FontFace(fontName, `url(${url})`);
                  await font.load();
                  document.fonts.add(font);
                  onChange({ fontFamily: fontName, customFontUrl: url, customFontName: fontName });
                } catch (err) {
                  alert("Failed to load custom font!");
                }
              }
            }} 
          />
          Upload Custom Font (.ttf)
        </label>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight">
          <Select value={String(style.fontWeight)} onChange={(v) => onChange({ fontWeight: Number(v) })}>
            {[400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Case">
          <Segmented
            value={style.uppercase ? "upper" : "normal"}
            onChange={(v) => onChange({ uppercase: v === "upper" })}
            options={[
              { value: "normal", label: "Aa" },
              { value: "upper", label: "AA" },
            ]}
          />
        </Field>
      </div>

      <Slider label="Size" value={style.fontSize * 100} min={2.4} max={12} step={0.1} suffix="%" onChange={(v) => onChange({ fontSize: v / 100 })} />
      <Slider label="Words per line block" value={style.wordsPerBlock} min={1} max={10} onChange={(v) => onChange({ wordsPerBlock: v })} />
      <Slider label="Vertical position" value={style.positionY * 100} min={10} max={94} suffix="%" onChange={(v) => onChange({ positionY: v / 100 })} />
      <Slider label="Max width" value={style.maxWidth * 100} min={40} max={96} suffix="%" onChange={(v) => onChange({ maxWidth: v / 100 })} />
      <Slider label="Letter spacing" value={style.letterSpacing * 100} min={0} max={8} step={0.1} onChange={(v) => onChange({ letterSpacing: v / 100 })} />
      <Slider label="Line height" value={style.lineHeight} min={0.9} max={1.8} step={0.02} onChange={(v) => onChange({ lineHeight: v })} />

      <div className="h-px bg-border" />

      <Field label="Animation">
        <Select value={style.animation} onChange={(v) => onChange({ animation: v as CaptionAnimation })}>
          {ANIMATIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="New subtitle box">
        <Select
          value={style.blockAnimation}
          onChange={(v) => onChange({ blockAnimation: v as CaptionBlockAnimation })}
        >
          {BLOCK_ANIMATIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Active word style">
        <Select value={style.highlight} onChange={(v) => onChange({ highlight: v as HighlightMode })}>
          {HIGHLIGHTS.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="h-px bg-border" />

      <div className="space-y-2.5">
        <ColorInput label="Text color" value={style.textColor} onChange={(v) => onChange({ textColor: v ?? "#FFFFFF" })} allowGradient />
        <ColorInput label="Active word" value={style.activeColor} onChange={(v) => onChange({ activeColor: v ?? "#C6F24E" })} allowGradient />
        <ColorInput label="Highlight box" value={style.activeBg} onChange={(v) => onChange({ activeBg: v })} allowNone allowGradient />
        <ColorInput label="Backdrop plate" value={style.blockBg} onChange={(v) => onChange({ blockBg: v })} allowNone allowGradient />
        <ColorInput label="Outline" value={style.strokeColor} onChange={(v) => onChange({ strokeColor: v ?? "#000000" })} />
      </div>

      {style.blockBg && (
        <div className="space-y-4 rounded-lg border border-border bg-surface/50 p-3">
          <div className="text-xs font-medium text-foreground">Backdrop spacing</div>
          <Slider
            label="Horizontal padding"
            value={((style.blockPaddingX ?? style.blockPadding * (style.blockPaddingXRatio ?? 1.7)) / style.fontSize) * 100}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) => onChange({ blockPaddingX: style.fontSize * (v / 100) })}
          />
          <Slider
            label="Vertical padding"
            value={(style.blockPadding / style.fontSize) * 100}
            min={0}
            max={80}
            step={1}
            suffix="%"
            onChange={(v) => onChange({ blockPadding: style.fontSize * (v / 100) })}
          />
        </div>
      )}

      <Slider label="Outline width" value={style.strokeWidth * 100} min={0} max={22} step={0.5} onChange={(v) => onChange({ strokeWidth: v / 100 })} />
      <Slider label="Shadow blur" value={style.shadowBlur * 100} min={0} max={60} onChange={(v) => onChange({ shadowBlur: v / 100 })} />

      <div className="h-px bg-border" />
      
      <div className="space-y-3">
        <div className="text-sm font-medium text-foreground">Watermark / Logo</div>
        <div className="flex items-center gap-2">
          {style.watermarkUrl ? (
             <div className="flex-1 flex items-center justify-between bg-surface rounded-lg p-2 border border-border">
                <img src={style.watermarkUrl} alt="Logo" className="h-8 max-w-[80px] object-contain" />
                <Button variant="danger" size="sm" onClick={() => onChange({ watermarkUrl: null })}>Remove</Button>
             </div>
          ) : (
            <label className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg border border-dashed border-border bg-surface text-sm text-muted-foreground hover:bg-surface-2 cursor-pointer transition-colors">
              <input 
                type="file" 
                accept="image/png, image/jpeg, image/svg+xml" 
                className="hidden" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    onChange({ watermarkUrl: url, watermarkOpacity: style.watermarkOpacity ?? 1, watermarkX: style.watermarkX ?? 0.04, watermarkY: style.watermarkY ?? 0.04, watermarkSize: style.watermarkSize ?? 0.1 });
                  }
                }} 
              />
              Upload Logo
            </label>
          )}
        </div>
        
        {style.watermarkUrl && (
          <div className="space-y-4 rounded-lg border border-border bg-surface/50 p-3 mt-2">
            <Slider label="Opacity" value={(style.watermarkOpacity ?? 1) * 100} min={10} max={100} step={1} suffix="%" onChange={(v) => onChange({ watermarkOpacity: v / 100 })} />
          </div>
        )}
      </div>
    </div>
  );
}
