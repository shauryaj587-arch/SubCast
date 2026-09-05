import { useEffect, useRef } from "react";
import { drawCaptions } from "@/lib/captions/renderer";
import type { CaptionBlock, CaptionStyle } from "@/lib/captions/types";

/**
 * WYSIWYG preview: draws the raw video frame plus captions into a canvas using
 * the exact same renderer the MP4 export uses.
 */
export function CaptionCanvas({
  videoRef,
  blocks,
  style,
  aspect,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  blocks: CaptionBlock[];
  style: CaptionStyle;
  aspect: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ blocks, style });
  stateRef.current = { blocks, style };

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
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  return (
    <div
      className="relative mx-auto h-full overflow-hidden rounded-xl bg-black shadow-[var(--shadow-lift)]"
      style={{ aspectRatio: aspect || 9 / 16 }}
    >
      <canvas ref={canvasRef} className="h-full w-full object-contain" />
    </div>
  );
}
