export type CaptionWord = {
  id: string;
  text: string;
  start: number;
  end: number;
};

export type CaptionBlock = {
  id: string;
  start: number;
  end: number;
  words: CaptionWord[];
};

export type CaptionAnimation =
  | "none"
  | "word"
  | "karaoke"
  | "typewriter"
  | "pop"
  | "fade"
  | "shake"
  | "bounce"
  | "slide"
  | "flip";

export type CaptionBlockAnimation = "none" | "pop" | "fade" | "slide" | "zoom";

export type HighlightMode = "color" | "box" | "underline" | "scale";

export type CaptionStyle = {
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  /** font size as a fraction of video height */
  fontSize: number;
  uppercase: boolean;
  letterSpacing: number;
  lineHeight: number;
  textColor: string;
  activeColor: string;
  activeBg: string | null;
  blockBg: string | null;
  /** vertical plate padding as a fraction of video height */
  blockPadding: number;
  /** horizontal plate padding as a fraction of video height */
  blockPaddingX?: number;
  /** horizontal plate padding as a multiple of the vertical padding (default 1.7) */
  blockPaddingXRatio?: number;
  blockRadius: number;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
  animation: CaptionAnimation;
  /** entrance effect used only when a new caption box appears */
  blockAnimation: CaptionBlockAnimation;
  highlight: HighlightMode;
  /** vertical center of the caption block, fraction of height */
  positionY: number;
  maxWidth: number;
  wordsPerBlock: number;
  align: "center" | "left" | "right";
  /** URL to custom uploaded font */
  customFontUrl?: string | null;
  /** Custom font name, used to render when customFontUrl is loaded */
  customFontName?: string | null;
  /** URL to the uploaded logo watermark */
  watermarkUrl?: string | null;
  /** Watermark X position as fraction of video width (0 to 1) */
  watermarkX?: number;
  /** Watermark Y position as fraction of video height (0 to 1) */
  watermarkY?: number;
  /** Watermark opacity */
  watermarkOpacity?: number;
  /** Watermark size (height) as a fraction of video height */
  watermarkSize?: number;
};

export type CaptionPreset = {
  id: string;
  name: string;
  group: "Trending" | "Clean" | "Bold" | "Karaoke" | "Playful" | "Editorial";
  style: CaptionStyle;
};

export type TranscriptLanguage = "en" | "hi" | "hinglish";

export type ExportQuality = "720" | "1080" | "1440";
