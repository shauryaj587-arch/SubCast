import type { CaptionBlock, CaptionStyle } from "./types";

type Line = { words: { text: string; index: number; width: number }[]; width: number };

function fontString(style: CaptionStyle, size: number) {
  const fam = `"${style.fontFamily}", "Inter", sans-serif`;
  return `${style.italic ? "italic " : ""}${style.fontWeight} ${size}px ${fam}`;
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 4);
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const imgCache = new Map<string, HTMLImageElement>();

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  style: CaptionStyle
) {
  if (!style.watermarkUrl) return;

  const url = style.watermarkUrl;
  let img = imgCache.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    imgCache.set(url, img);
  }

  // Only draw if loaded
  if (!img.complete || img.naturalWidth === 0) return;

  const targetHeight = (style.watermarkSize ?? 0.1) * H;
  const ratio = img.naturalWidth / img.naturalHeight;
  const targetWidth = targetHeight * ratio;

  const padding = H * 0.04;
  let x = style.watermarkX !== undefined ? style.watermarkX * W : padding;
  let y = style.watermarkY !== undefined ? style.watermarkY * H : padding;

  ctx.save();
  ctx.globalAlpha = style.watermarkOpacity ?? 1;
  ctx.drawImage(img, x, y, targetWidth, targetHeight);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function activeBlock(blocks: CaptionBlock[], time: number): CaptionBlock | null {
  for (const b of blocks) {
    if (time >= b.start && time <= b.end) return b;
  }
  return null;
}

