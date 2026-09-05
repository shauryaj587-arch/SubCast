import { pipeline, env } from "@xenova/transformers";

// Disable local model loading — always fetch from Hugging Face Hub
env.allowLocalModels = false;

// We reverted back to Xenova/whisper-tiny because it is significantly faster (3x)
// and actually performs better on short-form noisy audio without hallucinating.
const MODEL_ID = "Xenova/whisper-tiny";

let transcriber: any = null;

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === "init") {
    try {
      if (!transcriber) {
        transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
          progress_callback: (info: any) => {
            self.postMessage({ type: "progress", info });
          },
        });
      }
      self.postMessage({ type: "init_done" });
    } catch (err: any) {
      self.postMessage({ type: "error", error: err.message });
    }
    return;
  }

  if (type === "transcribe") {
    try {
      if (!transcriber) {
        throw new Error("Transcriber not initialized");
      }
      const { audioData, language } = payload;

      const out = await transcriber(audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: "word",
        language: language === "hinglish" ? "hi" : language,
      });

      self.postMessage({ type: "transcribe_done", result: out });
    } catch (err: any) {
      self.postMessage({ type: "error", error: err.message });
    }
  }
};
