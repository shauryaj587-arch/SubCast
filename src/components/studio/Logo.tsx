export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="9" fill="oklch(0.23 0.01 275)" stroke="oklch(1 0 0 / 12%)" />
        <rect x="7" y="12" width="18" height="3.2" rx="1.6" fill="oklch(0.9 0.2 122)" />
        <rect x="7" y="18" width="11" height="3.2" rx="1.6" fill="oklch(0.96 0.004 275 / 55%)" />
        <circle cx="22.5" cy="19.6" r="1.8" fill="oklch(0.9 0.2 122)" />
      </svg>
      <span className="font-display text-[15px] font-bold tracking-tight">
        Sub<span className="text-primary">Cast</span>
      </span>
    </div>
  );
}