function getFillStyle(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): string | CanvasGradient {
  if (!color || !color.startsWith("linear-gradient")) return color;
  
  const match = color.match(/linear-gradient\([^,]+,\s*(#[a-fA-F0-9]{6}),\s*(#[a-fA-F0-9]{6})\)/);
  if (!match) return color;
  
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, match[1]!);
  grad.addColorStop(1, match[2]!);
  return grad;
}

/**
 * Draws the caption block for `time` onto a canvas of size W x H.
 * The exact same function powers both the live preview and the MP4 export,
 * so what you see is what you get.
 */
export function drawCaptions(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  time: number,
  blocks: CaptionBlock[],
  style: CaptionStyle,
) {
  const block = activeBlock(blocks, time);
  if (!block || block.words.length === 0) return;

  const size = style.fontSize * H;
  const spaceExtra = style.letterSpacing * size;
  const lineHeight = size * style.lineHeight;
  const maxWidth = style.maxWidth * W;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = fontString(style, size);

  const texts = block.words.map((w) =>
    style.uppercase ? w.text.toLocaleUpperCase() : w.text,
  );
  const widths = texts.map((t) => ctx.measureText(t).width + spaceExtra * (t.length - 1));
  const spaceW = ctx.measureText(" ").width + spaceExtra;

  // wrap
  const lines: Line[] = [];
  let cur: Line = { words: [], width: 0 };
  texts.forEach((t, i) => {
    const w = widths[i] ?? 0;
    const add = cur.words.length ? spaceW + w : w;
    if (cur.words.length && cur.width + add > maxWidth) {
      lines.push(cur);
      cur = { words: [], width: 0 };
      cur.words.push({ text: t, index: i, width: w });
      cur.width = w;
    } else {
      cur.words.push({ text: t, index: i, width: w });
      cur.width += add;
    }
  });
  if (cur.words.length) lines.push(cur);

  const totalH = lines.length * lineHeight;
  const centerY = style.positionY * H;
  const top = centerY - totalH / 2;

  // Block entrance is independent from the active-word animation.
  const inProgress = clamp01((time - block.start) / 0.3);
  const entrance = easeOut(inProgress);
  const outro = clamp01((block.end - time) / 0.2);
  let blockAlpha = 1;
  let blockOffsetY = 0;
  let blockScale = 1;
  switch (style.blockAnimation) {
    case "fade":
      blockAlpha = entrance;
      break;
    case "pop":
      blockScale = 0.82 + entrance * 0.18;
      break;
    case "slide":
      blockOffsetY = (1 - entrance) * size * 0.7;
      blockAlpha = entrance;
      break;
    case "zoom":
      blockScale = 0.94 + entrance * 0.06;
      blockAlpha = entrance;
      break;
    case "none":
      break;
  }
  
  // Smoothly fade out the block before it disappears (only if animation is not 'none')
  if (style.blockAnimation !== "none") {
    blockAlpha *= outro;
  }

  ctx.globalAlpha = blockAlpha;
  if (blockScale !== 1) {
    ctx.translate(W / 2, centerY);
    ctx.scale(blockScale, blockScale);
    ctx.translate(-W / 2, -centerY);
  }

  // background plate — must wrap the *drawn* text box exactly.
  // Text ink for a line sits between (lineTop + ascent gap) and its baseline;
  // baselines are at top + li*lineHeight + size*0.78, so the visual text block
  // spans [top, top + totalH]. Pad symmetrically around that.
  if (style.blockBg) {
    const padY = style.blockPadding * H;
    const padX = (style.blockPaddingX ?? style.blockPadding * (style.blockPaddingXRatio ?? 1.7)) * H;
    const widest = Math.max(...lines.map((l) => l.width));
    const bx = (W - widest) / 2 - padX;
    const by = top - padY + blockOffsetY;
    ctx.fillStyle = getFillStyle(ctx, style.blockBg, bx, by, widest + padX * 2, totalH + padY * 2);
    roundRect(
      ctx,
      bx,
      by,
      widest + padX * 2,
      totalH + padY * 2,
      style.blockRadius * H,
    );
    ctx.fill();
  }

  lines.forEach((line, li) => {
    // Add 0.12 * size to baseY to perfectly visually center it inside the mathematical box
    const baseY = top + li * lineHeight + size * 0.90 + blockOffsetY;

    let x =
      style.align === "left"
        ? (W - maxWidth) / 2
        : style.align === "right"
          ? (W + maxWidth) / 2 - line.width
          : (W - line.width) / 2;

    for (const item of line.words) {
      const word = block.words[item.index];
      if (!word) continue;
      // Highlight only during this word. Holding until the next word made the
      // UI visibly one word behind whenever there was an intra-line pause.
      const next = block.words[item.index + 1];
      const activeEnd = next ? Math.min(word.end, next.start) : word.end;
      drawWord(ctx, {
        text: item.text,
        width: item.width,
        x,
        y: baseY,
        size,
        spaceExtra,
        style,
        time,
        word,
        activeEnd,
        blockAlpha,
      });
      x += item.width + spaceW;
    }
  });

  ctx.restore();
}

function letterSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spaceExtra: number,
  mode: "fill" | "stroke",
) {
  if (spaceExtra === 0) {
    if (mode === "fill") ctx.fillText(text, x, y);
    else ctx.strokeText(text, x, y);
    return;
  }
  let cx = x;
  for (const ch of text) {
    if (mode === "fill") ctx.fillText(ch, cx, y);
    else ctx.strokeText(ch, cx, y);
    cx += ctx.measureText(ch).width + spaceExtra;
  }
}

function drawWord(
  ctx: CanvasRenderingContext2D,
  o: {
    text: string;
    width: number;
    x: number;
    y: number;
    size: number;
    spaceExtra: number;
    style: CaptionStyle;
    time: number;
    word: { start: number; end: number };
    activeEnd: number;
    blockAlpha: number;
  },
) {
  const { style, time, word, size } = o;
  const dur = Math.max(0.08, word.end - word.start);
  const wp = clamp01((time - word.start) / dur);
  const isActive = time >= word.start && time <= o.activeEnd;
  const spoken = time >= word.start;

  let text = o.text;
  let alpha = 1;
  let scale = 1;
  let dx = 0;
  let dy = 0;
  let rotX = 1;
  let color = style.textColor;
  let clipRatio = 1;

  switch (style.animation) {
    case "none":
      break;
    case "word":
      if (isActive || (spoken && style.highlight === "color" && false)) color = style.activeColor;
      if (isActive && style.highlight === "scale") scale = 1.08;
      break;
    case "karaoke":
      if (spoken) {
        color = style.activeColor;
        clipRatio = isActive ? easeOut(wp) : 1;
      }
      break;
    case "typewriter": {
      if (!spoken) return;
      if (isActive) {
        const chars = Math.max(1, Math.round(o.text.length * clamp01(wp * 1.25)));
        text = o.text.slice(0, chars);
      }
      break;
    }
    case "fade":
      alpha = spoken ? 1 : 0.28;
      if (isActive) color = style.activeColor;
      break;
    case "pop":
      if (isActive) {
        color = style.activeColor;
        scale = 1 + 0.16 * (1 - easeOut(clamp01(wp * 3)));
      }
      break;
    case "shake":
      if (isActive) {
        color = style.activeColor;
        const k = Math.min(1, 1 - wp * 0.8);
        dx = Math.sin(time * 62) * size * 0.035 * k;
        dy = Math.cos(time * 51) * size * 0.03 * k;
        scale = 1 + 0.06 * k;
      }
      break;
    case "bounce":
      if (isActive) {
        color = style.activeColor;
        dy = -Math.abs(Math.sin(clamp01(wp) * Math.PI)) * size * 0.22;
      }
      break;
    case "slide":
      if (isActive) color = style.activeColor;
      break;
    case "flip":
      if (isActive) color = style.activeColor;
      if (spoken && wp < 0.35) rotX = Math.max(0.06, Math.sin((wp / 0.35) * (Math.PI / 2)));
      break;
  }

  const cx = o.x + o.width / 2 + dx;
  const cy = o.y + dy;

  ctx.save();
  ctx.globalAlpha = o.blockAlpha * alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale * rotX);
  ctx.translate(-cx, -cy);

  const drawX = o.x + dx;
  const drawY = o.y + dy;

  // active highlight box / underline
  if (isActive && style.highlight === "box" && style.activeBg) {
    const pad = size * 0.16;
    ctx.fillStyle = getFillStyle(ctx, style.activeBg, drawX - pad * 0.8, drawY - size * 0.90, o.width + pad * 1.6, size * 1.1);
    roundRect(
      ctx,
      drawX - pad * 0.8,
      drawY - size * 0.90,
      o.width + pad * 1.6,
      size * 1.1,
      size * 0.16,
    );
    ctx.fill();
  }
  if (isActive && style.highlight === "underline") {
    ctx.fillStyle = getFillStyle(ctx, style.activeColor, drawX, drawY + size * 0.16, o.width, size * 0.09);
    const h = size * 0.09;
    roundRect(ctx, drawX, drawY + size * 0.16, o.width * easeOut(clamp01(wp * 2)), h, h / 2);
    ctx.fill();
  }

  if (style.shadowBlur > 0) {
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = style.shadowBlur * size;
    ctx.shadowOffsetY = style.shadowOffsetY * size;
  }

  if (style.strokeWidth > 0) {
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = style.strokeWidth * size;
    ctx.strokeStyle = style.strokeColor;
    letterSpacedText(ctx, text, drawX, drawY, o.spaceExtra, "stroke");
  }
  ctx.shadowBlur = style.strokeWidth > 0 ? 0 : ctx.shadowBlur;

  if (clipRatio < 1) {
    // base color under the sweep
    ctx.fillStyle = getFillStyle(ctx, style.textColor, drawX, drawY - size * 0.8, o.width, size);
    letterSpacedText(ctx, text, drawX, drawY, o.spaceExtra, "fill");
    ctx.save();
    ctx.beginPath();
    ctx.rect(drawX - size * 0.2, drawY - size * 1.1, o.width * clipRatio + size * 0.2, size * 1.6);
    ctx.clip();
    ctx.fillStyle = getFillStyle(ctx, color, drawX, drawY - size * 0.8, o.width, size);
    letterSpacedText(ctx, text, drawX, drawY, o.spaceExtra, "fill");
    ctx.restore();
  } else {
    ctx.fillStyle = getFillStyle(ctx, color, drawX, drawY - size * 0.8, o.width, size);
    letterSpacedText(ctx, text, drawX, drawY, o.spaceExtra, "fill");
  }

  ctx.restore();
}
