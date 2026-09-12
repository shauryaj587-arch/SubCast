import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "ghost" | "outline" | "subtle" | "danger";
    size?: "sm" | "md" | "lg" | "icon";
  }
>(function Button({ className, variant = "subtle", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium tracking-tight transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-[15px]",
        size === "icon" && "h-9 w-9",
        variant === "primary" &&
          "bg-primary text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110 active:scale-[0.98]",
        variant === "subtle" && "bg-surface-2 text-foreground hover:bg-surface-3",
        variant === "outline" && "border border-border bg-transparent text-foreground hover:bg-surface-2",
        variant === "ghost" && "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        variant === "danger" && "bg-destructive/15 text-destructive hover:bg-destructive/25",
        className,
      )}
      {...props}
    />
  );
});

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-[11px] text-foreground/80">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-primary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_oklch(0.9_0.2_122_/_15%)]"
      />
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
    >
      {children}
    </select>
  );
}

export function ColorInput({
  label,
  value,
  onChange,
  allowNone,
  allowGradient,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  allowNone?: boolean;
  allowGradient?: boolean;
}) {
  const active = value ?? "#000000";
  const isGradient = active.startsWith("linear-gradient");
  
  // Quick parser for simple linear-gradient(90deg, #color1, #color2)
  const getGradientColors = (val: string) => {
    const match = val.match(/linear-gradient\([^,]+,\s*(#[a-fA-F0-9]{6}),\s*(#[a-fA-F0-9]{6})\)/);
    if (match) return [match[1], match[2]];
    return ["#ffffff", "#000000"];
  };

  const [c1, c2] = isGradient ? getGradientColors(active) : [toHex(active), toHex(active)];

  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          {allowNone && (
            <button
              onClick={() => onChange(value ? null : "#000000")}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                value ? "bg-surface-2 text-muted-foreground" : "bg-primary text-primary-foreground",
              )}
            >
              OFF
            </button>
          )}
          
          {allowGradient && value && (
            <button
              onClick={() => {
                if (isGradient) {
                  onChange(c1);
                } else {
                  onChange(`linear-gradient(90deg, ${c1}, #cccccc)`);
                }
              }}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                isGradient ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground",
              )}
            >
              GRADIENT
            </button>
          )}

          {!isGradient && value && (
            <input
              type="color"
              value={c1}
              onChange={(e) => onChange(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
            />
          )}
          
          {isGradient && value && (
            <div className="flex items-center gap-1">
              <input
                type="color"
                value={c1}
                onChange={(e) => onChange(`linear-gradient(90deg, ${e.target.value}, ${c2})`)}
                className="h-7 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
              />
              <input
                type="color"
                value={c2}
                onChange={(e) => onChange(`linear-gradient(90deg, ${c1}, ${e.target.value})`)}
                className="h-7 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function toHex(v: string) {
  if (!v) return "#000000";
  if (v.startsWith("#")) return v.slice(0, 7);
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return "#000000";
  const [r, g, b] = m[1]!.split(",").map((n) => Number(n.trim()));
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n || 0))).toString(16).padStart(2, "0");
  return `#${h(r!)}${h(g!)}${h(b!)}`;
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring",
        props.className,
      )}
    />
  );
}
