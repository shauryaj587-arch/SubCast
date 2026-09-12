import { useEffect, useRef, useState } from "react";
import { drawCaptions } from "@/lib/captions/renderer";
import type { CaptionBlock, CaptionStyle } from "@/lib/captions/types";
import { cn } from "@/lib/utils";

/**
 * WYSIWYG preview: draws the raw video frame plus captions into a canvas using
 * the exact same renderer the MP4 export uses.
 */
export function CaptionCanvas({
  videoRef,
  blocks,
  style,
  aspect,
  onChangeStyle,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  blocks: CaptionBlock[];
  style: CaptionStyle;
  aspect: number;
  onChangeStyle?: (p: Partial<CaptionStyle>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ blocks, style });
  stateRef.current = { blocks, style };

  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.videoWidth) {
        const H = 720;
        const W = Math.round((video.videoWidth / video.videoHeight) * H);
        if (canvas.width !== W || canvas.height !== H) {
          canvas.width = W;
          canvas.height = H;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(video, 0, 0, W, H);
          drawCaptions(ctx, W, H, video.currentTime, stateRef.current.blocks, stateRef.current.style);
          // Notice: we do NOT draw the watermark on the preview canvas anymore.
          // It is rendered as an HTML overlay below, so it can be interactive.
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  // Watermark interaction logic
  const handlePointerDown = (e: React.PointerEvent, action: 'drag' | 'resize') => {
    if (!onChangeStyle || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    
    if (action === 'drag') setDragging(true);
    else setResizing(true);

    const container = containerRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWX = style.watermarkX ?? 0.04;
    const startWY = style.watermarkY ?? 0.04;
    const startSize = style.watermarkSize ?? 0.1;

    const onMove = (me: PointerEvent) => {
      const dx = (me.clientX - startX) / container.width;
      const dy = (me.clientY - startY) / container.height;

      if (action === 'drag') {
        onChangeStyle({
          watermarkX: Math.max(0, Math.min(1, startWX + dx)),
          watermarkY: Math.max(0, Math.min(1, startWY + dy))
        });
      } else {
        onChangeStyle({
          watermarkSize: Math.max(0.05, Math.min(0.5, startSize + dy))
        });
      }
    };

    const onUp = () => {
      setDragging(false);
      setResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={containerRef}
      className="relative mx-auto h-full overflow-hidden rounded-xl bg-black shadow-[var(--shadow-lift)]"
      style={{ aspectRatio: aspect || 9 / 16 }}
    >
      <canvas ref={canvasRef} className="h-full w-full object-contain" />
      
      {style.watermarkUrl && (
        <div 
          className={cn(
            "absolute group touch-none cursor-move outline-dashed outline-2 outline-transparent hover:outline-primary/50 transition-[outline-color]",
            (dragging || resizing) && "outline-primary"
          )}
          style={{
            left: `${(style.watermarkX ?? 0.04) * 100}%`,
            top: `${(style.watermarkY ?? 0.04) * 100}%`,
            height: `${(style.watermarkSize ?? 0.1) * 100}%`,
            opacity: style.watermarkOpacity ?? 1,
          }}
          onPointerDown={(e) => handlePointerDown(e, 'drag')}
        >
          <img 
            src={style.watermarkUrl} 
            alt="Watermark Overlay" 
            className="h-full w-auto object-contain pointer-events-none" 
          />
          {/* Resize Handle */}
          <div 
            className="absolute -bottom-1 -right-1 w-4 h-4 bg-primary rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity"
            onPointerDown={(e) => handlePointerDown(e, 'resize')}
          />
        </div>
      )}
    </div>
  );
}
