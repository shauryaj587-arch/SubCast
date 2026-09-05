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
};

export type CaptionPreset = {
  id: string;
  name: string;
  group: "Trending" | "Clean" | "Bold" | "Karaoke" | "Playful" | "Editorial";
  style: CaptionStyle;
};

export type TranscriptLanguage = "en" | "hi" | "hinglish";

export type ExportQuality = "720" | "1080" | "1440";
